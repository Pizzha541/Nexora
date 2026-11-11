mod mountain;
mod simulator;

use crate::models::{DeviceMode, DeviceStatus, KeyConfig};
pub use mountain::ButtonEvent;
use mountain::MountainDisplayPad;
use parking_lot::Mutex;
use simulator::SimulatorDevice;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum DeviceError {
    #[error("DisplayPad no encontrado")]
    NotFound,
    #[error("Error HID: {0}")]
    Hid(String),
    #[error("La escritura física está bloqueada hasta validar el protocolo con el dispositivo")]
    PhysicalWriteNotValidated,
}

pub trait DeviceBackend: Send + Sync {
    fn status(&self) -> DeviceStatus;
    fn apply_key(&mut self, key: &KeyConfig) -> Result<(), DeviceError>;
}

pub struct DeviceManager {
    mode: DeviceMode,
    simulator: Mutex<SimulatorDevice>,
    hardware_status: Option<DeviceStatus>,
}

impl DeviceManager {
    pub fn new(mode: DeviceMode) -> Self {
        Self {
            mode,
            simulator: Mutex::new(SimulatorDevice::new()),
            hardware_status: None,
        }
    }

    pub fn status(&self) -> DeviceStatus {
        match self.mode {
            DeviceMode::Simulation => self.simulator.lock().status(),
            DeviceMode::Hardware => self
                .hardware_status
                .clone()
                .unwrap_or_else(|| DeviceStatus {
                    connected: false,
                    mode: DeviceMode::Hardware,
                    name: "Mountain DisplayPad".to_owned(),
                    vendor_id: Some(mountain::VENDOR_ID),
                    product_id: Some(mountain::PRODUCT_ID),
                    last_error: Some(
                        "Detección en pausa para proteger el arranque. Pulsa «Volver a detectar»."
                            .to_owned(),
                    ),
                }),
        }
    }

    pub fn refresh(&mut self) -> DeviceStatus {
        if self.mode == DeviceMode::Simulation {
            return self.status();
        }
        let status = MountainDisplayPad::detect().unwrap_or_else(|error| DeviceStatus {
            connected: false,
            mode: DeviceMode::Hardware,
            name: "Mountain DisplayPad".to_owned(),
            vendor_id: Some(mountain::VENDOR_ID),
            product_id: Some(mountain::PRODUCT_ID),
            last_error: Some(error.to_string()),
        });
        self.hardware_status = Some(status.clone());
        status
    }

    pub fn set_mode(&mut self, mode: DeviceMode) -> DeviceStatus {
        self.mode = mode;
        self.hardware_status = None;
        self.status()
    }

    pub fn is_hardware(&self) -> bool {
        self.mode == DeviceMode::Hardware
    }

    pub fn listen_button_events(duration_ms: u64) -> Result<Vec<ButtonEvent>, DeviceError> {
        MountainDisplayPad::listen_button_events(duration_ms)
    }

    pub fn apply_key(&mut self, key: &KeyConfig) -> Result<(), DeviceError> {
        match self.mode {
            DeviceMode::Simulation => self.simulator.lock().apply_key(key),
            DeviceMode::Hardware => Err(DeviceError::PhysicalWriteNotValidated),
        }
    }
}
