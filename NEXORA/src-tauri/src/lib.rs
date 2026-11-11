mod device;
mod integrations;
mod models;
mod storage;

use device::DeviceManager;
use models::{
    BootstrapState, DeviceMode, DeviceStatus, IntegrationState, KeyConfig, MacroDefinition,
    Profile, VisualAsset, VisualSettings,
};
use parking_lot::Mutex;
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
};
use storage::Storage;
use tauri::{Manager, State};
use uuid::Uuid;

pub struct AppState {
    storage: Storage,
    device: Mutex<DeviceManager>,
    startup_warning: Option<String>,
}

impl AppState {
    fn initialize() -> Result<Self, String> {
        let (storage, startup_warning) = match Storage::open_default() {
            Ok(storage) => (storage, None),
            Err(error) => {
                let warning = format!(
                    "No se pudo abrir la carpeta de datos ({error}). NEXORA inició en modo de recuperación temporal."
                );
                append_early_log("storage-recovery", &warning);
                let recovery_root = std::env::temp_dir().join("NEXORA-recovery");
                let storage = Storage::open(recovery_root).map_err(|recovery_error| {
                    format!(
                        "Falló el almacenamiento normal ({error}) y también la recuperación ({recovery_error})"
                    )
                })?;
                (storage, Some(warning))
            }
        };
        let mode = storage.data.read().settings.device_mode.clone();
        Ok(Self {
            storage,
            device: Mutex::new(DeviceManager::new(mode)),
            startup_warning,
        })
    }
}

fn log_directory() -> PathBuf {
    directories::ProjectDirs::from("com", "Nexora", "NEXORA")
        .map(|dirs| dirs.data_local_dir().join("logs"))
        .unwrap_or_else(|| std::env::temp_dir().join("NEXORA-logs"))
}

fn append_early_log(kind: &str, message: &str) {
    let directory = log_directory();
    if fs::create_dir_all(&directory).is_err() {
        return;
    }
    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(directory.join("startup.log"))
    {
        let _ = writeln!(
            file,
            "{} [{kind}] {message}",
            chrono::Utc::now().to_rfc3339()
        );
    }
}

fn install_panic_hook() {
    std::panic::set_hook(Box::new(|panic_info| {
        append_early_log("panic", &panic_info.to_string());
    }));
}

#[tauri::command]
fn get_bootstrap_state(state: State<'_, AppState>) -> BootstrapState {
    let data = state.storage.data.read();
    BootstrapState {
        version: env!("CARGO_PKG_VERSION").to_owned(),
        active_profile_id: data.settings.active_profile_id,
        profiles: data.profiles.clone(),
        macros: data.macros.clone(),
        device: state.device.lock().status(),
        integrations: integration_states(),
        assets: data.assets.clone(),
        visual_settings: data.settings.visual_settings.clone(),
        updater_configured: !data.settings.github_owner.is_empty()
            && !data.settings.github_repository.is_empty()
            && !data.settings.updater_public_key.is_empty(),
        startup_warning: state.startup_warning.clone(),
    }
}

#[tauri::command]
fn import_visual_asset(
    name: String,
    mime_type: String,
    base64_data: String,
    state: State<'_, AppState>,
) -> Result<VisualAsset, String> {
    state
        .storage
        .import_asset(name, mime_type, base64_data)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn read_visual_asset(asset_id: String, state: State<'_, AppState>) -> Result<String, String> {
    state
        .storage
        .asset_data_url(&asset_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_visual_settings(
    visual_settings: VisualSettings,
    state: State<'_, AppState>,
) -> Result<VisualSettings, String> {
    state
        .storage
        .save_visual_settings(visual_settings)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn create_profile(name: String, state: State<'_, AppState>) -> Result<Profile, String> {
    let profile = Profile::new(name);
    state
        .storage
        .save_profile(profile)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_profile(profile: Profile, state: State<'_, AppState>) -> Result<Profile, String> {
    state
        .storage
        .save_profile(profile)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn duplicate_profile(profile_id: Uuid, state: State<'_, AppState>) -> Result<Profile, String> {
    state
        .storage
        .duplicate_profile(profile_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn delete_profile(profile_id: Uuid, state: State<'_, AppState>) -> Result<Uuid, String> {
    state
        .storage
        .delete_profile(profile_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_macro(
    macro_definition: MacroDefinition,
    state: State<'_, AppState>,
) -> Result<MacroDefinition, String> {
    state
        .storage
        .save_macro(macro_definition)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn delete_macro(macro_id: Uuid, state: State<'_, AppState>) -> Result<(), String> {
    state
        .storage
        .delete_macro(macro_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_active_profile(profile_id: Uuid, state: State<'_, AppState>) -> Result<(), String> {
    state
        .storage
        .set_active_profile(profile_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_device_mode(mode: DeviceMode, state: State<'_, AppState>) -> Result<DeviceStatus, String> {
    state
        .storage
        .set_device_mode(mode.clone())
        .map_err(|error| error.to_string())?;
    Ok(state.device.lock().set_mode(mode))
}

#[tauri::command]
fn refresh_device_status(state: State<'_, AppState>) -> DeviceStatus {
    state.device.lock().refresh()
}

#[tauri::command]
async fn listen_for_button_events(
    duration_ms: u64,
    state: State<'_, AppState>,
) -> Result<Vec<device::ButtonEvent>, String> {
    if !state.device.lock().is_hardware() {
        return Err("Activa primero el modo hardware".to_owned());
    }
    tauri::async_runtime::spawn_blocking(move || DeviceManager::listen_button_events(duration_ms))
        .await
        .map_err(|error| format!("Falló la tarea de lectura HID: {error}"))?
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn apply_key_config(key: KeyConfig, state: State<'_, AppState>) -> Result<(), String> {
    state
        .device
        .lock()
        .apply_key(&key)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn test_obs_connection(url: String, password: String) -> Result<String, String> {
    integrations::obs::test_connection(&url, &password).await
}

fn integration_states() -> Vec<IntegrationState> {
    vec![
        IntegrationState {
            id: "obs".into(),
            name: "OBS Studio".into(),
            status: "unconfigured".into(),
            detail: "WebSocket 5.x · puerto 4455".into(),
            priority: 1,
        },
        IntegrationState {
            id: "voxora".into(),
            name: "VOXORA TTS".into(),
            status: "unconfigured".into(),
            detail: "Esperando interfaz de comunicación".into(),
            priority: 2,
        },
        IntegrationState {
            id: "discord".into(),
            name: "Discord".into(),
            status: "unconfigured".into(),
            detail: "Módulo oficial/autorizado por definir".into(),
            priority: 3,
        },
        IntegrationState {
            id: "twitch".into(),
            name: "Twitch".into(),
            status: "unconfigured".into(),
            detail: "Módulo preparado".into(),
            priority: 4,
        },
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    install_panic_hook();
    let state = match AppState::initialize() {
        Ok(state) => state,
        Err(error) => {
            append_early_log("startup-fatal", &error);
            return;
        }
    };
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .max_file_size(1_000_000)
                .build(),
        )
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            get_bootstrap_state,
            create_profile,
            save_profile,
            duplicate_profile,
            delete_profile,
            save_macro,
            delete_macro,
            set_active_profile,
            set_device_mode,
            refresh_device_status,
            listen_for_button_events,
            apply_key_config,
            test_obs_connection,
            import_visual_asset,
            read_visual_asset,
            save_visual_settings,
        ])
        .run(tauri::generate_context!());
    if let Err(error) = result {
        append_early_log("runtime-fatal", &error.to_string());
    }
}
