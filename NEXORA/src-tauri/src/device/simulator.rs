use super::{DeviceBackend, DeviceError};
use crate::models::{DeviceMode, DeviceStatus, KeyConfig, KEY_COUNT};

pub struct SimulatorDevice {
    keys: Vec<KeyConfig>,
}

impl SimulatorDevice {
    pub fn new() -> Self {
        Self {
            keys: (0..KEY_COUNT).map(KeyConfig::new).collect(),
        }
    }
}

impl DeviceBackend for SimulatorDevice {
    fn status(&self) -> DeviceStatus {
        DeviceStatus {
            connected: true,
            mode: DeviceMode::Simulation,
            name: "DisplayPad simulado".to_owned(),
            vendor_id: None,
            product_id: None,
            last_error: None,
        }
    }

    fn apply_key(&mut self, key: &KeyConfig) -> Result<(), DeviceError> {
        if key.index >= KEY_COUNT {
            return Err(DeviceError::Hid(
                "Índice de tecla fuera de rango".to_owned(),
            ));
        }
        self.keys[key.index] = key.clone();
        Ok(())
    }
}
