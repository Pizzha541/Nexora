use super::DeviceError;
use crate::models::{DeviceMode, DeviceStatus};
use hidapi::HidApi;
use serde::Serialize;
use std::time::{Duration, Instant};

pub const VENDOR_ID: u16 = 0x3282;
pub const PRODUCT_ID: u16 = 0x0009;
pub const PROTOCOL_ICON_SIZE: usize = 102;

pub struct MountainDisplayPad;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ButtonEvent {
    pub key: u8,
    pub pressed: bool,
    pub timestamp_ms: u64,
    pub raw_offset_42: u8,
    pub raw_offset_47: u8,
}

impl MountainDisplayPad {
    pub fn detect() -> Result<DeviceStatus, DeviceError> {
        debug_assert_eq!(PROTOCOL_ICON_SIZE * PROTOCOL_ICON_SIZE * 3, 31_212);
        let api = HidApi::new().map_err(|error| DeviceError::Hid(error.to_string()))?;
        let interfaces = api
            .device_list()
            .filter(|device| device.vendor_id() == VENDOR_ID && device.product_id() == PRODUCT_ID)
            .collect::<Vec<_>>();
        if interfaces.is_empty() {
            return Err(DeviceError::NotFound);
        }
        let has_control = interfaces
            .iter()
            .any(|device| device.interface_number() == 3);
        let has_display = interfaces
            .iter()
            .any(|device| device.interface_number() == 1);
        let detail = if has_control && has_display {
            None
        } else {
            Some("Detectado, pero faltan las interfaces HID 1/3 esperadas".to_owned())
        };
        Ok(DeviceStatus {
            connected: has_control && has_display,
            mode: DeviceMode::Hardware,
            name: "Mountain DisplayPad".to_owned(),
            vendor_id: Some(VENDOR_ID),
            product_id: Some(PRODUCT_ID),
            last_error: detail,
        })
    }

    pub fn listen_button_events(duration_ms: u64) -> Result<Vec<ButtonEvent>, DeviceError> {
        let duration_ms = duration_ms.clamp(1_000, 30_000);
        let api = HidApi::new().map_err(|error| DeviceError::Hid(error.to_string()))?;
        let control_path = api
            .device_list()
            .find(|device| {
                device.vendor_id() == VENDOR_ID
                    && device.product_id() == PRODUCT_ID
                    && device.interface_number() == 3
            })
            .map(|device| device.path().to_owned())
            .ok_or(DeviceError::NotFound)?;
        let control = api
            .open_path(&control_path)
            .map_err(|error| DeviceError::Hid(error.to_string()))?;

        let started = Instant::now();
        let deadline = started + Duration::from_millis(duration_ms);
        let mut key_state = [false; 13];
        let mut events = Vec::new();
        let mut report = [0_u8; 64];

        while Instant::now() < deadline && events.len() < 256 {
            let bytes_read = control
                .read_timeout(&mut report, 100)
                .map_err(|error| DeviceError::Hid(error.to_string()))?;
            if bytes_read > 47 && report[0] == 0x01 {
                decode_button_changes(
                    &report[..bytes_read],
                    &mut key_state,
                    started.elapsed().as_millis() as u64,
                    &mut events,
                );
            }
        }
        Ok(events)
    }
}

fn decode_button_changes(
    report: &[u8],
    key_state: &mut [bool; 13],
    timestamp_ms: u64,
    events: &mut Vec<ButtonEvent>,
) {
    let raw_42 = report[42];
    let raw_47 = report[47];
    let mappings = [
        (1, raw_42 & 0x02 != 0),
        (2, raw_42 & 0x04 != 0),
        (3, raw_42 & 0x08 != 0),
        (4, raw_42 & 0x10 != 0),
        (5, raw_42 & 0x20 != 0),
        (6, raw_42 & 0x40 != 0),
        (7, raw_42 & 0x80 != 0),
        (8, raw_47 & 0x01 != 0),
        (9, raw_47 & 0x02 != 0),
        (10, raw_47 & 0x04 != 0),
        (11, raw_47 & 0x08 != 0),
        (12, raw_47 & 0x10 != 0),
    ];
    for (key, pressed) in mappings {
        if key_state[key] != pressed {
            key_state[key] = pressed;
            events.push(ButtonEvent {
                key: key as u8,
                pressed,
                timestamp_ms,
                raw_offset_42: raw_42,
                raw_offset_47: raw_47,
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn protocol_dimensions_match_observed_library() {
        assert_eq!(PROTOCOL_ICON_SIZE * PROTOCOL_ICON_SIZE * 3, 31_212);
    }

    #[test]
    fn decodes_press_and_release_without_writing() {
        let mut state = [false; 13];
        let mut events = Vec::new();
        let mut pressed = [0_u8; 64];
        pressed[0] = 0x01;
        pressed[42] = 0x02;
        pressed[47] = 0x01;
        decode_button_changes(&pressed, &mut state, 10, &mut events);
        assert_eq!(
            events.iter().map(|event| event.key).collect::<Vec<_>>(),
            vec![1, 8]
        );
        assert!(events.iter().all(|event| event.pressed));

        let mut released = [0_u8; 64];
        released[0] = 0x01;
        decode_button_changes(&released, &mut state, 20, &mut events);
        assert_eq!(events[2].key, 1);
        assert!(!events[2].pressed);
        assert_eq!(events[3].key, 8);
        assert!(!events[3].pressed);
    }
}
