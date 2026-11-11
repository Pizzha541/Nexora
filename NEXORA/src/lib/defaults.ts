import type { BootstrapState, KeyConfig, Profile } from "../types";

const colors = ["#8b5cf6", "#6d28d9", "#4c1d95", "#7c3aed"];

export const createKey = (index: number): KeyConfig => ({
  index,
  name: `Tecla ${index + 1}`,
  color: colors[index % colors.length],
  text: index === 0 ? "OBS" : index === 1 ? "MIC" : `${index + 1}`,
  animated: false,
  actions: [{ kind: "none" }],
});

export const createProfile = (name = "Perfil principal"): Profile => ({
  id: crypto.randomUUID(),
  name,
  description: "Perfil local de NEXORA",
  keys: Array.from({ length: 12 }, (_, index) => createKey(index)),
  folders: [],
  updatedAt: new Date().toISOString(),
});

const localProfile = createProfile();

export const localBootstrap: BootstrapState = {
  version: "0.1.0",
  activeProfileId: localProfile.id,
  profiles: [localProfile],
  macros: [],
  device: {
    connected: true,
    mode: "simulation",
    name: "DisplayPad simulado",
  },
  integrations: [
    { id: "obs", name: "OBS Studio", status: "unconfigured", detail: "WebSocket 5.x · puerto 4455", priority: 1 },
    { id: "voxora", name: "VOXORA TTS", status: "unconfigured", detail: "Esperando interfaz de comunicación", priority: 2 },
    { id: "discord", name: "Discord", status: "unconfigured", detail: "Módulo oficial/autorizado por definir", priority: 3 },
    { id: "twitch", name: "Twitch", status: "unconfigured", detail: "Módulo preparado", priority: 4 },
  ],
  assets: [],
  plugins: [],
  pluginCatalog: [],
  visualSettings: {
    initialScreenEnabled: false,
    initialDurationSeconds: 5,
    panoramic: false,
    fit: "cover",
    screensaverEnabled: false,
    screensaverIdleSeconds: 300,
  },
  updaterConfigured: false,
  startupWarning: "El backend Tauri no está disponible; se está usando almacenamiento local de emergencia.",
};

