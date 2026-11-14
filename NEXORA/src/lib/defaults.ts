import type { BootstrapState, KeyConfig, Profile, VisualAsset } from "../types";

export const NEXORA_PRESET_FILES = [
  ["nexora-preset-record", "record.svg", "NEXORA · Grabar"],
  ["nexora-preset-live", "live.svg", "NEXORA · Directo"],
  ["nexora-preset-camera", "camera.svg", "NEXORA · Cámara"],
  ["nexora-preset-replay", "replay.svg", "NEXORA · Replay"],
  ["nexora-preset-save", "save.svg", "NEXORA · Guardar"],
  ["nexora-preset-studio", "studio.svg", "NEXORA · Studio Mode"],
  ["nexora-preset-scenes", "scenes.svg", "NEXORA · Escenas"],
  ["nexora-preset-microphone", "microphone.svg", "NEXORA · Micrófono"],
  ["nexora-preset-visibility", "visibility.svg", "NEXORA · Visibilidad"],
  ["nexora-preset-screenshot", "screenshot.svg", "NEXORA · Captura"],
  ["nexora-preset-channel", "channel.svg", "NEXORA · Canal"],
  ["nexora-preset-chat", "chat.svg", "NEXORA · Chat"],
] as const;

export const createKey = (index: number): KeyConfig => ({
  index,
  name: `Tecla ${index + 1}`,
  color: "#000000",
  text: "",
  animated: false,
  actions: [{ kind: "none" }],
});

const examples: Array<Pick<KeyConfig, "name" | "color" | "actions" | "iconPath">> = [
  { name: "OBS · Grabar", color: "#dc2626", iconPath: "nexora-preset-record", actions: [{ kind: "obs", value: "recordToggle", settings: { longPress: false } }] },
  { name: "OBS · Directo", color: "#7c3aed", iconPath: "nexora-preset-live", actions: [{ kind: "obs", value: "streamToggle", settings: { longPress: false } }] },
  { name: "OBS · Cámara virtual", color: "#2563eb", iconPath: "nexora-preset-camera", actions: [{ kind: "obs", value: "virtualCameraToggle" }] },
  { name: "OBS · Replay", color: "#059669", iconPath: "nexora-preset-replay", actions: [{ kind: "obs", value: "replayBufferToggle" }] },
  { name: "OBS · Guardar replay", color: "#0d9488", iconPath: "nexora-preset-save", actions: [{ kind: "obs", value: "replayBufferSave" }] },
  { name: "OBS · Studio Mode", color: "#4f46e5", iconPath: "nexora-preset-studio", actions: [{ kind: "obs", value: "studioModeToggle" }] },
  { name: "OBS · Escena", color: "#334155", iconPath: "nexora-preset-scenes", actions: [{ kind: "obs", value: "scene", settings: {} }] },
  { name: "OBS · Silenciar fuente", color: "#475569", iconPath: "nexora-preset-microphone", actions: [{ kind: "obs", value: "inputMuteToggle", settings: {} }] },
  { name: "OBS · Mostrar fuente", color: "#374151", iconPath: "nexora-preset-visibility", actions: [{ kind: "obs", value: "sourceVisibilityToggle", settings: {} }] },
  { name: "OBS · Captura", color: "#1f2937", iconPath: "nexora-preset-screenshot", actions: [{ kind: "obs", value: "screenshot", settings: { imageFormat: "png" } }] },
  { name: "Twitch · Canal", color: "#9146ff", iconPath: "nexora-preset-channel", actions: [{ kind: "native", value: "twitch.channel", settings: {} }] },
  { name: "Twitch · Chat", color: "#772ce8", iconPath: "nexora-preset-chat", actions: [{ kind: "native", value: "twitch.chat", settings: {} }] },
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
const localPresetAssets: VisualAsset[] = NEXORA_PRESET_FILES.map(([id, fileName, name]) => ({ id, name, mimeType: "image/svg+xml", fileName, sizeBytes: 0, animated: false, importedAt: new Date(0).toISOString(), source: "nexora" }));

export const localBootstrap: BootstrapState = {
  version: "0.5.0",
  onboardingCompleted: false,
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
  assets: localPresetAssets,
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

