import type { ActionKind } from "../types";

export type NativeSettingSource = "obsScenes" | "obsInputs" | "obsProfiles" | "obsSceneCollections" | "obsTransitions" | "obsHotkeys" | "obsSceneItems" | "obsFilters";

export type NativeSettingField = {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "boolean" | "path";
  source?: NativeSettingSource;
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  help?: string;
};

export type NativePluginAction = {
  id: string;
  name: string;
  description: string;
  kind: Exclude<ActionKind, "none" | "plugin" | "hotkey" | "text" | "macro">;
  value: string;
  settings?: Record<string, unknown>;
  fields?: NativeSettingField[];
};

export type NativePluginDefinition = {
  id: string;
  name: string;
  developer: string;
  description: string;
  status: "ready" | "connection-required";
  actions: NativePluginAction[];
};

export const NATIVE_PLUGINS: NativePluginDefinition[] = [
  {
    id: "obs",
    name: "OBS Studio",
    developer: "NEXORA",
    description: "Control nativo mediante OBS WebSocket 5.x, sin depender del plugin cifrado de Elgato.",
    status: "connection-required",
    actions: [
      { id: "record-toggle", name: "Alternar grabación", description: "Inicia o detiene la grabación según su estado", kind: "obs", value: "recordToggle", settings: { longPress: false }, fields: [{ key: "longPress", label: "Pulsación larga de seguridad (5 s)", type: "boolean", help: "En el DisplayPad físico evita iniciar o detener la grabación por accidente." }] },
      { id: "record-start", name: "Iniciar grabación", description: "Inicia la grabación de OBS", kind: "obs", value: "recordStart" },
      { id: "record-stop", name: "Detener grabación", description: "Detiene la grabación de OBS", kind: "obs", value: "recordStop" },
      { id: "record-pause-toggle", name: "Pausar / reanudar", description: "Alterna la pausa de la grabación", kind: "obs", value: "recordPauseToggle" },
      { id: "record-chapter", name: "Marcador de capítulo", description: "Añade un capítulo a la grabación actual", kind: "obs", value: "recordChapter", settings: { chapterName: "" }, fields: [{ key: "chapterName", label: "Nombre del capítulo", type: "text", placeholder: "Opcional" }] },
      { id: "virtual-camera-toggle", name: "Alternar cámara virtual", description: "Inicia o detiene la cámara virtual", kind: "obs", value: "virtualCameraToggle" },
      { id: "scene", name: "Cambiar escena", description: "Selecciona la escena de programa", kind: "obs", value: "scene", fields: [{ key: "sceneName", label: "Escena", type: "select", source: "obsScenes", required: true }] },
      { id: "preview-scene", name: "Escena de vista previa", description: "Selecciona la vista previa de Studio Mode", kind: "obs", value: "previewScene", fields: [{ key: "sceneName", label: "Escena", type: "select", source: "obsScenes", required: true }] },
      { id: "profile", name: "Cambiar perfil de OBS", description: "Activa un perfil de configuración", kind: "obs", value: "profile", fields: [{ key: "profileName", label: "Perfil", type: "select", source: "obsProfiles", required: true }] },
      { id: "scene-collection", name: "Cambiar colección", description: "Activa una colección de escenas", kind: "obs", value: "sceneCollection", fields: [{ key: "sceneCollectionName", label: "Colección", type: "select", source: "obsSceneCollections", required: true }] },
      { id: "audio-mute", name: "Silenciar fuente", description: "Alterna el silencio de una fuente de audio", kind: "obs", value: "inputMuteToggle", fields: [{ key: "inputName", label: "Fuente de audio", type: "select", source: "obsInputs", required: true }] },
      { id: "audio-volume", name: "Volumen de fuente", description: "Establece el volumen de una fuente", kind: "obs", value: "inputVolume", settings: { volumePercent: 100 }, fields: [{ key: "inputName", label: "Fuente de audio", type: "select", source: "obsInputs", required: true }, { key: "volumePercent", label: "Volumen (%)", type: "number", min: 0, max: 200, step: 1, required: true }] },
      { id: "audio-monitor", name: "Monitorización de audio", description: "Configura cómo se monitoriza una fuente", kind: "obs", value: "inputAudioMonitor", settings: { monitorType: "OBS_MONITORING_TYPE_NONE" }, fields: [{ key: "inputName", label: "Fuente de audio", type: "select", source: "obsInputs", required: true }, { key: "monitorType", label: "Monitorización", type: "select", options: [{ value: "OBS_MONITORING_TYPE_NONE", label: "Desactivada" }, { value: "OBS_MONITORING_TYPE_MONITOR_ONLY", label: "Sólo monitor" }, { value: "OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT", label: "Monitor y salida" }] }] },
      { id: "stream-toggle", name: "Alternar transmisión", description: "Inicia o detiene el streaming según su estado", kind: "obs", value: "streamToggle", settings: { longPress: false }, fields: [{ key: "longPress", label: "Pulsación larga de seguridad (5 s)", type: "boolean", help: "En el DisplayPad físico evita iniciar o detener el directo por accidente." }] },
      { id: "stream-start", name: "Iniciar transmisión", description: "Inicia el streaming en OBS", kind: "obs", value: "streamStart" },
      { id: "stream-stop", name: "Detener transmisión", description: "Detiene el streaming en OBS", kind: "obs", value: "streamStop" },
      { id: "studio-mode", name: "Alternar Studio Mode", description: "Activa o desactiva el modo estudio", kind: "obs", value: "studioModeToggle" },
      { id: "preview-program", name: "Vista previa a programa", description: "Ejecuta la transición de Studio Mode", kind: "obs", value: "studioTransition" },
      { id: "source-visibility", name: "Visibilidad de fuente", description: "Muestra u oculta una fuente de una escena", kind: "obs", value: "sourceVisibilityToggle", fields: [{ key: "sceneItemRef", label: "Fuente en escena", type: "select", source: "obsSceneItems", required: true }] },
      { id: "filter-toggle", name: "Alternar filtro", description: "Activa o desactiva un filtro de fuente", kind: "obs", value: "filterToggle", fields: [{ key: "filterRef", label: "Filtro", type: "select", source: "obsFilters", required: true }] },
      { id: "replay-toggle", name: "Alternar Replay Buffer", description: "Inicia o detiene el búfer de repetición", kind: "obs", value: "replayBufferToggle" },
      { id: "replay-save", name: "Guardar Replay Buffer", description: "Guarda los últimos segundos del búfer", kind: "obs", value: "replayBufferSave" },
      { id: "media-play", name: "Reproducir medio", description: "Reproduce una fuente multimedia", kind: "obs", value: "mediaAction", settings: { mediaAction: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY" }, fields: [{ key: "inputName", label: "Fuente multimedia", type: "select", source: "obsInputs", required: true }] },
      { id: "media-pause", name: "Pausar medio", description: "Pausa una fuente multimedia", kind: "obs", value: "mediaAction", settings: { mediaAction: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE" }, fields: [{ key: "inputName", label: "Fuente multimedia", type: "select", source: "obsInputs", required: true }] },
      { id: "media-stop", name: "Detener medio", description: "Detiene una fuente multimedia", kind: "obs", value: "mediaAction", settings: { mediaAction: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP" }, fields: [{ key: "inputName", label: "Fuente multimedia", type: "select", source: "obsInputs", required: true }] },
      { id: "media-restart", name: "Reiniciar medio", description: "Reinicia una fuente multimedia", kind: "obs", value: "mediaAction", settings: { mediaAction: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART" }, fields: [{ key: "inputName", label: "Fuente multimedia", type: "select", source: "obsInputs", required: true }] },
      { id: "media-next", name: "Medio siguiente", description: "Avanza en la lista multimedia", kind: "obs", value: "mediaAction", settings: { mediaAction: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_NEXT" }, fields: [{ key: "inputName", label: "Fuente multimedia", type: "select", source: "obsInputs", required: true }] },
      { id: "media-previous", name: "Medio anterior", description: "Retrocede en la lista multimedia", kind: "obs", value: "mediaAction", settings: { mediaAction: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PREVIOUS" }, fields: [{ key: "inputName", label: "Fuente multimedia", type: "select", source: "obsInputs", required: true }] },
      { id: "transition", name: "Cambiar transición", description: "Selecciona la transición y su duración", kind: "obs", value: "transition", settings: { transitionDuration: 300 }, fields: [{ key: "transitionName", label: "Transición", type: "select", source: "obsTransitions", required: true }, { key: "transitionDuration", label: "Duración (ms)", type: "number", min: 50, max: 20000, step: 50 }] },
      { id: "scene-transition", name: "Transición por escena", description: "Asigna una transición específica a una escena", kind: "obs", value: "sceneTransitionOverride", settings: { transitionDuration: 300 }, fields: [{ key: "sceneName", label: "Escena", type: "select", source: "obsScenes", required: true }, { key: "transitionName", label: "Transición", type: "select", source: "obsTransitions", required: true }, { key: "transitionDuration", label: "Duración (ms)", type: "number", min: 50, max: 20000, step: 50 }] },
      { id: "screenshot", name: "Guardar captura", description: "Guarda una captura de una fuente o escena", kind: "obs", value: "screenshot", settings: { imageFormat: "png", imageFilePath: "" }, fields: [{ key: "sourceName", label: "Fuente o escena", type: "select", source: "obsInputs", required: true }, { key: "imageFilePath", label: "Archivo de destino", type: "path", placeholder: "C:\\Capturas\\obs.png", required: true }, { key: "imageFormat", label: "Formato", type: "select", options: [{ value: "png", label: "PNG" }, { value: "jpg", label: "JPG" }] }] },
      { id: "hotkey", name: "Atajo interno de OBS", description: "Ejecuta un hotkey registrado en OBS", kind: "obs", value: "hotkey", fields: [{ key: "hotkeyName", label: "Atajo", type: "select", source: "obsHotkeys", required: true }] },
    ],
  },
  {
    id: "spotify",
    name: "Spotify / Multimedia",
    developer: "NEXORA",
    description: "Controles globales de Windows que funcionan con Spotify sin guardar credenciales.",
    status: "ready",
    actions: [
      { id: "open", name: "Abrir Spotify", description: "Abre la aplicación Spotify instalada", kind: "native", value: "spotify.open" },
      { id: "open-uri", name: "Abrir contenido de Spotify", description: "Abre un artista, álbum o playlist mediante URI", kind: "native", value: "spotify.uri", settings: { uri: "spotify:" }, fields: [{ key: "uri", label: "URI de Spotify", type: "text", placeholder: "spotify:playlist:…", required: true }] },
      { id: "play-pause", name: "Reproducir / pausar", description: "Alterna la reproducción multimedia", kind: "media", value: "playPause" },
      { id: "next", name: "Pista siguiente", description: "Salta a la siguiente pista", kind: "media", value: "next" },
      { id: "previous", name: "Pista anterior", description: "Vuelve a la pista anterior", kind: "media", value: "previous" },
    ],
  },
  {
    id: "discord",
    name: "Discord",
    developer: "NEXORA",
    description: "Acciones nativas basadas en los atajos globales oficiales de Discord para Windows.",
    status: "ready",
    actions: [
      { id: "open", name: "Abrir Discord", description: "Abre Discord en mensajes directos", kind: "native", value: "discord.open" },
      { id: "channel", name: "Abrir canal", description: "Abre un canal mediante su enlace de Discord", kind: "native", value: "discord.channel", fields: [{ key: "url", label: "Enlace del canal", type: "text", placeholder: "https://discord.com/channels/…", required: true }] },
      { id: "mute", name: "Silenciar / activar micrófono", description: "Envía Ctrl + Shift + M", kind: "native", value: "discord.mute" },
      { id: "deafen", name: "Ensordecer / activar audio", description: "Envía Ctrl + Shift + D", kind: "native", value: "discord.deafen" },
    ],
  },
  {
    id: "twitch",
    name: "Twitch Creator",
    developer: "NEXORA",
    description: "Accesos seguros al panel de creador. Las acciones de cuenta avanzadas requerirán OAuth de NEXORA.",
    status: "ready",
    actions: [
      { id: "dashboard", name: "Panel de creador", description: "Abre Twitch Creator Dashboard", kind: "native", value: "twitch.dashboard" },
      { id: "stream-manager", name: "Administrador de transmisión", description: "Abre Stream Manager", kind: "native", value: "twitch.streamManager" },
      { id: "following", name: "Canales seguidos", description: "Abre la página de canales en directo", kind: "native", value: "twitch.following" },
      { id: "channel", name: "Abrir canal", description: "Abre directamente un canal de Twitch", kind: "native", value: "twitch.channel", fields: [{ key: "channel", label: "Nombre del canal", type: "text", placeholder: "canal", required: true }] },
      { id: "chat", name: "Chat emergente", description: "Abre el chat emergente de un canal", kind: "native", value: "twitch.chat", fields: [{ key: "channel", label: "Nombre del canal", type: "text", placeholder: "canal", required: true }] },
    ],
  },
  {
    id: "camo",
    name: "Camo Studio",
    developer: "NEXORA",
    description: "Inicia Camo Studio desde rutas conocidas de Windows; no usa el paquete DRM de Marketplace.",
    status: "ready",
    actions: [
      { id: "open", name: "Abrir Camo Studio", description: "Busca e inicia Camo Studio", kind: "native", value: "camo.open" },
      { id: "custom", name: "Abrir Camo personalizado", description: "Usa una ruta específica para Camo Studio", kind: "native", value: "camo.custom", fields: [{ key: "executablePath", label: "Ejecutable de Camo", type: "path", placeholder: "C:\\Program Files\\Camo Studio\\Camo Studio.exe", required: true }] },
      { id: "support", name: "Abrir ayuda de Camo", description: "Abre el soporte oficial de Camo", kind: "native", value: "camo.support" },
    ],
  },
];

export const findNativeAction = (kind: ActionKind, value?: string, settings: Record<string, unknown> = {}) => {
  const candidates = NATIVE_PLUGINS.flatMap((plugin) => plugin.actions);
  return candidates.find((action) => action.kind === kind && action.value === value && Object.entries(action.settings ?? {}).every(([key, expected]) => settings[key] === expected))
    ?? candidates.find((action) => action.kind === kind && action.value === value);
};
