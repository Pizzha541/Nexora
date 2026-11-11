import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { createProfile, localBootstrap } from "./defaults";
import type { BootstrapState, ButtonEvent, DeviceMode, InstalledPlugin, MacroDefinition, Profile, VisualAsset, VisualSettings } from "../types";

const clone = <T,>(value: T): T => structuredClone(value);
const invoke = <T,>(command: string, args?: Record<string, unknown>): Promise<T> =>
  window.nexoraDesktop?.invoke<T>(command, args) ?? tauriInvoke<T>(command, args);

export async function getBootstrapState(): Promise<BootstrapState> {
  try {
    return await invoke<BootstrapState>("get_bootstrap_state");
  } catch {
    return clone(localBootstrap);
  }
}

export async function saveProfile(profile: Profile): Promise<Profile> {
  try {
    return await invoke<Profile>("save_profile", { profile });
  } catch {
    localStorage.setItem(`nexora.profile.${profile.id}`, JSON.stringify(profile));
    return profile;
  }
}

export async function createBackendProfile(name: string): Promise<Profile> {
  try {
    return await invoke<Profile>("create_profile", { name });
  } catch {
    return createProfile(name);
  }
}

export async function duplicateBackendProfile(profileId: string): Promise<Profile> {
  return invoke<Profile>("duplicate_profile", { profileId });
}

export async function deleteBackendProfile(profileId: string): Promise<string> {
  return invoke<string>("delete_profile", { profileId });
}

export async function saveBackendMacro(macroDefinition: MacroDefinition): Promise<MacroDefinition> {
  return invoke<MacroDefinition>("save_macro", { macroDefinition });
}

export async function deleteBackendMacro(macroId: string): Promise<void> {
  await invoke("delete_macro", { macroId });
}

export async function setActiveProfile(profileId: string): Promise<void> {
  try {
    await invoke("set_active_profile", { profileId });
  } catch {
    localStorage.setItem("nexora.activeProfile", profileId);
  }
}

export async function setDeviceMode(mode: DeviceMode): Promise<BootstrapState["device"]> {
  try {
    return await invoke("set_device_mode", { mode });
  } catch {
    return { connected: mode === "simulation", mode, name: mode === "simulation" ? "DisplayPad simulado" : "Mountain DisplayPad" };
  }
}

export async function refreshDeviceStatus(): Promise<BootstrapState["device"]> {
  try {
    return await invoke("refresh_device_status");
  } catch {
    return { connected: false, mode: "hardware", name: "Mountain DisplayPad", lastError: "El backend Tauri no está disponible" };
  }
}

export async function listenForButtonEvents(durationMs = 15_000): Promise<ButtonEvent[]> {
  return invoke<ButtonEvent[]>("listen_for_button_events", { durationMs });
}

export async function testObsConnection(url: string, password: string): Promise<string> {
  return invoke<string>("test_obs_connection", { url, password });
}

export async function importVisualAsset(file: File): Promise<VisualAsset> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
  const base64Data = dataUrl.slice(dataUrl.indexOf(",") + 1);
  try {
    return await invoke<VisualAsset>("import_visual_asset", {
      name: file.name,
      mimeType: file.type,
      base64Data,
    });
  } catch (error) {
    const local: VisualAsset = {
      id: crypto.randomUUID(),
      name: file.name,
      mimeType: file.type,
      fileName: file.name,
      sizeBytes: file.size,
      animated: file.type === "image/gif",
      importedAt: new Date().toISOString(),
    };
    localStorage.setItem(`nexora.asset.${local.id}`, dataUrl);
    if (String(error).includes("Formato") || String(error).includes("12 MB")) throw error;
    return local;
  }
}

export async function readVisualAsset(assetId: string): Promise<string> {
  const local = localStorage.getItem(`nexora.asset.${assetId}`);
  if (local) return local;
  return invoke<string>("read_visual_asset", { assetId });
}

export async function saveVisualSettings(visualSettings: VisualSettings): Promise<VisualSettings> {
  try {
    return await invoke<VisualSettings>("save_visual_settings", { visualSettings });
  } catch {
    localStorage.setItem("nexora.visualSettings", JSON.stringify(visualSettings));
    return visualSettings;
  }
}

export async function applyHardwarePage(keys: Profile["keys"]): Promise<string> {
  return invoke<string>("hardware_apply_page", { keys });
}

export async function applyHardwareKey(key: Profile["keys"][number]): Promise<string> {
  return invoke<string>("hardware_apply_key", { key });
}

export async function applyInitialScreen(): Promise<string> {
  return invoke<string>("hardware_apply_initial");
}

const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
  reader.onerror = () => reject(reader.error ?? new Error("No se pudo leer el paquete"));
  reader.readAsDataURL(file);
});

export async function installPluginPackage(file: File, options: { declaredLicense?: string; sourceUrl?: string } = {}): Promise<InstalledPlugin> {
  return invoke<InstalledPlugin>("plugin_install_package", {
    approvedInstall: true,
    base64Data: await fileToBase64(file),
    declaredLicense: options.declaredLicense,
    sourceUrl: options.sourceUrl,
    free: true,
  });
}

export async function installCatalogPlugin(catalogId: string): Promise<InstalledPlugin> {
  return invoke<InstalledPlugin>("plugin_install_catalog", { catalogId, approvedInstall: true });
}

export async function setPluginExecutionApproval(pluginId: string, approved: boolean): Promise<InstalledPlugin> {
  return invoke<InstalledPlugin>("plugin_set_execution_approval", { pluginId, approved });
}

export async function executePluginAction(pluginId: string, actionId: string, settings: Record<string, unknown>, keyIndex = 0): Promise<string> {
  return invoke<string>("plugin_execute_action", { pluginId, actionId, settings, keyIndex });
}

export async function uninstallPlugin(pluginId: string): Promise<string> {
  return invoke<string>("plugin_uninstall", { pluginId, confirmed: true });
}

