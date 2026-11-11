use crate::models::{DeviceMode, MacroDefinition, Profile, VisualAsset, VisualSettings};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use directories::ProjectDirs;
use parking_lot::RwLock;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
};
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum StorageError {
    #[error("No se pudo determinar la carpeta de datos de Windows")]
    MissingDataDirectory,
    #[error("Error de archivos: {0}")]
    Io(#[from] std::io::Error),
    #[error("Datos JSON no válidos: {0}")]
    Json(#[from] serde_json::Error),
    #[error("{0}")]
    Validation(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsData {
    pub active_profile_id: Uuid,
    pub device_mode: DeviceMode,
    #[serde(default)]
    pub github_owner: String,
    #[serde(default)]
    pub github_repository: String,
    #[serde(default)]
    pub updater_public_key: String,
    #[serde(default)]
    pub visual_settings: VisualSettings,
}

#[derive(Debug, Clone)]
pub struct RepositoryData {
    pub settings: SettingsData,
    pub profiles: Vec<Profile>,
    pub macros: Vec<MacroDefinition>,
    pub assets: Vec<VisualAsset>,
}

pub struct Storage {
    root: PathBuf,
    pub data: RwLock<RepositoryData>,
}

impl Storage {
    pub fn open_default() -> Result<Self, StorageError> {
        let dirs = ProjectDirs::from("com", "Nexora", "NEXORA")
            .ok_or(StorageError::MissingDataDirectory)?;
        Self::open(dirs.data_local_dir().to_owned())
    }

    pub fn open(root: PathBuf) -> Result<Self, StorageError> {
        fs::create_dir_all(root.join("profiles"))?;
        fs::create_dir_all(root.join("macros"))?;
        fs::create_dir_all(root.join("assets"))?;
        fs::create_dir_all(root.join("backups"))?;

        let profile_files = fs::read_dir(root.join("profiles"))?
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|path| path.extension().and_then(|ext| ext.to_str()) == Some("json"))
            .collect::<Vec<_>>();
        let mut profiles = profile_files
            .iter()
            .filter_map(|path| read_json::<Profile>(path).ok())
            .collect::<Vec<_>>();
        let created_default_profile = profiles.is_empty();
        if created_default_profile {
            profiles.push(Profile::new("Perfil principal"));
        }
        let macro_files = fs::read_dir(root.join("macros"))?
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|path| path.extension().and_then(|ext| ext.to_str()) == Some("json"))
            .collect::<Vec<_>>();
        let macros = macro_files
            .iter()
            .filter_map(|path| read_json::<MacroDefinition>(path).ok())
            .collect::<Vec<_>>();
        let assets_path = root.join("assets").join("index.json");
        let assets = read_json::<Vec<VisualAsset>>(&assets_path)
            .unwrap_or_default()
            .into_iter()
            .filter(|asset| root.join("assets").join(&asset.file_name).is_file())
            .collect::<Vec<_>>();

        let settings_path = root.join("settings.json");
        let settings_result = read_json::<SettingsData>(&settings_path);
        let mut settings_need_write = settings_result.is_err();
        let mut settings = settings_result.unwrap_or_else(|_| SettingsData {
            active_profile_id: profiles[0].id,
            device_mode: DeviceMode::Simulation,
            github_owner: String::new(),
            github_repository: String::new(),
            updater_public_key: String::new(),
            visual_settings: VisualSettings::default(),
        });
        if !profiles
            .iter()
            .any(|profile| profile.id == settings.active_profile_id)
        {
            settings.active_profile_id = profiles[0].id;
            settings_need_write = true;
        }
        let storage = Self {
            root,
            data: RwLock::new(RepositoryData {
                settings,
                profiles,
                macros,
                assets,
            }),
        };
        if settings_need_write {
            atomic_json(
                &storage.root.join("settings.json"),
                &storage.data.read().settings,
                &storage.root.join("backups"),
            )?;
        }
        if created_default_profile {
            let profile = storage.data.read().profiles[0].clone();
            atomic_json(
                &storage.profile_path(profile.id),
                &profile,
                &storage.root.join("backups"),
            )?;
        }
        Ok(storage)
    }

    #[cfg(test)]
    pub fn persist_all(&self) -> Result<(), StorageError> {
        let data = self.data.read().clone();
        atomic_json(
            &self.root.join("settings.json"),
            &data.settings,
            &self.root.join("backups"),
        )?;
        for profile in data.profiles {
            atomic_json(
                &self.profile_path(profile.id),
                &profile,
                &self.root.join("backups"),
            )?;
        }
        for macro_definition in data.macros {
            atomic_json(
                &self.macro_path(macro_definition.id),
                &macro_definition,
                &self.root.join("backups"),
            )?;
        }
        atomic_json(
            &self.root.join("assets").join("index.json"),
            &data.assets,
            &self.root.join("backups"),
        )?;
        Ok(())
    }

    pub fn import_asset(
        &self,
        name: String,
        mime_type: String,
        base64_data: String,
    ) -> Result<VisualAsset, StorageError> {
        let extension = match mime_type.as_str() {
            "image/png" => "png",
            "image/jpeg" => "jpg",
            "image/webp" => "webp",
            "image/gif" => "gif",
            _ => {
                return Err(StorageError::Validation(
                    "Formato no admitido. Usa PNG, JPG, WEBP o GIF".to_owned(),
                ))
            }
        };
        let bytes = BASE64.decode(base64_data).map_err(|_| {
            StorageError::Validation("El recurso no contiene Base64 válido".to_owned())
        })?;
        if bytes.is_empty() || bytes.len() > 12 * 1024 * 1024 {
            return Err(StorageError::Validation(
                "El recurso debe pesar entre 1 byte y 12 MB".to_owned(),
            ));
        }
        if !valid_image_signature(&bytes, extension) {
            return Err(StorageError::Validation(
                "El contenido del archivo no coincide con su formato de imagen".to_owned(),
            ));
        }
        let id = format!("{:x}", Sha256::digest(&bytes));
        if let Some(existing) = self
            .data
            .read()
            .assets
            .iter()
            .find(|asset| asset.id == id)
            .cloned()
        {
            return Ok(existing);
        }
        let file_name = format!("{id}.{extension}");
        fs::write(self.root.join("assets").join(&file_name), &bytes)?;
        let asset = VisualAsset {
            id,
            name: name.trim().chars().take(120).collect::<String>(),
            mime_type,
            file_name,
            size_bytes: bytes.len() as u64,
            animated: extension == "gif",
            imported_at: chrono::Utc::now(),
        };
        let assets = {
            let mut data = self.data.write();
            data.assets.push(asset.clone());
            data.assets.clone()
        };
        atomic_json(
            &self.root.join("assets").join("index.json"),
            &assets,
            &self.root.join("backups"),
        )?;
        Ok(asset)
    }

    pub fn asset_data_url(&self, asset_id: &str) -> Result<String, StorageError> {
        let asset = self
            .data
            .read()
            .assets
            .iter()
            .find(|asset| asset.id == asset_id)
            .cloned()
            .ok_or_else(|| StorageError::Validation("El recurso visual no existe".to_owned()))?;
        let bytes = fs::read(self.root.join("assets").join(asset.file_name))?;
        Ok(format!(
            "data:{};base64,{}",
            asset.mime_type,
            BASE64.encode(bytes)
        ))
    }

    pub fn save_visual_settings(
        &self,
        visual_settings: VisualSettings,
    ) -> Result<VisualSettings, StorageError> {
        if !(1..=3600).contains(&visual_settings.initial_duration_seconds)
            || !(30..=86_400).contains(&visual_settings.screensaver_idle_seconds)
            || !matches!(visual_settings.fit.as_str(), "cover" | "contain")
        {
            return Err(StorageError::Validation(
                "Configuración visual fuera de los límites permitidos".to_owned(),
            ));
        }
        let settings = {
            let mut data = self.data.write();
            data.settings.visual_settings = visual_settings.clone();
            data.settings.clone()
        };
        atomic_json(
            &self.root.join("settings.json"),
            &settings,
            &self.root.join("backups"),
        )?;
        Ok(visual_settings)
    }

    pub fn save_profile(&self, mut profile: Profile) -> Result<Profile, StorageError> {
        profile.validate().map_err(StorageError::Validation)?;
        profile.updated_at = chrono::Utc::now();
        {
            let mut data = self.data.write();
            if let Some(existing) = data.profiles.iter_mut().find(|item| item.id == profile.id) {
                *existing = profile.clone();
            } else {
                data.profiles.push(profile.clone());
            }
        }
        atomic_json(
            &self.profile_path(profile.id),
            &profile,
            &self.root.join("backups"),
        )?;
        Ok(profile)
    }

    pub fn set_active_profile(&self, id: Uuid) -> Result<(), StorageError> {
        let settings = {
            let mut data = self.data.write();
            if !data.profiles.iter().any(|profile| profile.id == id) {
                return Err(StorageError::Validation(
                    "El perfil indicado no existe".to_owned(),
                ));
            }
            data.settings.active_profile_id = id;
            data.settings.clone()
        };
        atomic_json(
            &self.root.join("settings.json"),
            &settings,
            &self.root.join("backups"),
        )
    }

    pub fn duplicate_profile(&self, id: Uuid) -> Result<Profile, StorageError> {
        let mut duplicate = {
            let data = self.data.read();
            data.profiles
                .iter()
                .find(|profile| profile.id == id)
                .cloned()
                .ok_or_else(|| {
                    StorageError::Validation("El perfil indicado no existe".to_owned())
                })?
        };
        duplicate.id = Uuid::new_v4();
        duplicate.name = format!("{} (copia)", duplicate.name);
        duplicate.updated_at = chrono::Utc::now();
        self.save_profile(duplicate)
    }

    pub fn delete_profile(&self, id: Uuid) -> Result<Uuid, StorageError> {
        let (new_active, deleted) = {
            let mut data = self.data.write();
            if data.profiles.len() <= 1 {
                return Err(StorageError::Validation(
                    "No se puede eliminar el único perfil".to_owned(),
                ));
            }
            let index = data
                .profiles
                .iter()
                .position(|profile| profile.id == id)
                .ok_or_else(|| {
                    StorageError::Validation("El perfil indicado no existe".to_owned())
                })?;
            let deleted = data.profiles.remove(index);
            if data.settings.active_profile_id == id {
                data.settings.active_profile_id = data.profiles[0].id;
            }
            (data.settings.active_profile_id, deleted)
        };

        let source = self.profile_path(id);
        if source.exists() {
            let archive = self.root.join("backups").join(format!(
                "deleted-{id}-{}.json",
                chrono::Utc::now().timestamp()
            ));
            fs::copy(&source, archive)?;
            fs::remove_file(source)?;
        } else {
            atomic_json(
                &self.root.join("backups").join(format!("deleted-{id}.json")),
                &deleted,
                &self.root.join("backups"),
            )?;
        }
        let settings = self.data.read().settings.clone();
        atomic_json(
            &self.root.join("settings.json"),
            &settings,
            &self.root.join("backups"),
        )?;
        Ok(new_active)
    }

    pub fn set_device_mode(&self, mode: DeviceMode) -> Result<(), StorageError> {
        let settings = {
            let mut data = self.data.write();
            data.settings.device_mode = mode;
            data.settings.clone()
        };
        atomic_json(
            &self.root.join("settings.json"),
            &settings,
            &self.root.join("backups"),
        )
    }

    pub fn save_macro(
        &self,
        macro_definition: MacroDefinition,
    ) -> Result<MacroDefinition, StorageError> {
        macro_definition
            .validate()
            .map_err(StorageError::Validation)?;
        {
            let mut data = self.data.write();
            if let Some(existing) = data
                .macros
                .iter_mut()
                .find(|item| item.id == macro_definition.id)
            {
                *existing = macro_definition.clone();
            } else {
                data.macros.push(macro_definition.clone());
            }
        }
        atomic_json(
            &self.macro_path(macro_definition.id),
            &macro_definition,
            &self.root.join("backups"),
        )?;
        Ok(macro_definition)
    }

    pub fn delete_macro(&self, id: Uuid) -> Result<(), StorageError> {
        let deleted = {
            let mut data = self.data.write();
            let index = data
                .macros
                .iter()
                .position(|item| item.id == id)
                .ok_or_else(|| {
                    StorageError::Validation("La macro indicada no existe".to_owned())
                })?;
            data.macros.remove(index)
        };
        let source = self.macro_path(id);
        let archive = self.root.join("backups").join(format!(
            "deleted-macro-{id}-{}.json",
            chrono::Utc::now().timestamp()
        ));
        if source.exists() {
            fs::copy(&source, archive)?;
            fs::remove_file(source)?;
        } else {
            atomic_json(&archive, &deleted, &self.root.join("backups"))?;
        }
        Ok(())
    }

    fn profile_path(&self, id: Uuid) -> PathBuf {
        self.root.join("profiles").join(format!("{id}.json"))
    }

    fn macro_path(&self, id: Uuid) -> PathBuf {
        self.root.join("macros").join(format!("{id}.json"))
    }
}

fn read_json<T: DeserializeOwned>(path: &Path) -> Result<T, StorageError> {
    Ok(serde_json::from_slice(&fs::read(path)?)?)
}

fn valid_image_signature(bytes: &[u8], extension: &str) -> bool {
    match extension {
        "png" => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
        "jpg" => bytes.starts_with(&[0xff, 0xd8, 0xff]),
        "gif" => bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a"),
        "webp" => bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP",
        _ => false,
    }
}

fn atomic_json<T: Serialize>(
    target: &Path,
    value: &T,
    backup_dir: &Path,
) -> Result<(), StorageError> {
    let bytes = serde_json::to_vec_pretty(value)?;
    let temporary = target.with_extension("json.tmp");
    fs::write(&temporary, bytes)?;
    if target.exists() {
        let name = target
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("data.json");
        fs::copy(target, backup_dir.join(format!("{name}.bak")))?;
        fs::remove_file(target)?;
    }
    fs::rename(temporary, target)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_and_recovers_default_profile() {
        let directory = tempfile::Builder::new()
            .prefix("nexora-storage-test-")
            .tempdir_in(std::env::current_dir().unwrap())
            .unwrap();
        let storage = Storage::open(directory.path().to_owned()).unwrap();
        assert_eq!(storage.data.read().profiles.len(), 1);
        storage.persist_all().unwrap();
        let reopened = Storage::open(directory.path().to_owned()).unwrap();
        assert_eq!(reopened.data.read().profiles.len(), 1);
    }

    #[test]
    fn duplicates_and_archives_deleted_profile() {
        let directory = tempfile::Builder::new()
            .prefix("nexora-profile-test-")
            .tempdir_in(std::env::current_dir().unwrap())
            .unwrap();
        let storage = Storage::open(directory.path().to_owned()).unwrap();
        let original = storage.data.read().profiles[0].id;
        let duplicate = storage.duplicate_profile(original).unwrap();
        assert_ne!(duplicate.id, original);
        assert_eq!(storage.data.read().profiles.len(), 2);
        storage.set_active_profile(duplicate.id).unwrap();
        let active = storage.delete_profile(duplicate.id).unwrap();
        assert_eq!(active, original);
        assert_eq!(storage.data.read().profiles.len(), 1);
        let archived = fs::read_dir(directory.path().join("backups"))
            .unwrap()
            .filter_map(Result::ok)
            .any(|entry| entry.file_name().to_string_lossy().starts_with("deleted-"));
        assert!(archived);
    }

    #[test]
    fn saves_and_archives_macro() {
        use crate::models::{KeyAction, MacroStep};
        let directory = tempfile::Builder::new()
            .prefix("nexora-macro-test-")
            .tempdir_in(std::env::current_dir().unwrap())
            .unwrap();
        let storage = Storage::open(directory.path().to_owned()).unwrap();
        let definition = MacroDefinition {
            id: Uuid::new_v4(),
            name: "Prueba".to_owned(),
            repetitions: 2,
            steps: vec![MacroStep {
                delay_ms: 25,
                action: KeyAction::Text {
                    value: "NEXORA".to_owned(),
                },
            }],
        };
        storage.save_macro(definition.clone()).unwrap();
        assert_eq!(storage.data.read().macros.len(), 1);
        storage.delete_macro(definition.id).unwrap();
        assert!(storage.data.read().macros.is_empty());
    }

    #[test]
    fn imports_deduplicates_and_reads_visual_assets() {
        let directory = tempfile::Builder::new()
            .prefix("nexora-assets-test-")
            .tempdir_in(std::env::current_dir().unwrap())
            .unwrap();
        let storage = Storage::open(directory.path().to_owned()).unwrap();
        let encoded = BASE64.encode(b"\x89PNG\r\n\x1a\nfake-png-for-storage-test");
        let first = storage
            .import_asset(
                "icon.png".to_owned(),
                "image/png".to_owned(),
                encoded.clone(),
            )
            .unwrap();
        let duplicate = storage
            .import_asset("duplicate.png".to_owned(), "image/png".to_owned(), encoded)
            .unwrap();
        assert_eq!(first.id, duplicate.id);
        assert_eq!(storage.data.read().assets.len(), 1);
        assert!(storage
            .asset_data_url(&first.id)
            .unwrap()
            .starts_with("data:image/png;base64,"));

        let reopened = Storage::open(directory.path().to_owned()).unwrap();
        assert_eq!(reopened.data.read().assets.len(), 1);
    }
}
