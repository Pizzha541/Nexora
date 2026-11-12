import type { ActionKind } from "../types";

export type NativePluginAction = {
  id: string;
  name: string;
  description: string;
  kind: Exclude<ActionKind, "none" | "plugin" | "hotkey" | "text" | "macro">;
  value: string;
  settings?: Record<string, unknown>;
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
      { id: "record-start", name: "Iniciar grabación", description: "Inicia la grabación de OBS", kind: "obs", value: "recordStart" },
      { id: "record-stop", name: "Detener grabación", description: "Detiene la grabación de OBS", kind: "obs", value: "recordStop" },
      { id: "stream-start", name: "Iniciar transmisión", description: "Inicia el streaming en OBS", kind: "obs", value: "streamStart" },
      { id: "stream-stop", name: "Detener transmisión", description: "Detiene el streaming en OBS", kind: "obs", value: "streamStop" },
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
      { id: "support", name: "Abrir ayuda de Camo", description: "Abre el soporte oficial de Camo", kind: "native", value: "camo.support" },
    ],
  },
];
