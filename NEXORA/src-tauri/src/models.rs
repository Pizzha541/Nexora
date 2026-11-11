use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use uuid::Uuid;

pub const KEY_COUNT: usize = 12;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DeviceMode {
    Hardware,
    Simulation,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceStatus {
    pub connected: bool,
    pub mode: DeviceMode,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vendor_id: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub product_id: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum KeyAction {
    #[default]
    None,
    Hotkey {
        value: String,
        #[serde(default)]
        modifiers: Vec<String>,
    },
    OpenUrl {
        value: String,
    },
    LaunchPath {
        value: String,
    },
    Text {
        value: String,
    },
    Media {
        value: String,
    },
    Profile {
        value: String,
    },
    Folder {
        value: String,
    },
    Macro {
        value: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyConfig {
    pub index: usize,
    pub name: String,
    pub color: String,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_path: Option<String>,
    #[serde(default)]
    pub animated: bool,
    #[serde(default)]
    pub actions: Vec<KeyAction>,
}

impl KeyConfig {
    pub fn new(index: usize) -> Self {
        const COLORS: [&str; 4] = ["#8b5cf6", "#6d28d9", "#4c1d95", "#7c3aed"];
        Self {
            index,
            name: format!("Tecla {}", index + 1),
            color: COLORS[index % COLORS.len()].to_owned(),
            text: (index + 1).to_string(),
            icon_path: None,
            animated: false,
            actions: vec![KeyAction::None],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: Uuid,
    pub name: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub automatic_app: Option<String>,
    pub keys: Vec<KeyConfig>,
    #[serde(default)]
    pub folders: Vec<FolderNode>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderNode {
    pub id: Uuid,
    pub name: String,
    pub keys: Vec<KeyConfig>,
    #[serde(default)]
    pub children: Vec<FolderNode>,
}

impl Profile {
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            id: Uuid::new_v4(),
            name: name.into(),
            description: "Perfil local de NEXORA".to_owned(),
            automatic_app: None,
            keys: (0..KEY_COUNT).map(KeyConfig::new).collect(),
            folders: Vec::new(),
            updated_at: Utc::now(),
        }
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.name.trim().is_empty() {
            return Err("El perfil necesita un nombre".to_owned());
        }
        if self.keys.len() != KEY_COUNT {
            return Err(format!(
                "El perfil debe contener exactamente {KEY_COUNT} teclas"
            ));
        }
        for (expected, key) in self.keys.iter().enumerate() {
            if key.index != expected {
                return Err("Los índices de teclas deben ser únicos y consecutivos".to_owned());
            }
            if !is_hex_color(&key.color) {
                return Err(format!("Color no válido en la tecla {}", expected + 1));
            }
        }
        let mut ids = HashSet::new();
        validate_folders(&self.folders, 1, &mut ids)?;
        Ok(())
    }
}

fn validate_folders(
    folders: &[FolderNode],
    depth: usize,
    ids: &mut HashSet<Uuid>,
) -> Result<(), String> {
    if depth > 8 {
        return Err("Las carpetas no pueden superar ocho niveles".to_owned());
    }
    for folder in folders {
        if folder.name.trim().is_empty() {
            return Err("Cada carpeta necesita un nombre".to_owned());
        }
        if !ids.insert(folder.id) {
            return Err("Se encontró un identificador de carpeta duplicado".to_owned());
        }
        if folder.keys.len() != KEY_COUNT {
            return Err(format!(
                "La carpeta {} debe contener doce teclas",
                folder.name
            ));
        }
        for (expected, key) in folder.keys.iter().enumerate() {
            if key.index != expected || !is_hex_color(&key.color) {
                return Err(format!(
                    "Configuración de tecla inválida en {}",
                    folder.name
                ));
            }
        }
        validate_folders(&folder.children, depth + 1, ids)?;
    }
    Ok(())
}

fn is_hex_color(value: &str) -> bool {
    value.len() == 7
        && value.starts_with('#')
        && value[1..]
            .chars()
            .all(|character| character.is_ascii_hexdigit())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MacroStep {
    pub delay_ms: u64,
    pub action: KeyAction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MacroDefinition {
    pub id: Uuid,
    pub name: String,
    pub repetitions: u16,
    pub steps: Vec<MacroStep>,
}

impl MacroDefinition {
    pub fn validate(&self) -> Result<(), String> {
        if self.name.trim().is_empty() || self.steps.is_empty() {
            return Err("La macro necesita nombre y al menos un paso".to_owned());
        }
        if self.repetitions == 0 || self.repetitions > 100 {
            return Err("Las repeticiones deben estar entre 1 y 100".to_owned());
        }
        if self.steps.len() > 500 || self.steps.iter().any(|step| step.delay_ms > 60_000) {
            return Err("La macro excede los límites de seguridad".to_owned());
        }
        Ok(())
    }
}

#[cfg(test)]
mod profile_tests {
    use super::*;

    fn folder(name: &str) -> FolderNode {
        FolderNode {
            id: Uuid::new_v4(),
            name: name.to_owned(),
            keys: (0..KEY_COUNT).map(KeyConfig::new).collect(),
            children: Vec::new(),
        }
    }

    #[test]
    fn validates_nested_folders_and_rejects_duplicate_ids() {
        let mut profile = Profile::new("Carpetas");
        let child = folder("Hija");
        let mut parent = folder("Padre");
        parent.children.push(child.clone());
        profile.folders.push(parent);
        assert!(profile.validate().is_ok());
        profile.folders.push(child);
        assert!(profile.validate().is_err());
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntegrationState {
    pub id: String,
    pub name: String,
    pub status: String,
    pub detail: String,
    pub priority: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VisualAsset {
    pub id: String,
    pub name: String,
    pub mime_type: String,
    pub file_name: String,
    pub size_bytes: u64,
    pub animated: bool,
    pub imported_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VisualSettings {
    pub initial_screen_enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub initial_asset_id: Option<String>,
    pub initial_duration_seconds: u32,
    pub panoramic: bool,
    pub fit: String,
    pub screensaver_enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub screensaver_asset_id: Option<String>,
    pub screensaver_idle_seconds: u32,
}

impl Default for VisualSettings {
    fn default() -> Self {
        Self {
            initial_screen_enabled: false,
            initial_asset_id: None,
            initial_duration_seconds: 5,
            panoramic: false,
            fit: "cover".to_owned(),
            screensaver_enabled: false,
            screensaver_asset_id: None,
            screensaver_idle_seconds: 300,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapState {
    pub version: String,
    pub active_profile_id: Uuid,
    pub profiles: Vec<Profile>,
    pub macros: Vec<MacroDefinition>,
    pub device: DeviceStatus,
    pub integrations: Vec<IntegrationState>,
    pub assets: Vec<VisualAsset>,
    pub visual_settings: VisualSettings,
    pub updater_configured: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub startup_warning: Option<String>,
}
