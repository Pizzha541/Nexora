import type { BootstrapState, KeyConfig, Profile } from "../types";

export const createKey = (index: number): KeyConfig => ({
  index,
  name: `Tecla ${index + 1}`,
  color: "#000000",
  text: "",
  animated: false,
  actions: [{ kind: "none" }],
});

const examples: Array<Pick<KeyConfig, "name" | "color" | "actions">> = [
  { name: "OBS · Grabar", color: "#dc2626", actions: [{ kind: "obs", value: "recordToggle", settings: { longPress: false } }] },
  { name: "OBS · Directo", color: "#7c3aed", actions: [{ kind: "obs", value: "streamToggle", settings: { longPress: false } }] },
  { name: "OBS · Cámara virtual", color: "#2563eb", actions: [{ kind: "obs", value: "virtualCameraToggle" }] },
  { name: "OBS · Replay", color: "#059669", actions: [{ kind: "obs", value: "replayBufferToggle" }] },
  { name: "OBS · Guardar replay", color: "#0d9488", actions: [{ kind: "obs", value: "replayBufferSave" }] },
  { name: "OBS · Studio Mode", color: "#4f46e5", actions: [{ kind: "obs", value: "studioModeToggle" }] },
  { name: "OBS · Escena", color: "#334155", actions: [{ kind: "obs", value: "scene", settings: {} }] },
  { name: "OBS · Silenciar fuente", color: "#475569", actions: [{ kind: "obs", value: "inputMuteToggle", settings: {} }] },
  { name: "OBS · Mostrar fuente", color: "#374151", actions: [{ kind: "obs", value: "sourceVisibilityToggle", settings: {} }] },
  { name: "OBS · Captura", color: "#1f2937", actions: [{ kind: "obs", value: "screenshot", settings: { imageFormat: "png" } }] },
  { name: "Twitch · Canal", color: "#9146ff", actions: [{ kind: "native", value: "twitch.channel", settings: {} }] },
  { name: "Twitch · Chat", color: "#772ce8", actions: [{ kind: "native", value: "twitch.chat", settings: {} }] },
];

export const createProfile = (name = "Perfil principal"): Profile => ({
  id: crypto.randomUUID(),
  name,
  description: "Perfil local de NEXORA",
  keys: Array.from({ length: 12 }, (_, index) => ({ ...createKey(index), ...structuredClone(examples[index]) })),
  folders: [],
  updatedAt: new Date().toISOString(),
});

const localProfile = createProfile();

export const localBootstrap: BootstrapState = {
  version: "0.3.0",
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
  updaterConfigured: true,
  startupWarning: "El backend Tauri no está disponible; se está usando almacenamiento local de emergencia.",
};

