import type { VisualAsset } from "../types";

export type AssetCategoryId = "all" | "obs" | "twitch" | "basecamp" | "animated" | "user" | "nexora";

export const ASSET_CATEGORIES: Array<{ id: AssetCategoryId; label: string; description: string }> = [
  { id: "all", label: "Todos", description: "Todos los recursos" },
  { id: "obs", label: "OBS Studio", description: "Streaming, escenas y grabación" },
  { id: "twitch", label: "Twitch", description: "Canal, chat y comunidad" },
  { id: "animated", label: "GIF animados", description: "Recursos con movimiento" },
  { id: "basecamp", label: "Base Camp", description: "Pack original detectado" },
  { id: "user", label: "Mis archivos", description: "Tus importaciones" },
  { id: "nexora", label: "NEXORA", description: "Iconos incluidos" },
];

const twitchWords = ["twitch", "chat", "channel", "canal", "viewer", "clip", "emote"];
const obsWords = ["obs", "record", "grabar", "live", "directo", "camera", "cámara", "replay", "studio", "scene", "escena", "microphone", "micrófono", "visibility", "captura", "screenshot", "stream"];

export function assetCategory(asset: VisualAsset): Exclude<AssetCategoryId, "all"> {
  if (asset.animated || asset.mimeType === "image/gif") return "animated";
  if (asset.source === "basecamp") return "basecamp";
  if (asset.source === "user" || !asset.source) return "user";
  const searchable = `${asset.name} ${asset.fileName}`.toLocaleLowerCase("es");
  if (twitchWords.some((word) => searchable.includes(word))) return "twitch";
  if (obsWords.some((word) => searchable.includes(word))) return "obs";
  return "nexora";
}

export function categoryLabel(id: AssetCategoryId): string {
  return ASSET_CATEGORIES.find((category) => category.id === id)?.label ?? id;
}

export function categoryCounts(assets: VisualAsset[]): Record<AssetCategoryId, number> {
  const counts = Object.fromEntries(ASSET_CATEGORIES.map((category) => [category.id, 0])) as Record<AssetCategoryId, number>;
  counts.all = assets.length;
  assets.forEach((asset) => { counts[assetCategory(asset)] += 1; });
  return counts;
}
