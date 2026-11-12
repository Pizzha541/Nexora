export type DeviceMode = "hardware" | "simulation";

export type DeviceStatus = {
  connected: boolean;
  mode: DeviceMode;
  name: string;
  vendorId?: number;
  productId?: number;
  lastError?: string;
};

export type ButtonEvent = {
  key: number;
  pressed: boolean;
  timestampMs: number;
  rawOffset42: number;
  rawOffset47: number;
};

export type ActionKind =
  | "none"
  | "hotkey"
  | "openUrl"
  | "launchPath"
  | "text"
  | "media"
  | "profile"
  | "folder"
  | "macro"
  | "obs"
  | "plugin";

export type KeyAction = {
  kind: ActionKind;
  value?: string;
  modifiers?: string[];
  pluginId?: string;
  actionId?: string;
  contextId?: string;
  settings?: Record<string, unknown>;
};

export type PluginActionDefinition = {
  id: string;
  name: string;
  description: string;
  icon?: string;
  configurable: boolean;
  propertyInspectorPath?: string;
};

export type PluginEcosystem = "streamdeck" | "macrodeck" | "nexora";

export type InstalledPlugin = {
  id: string;
  name: string;
  description: string;
  developer: string;
  ecosystem: PluginEcosystem;
  category: string;
  version: string;
  license: string;
  sourceUrl: string;
  sha256: string;
  installedAt: string;
  actions: PluginActionDefinition[];
  permissions: string[];
  compatibility: "experimental-runtime" | "manifest-only" | "inspection-only";
  executionApproved: boolean;
  free: boolean;
};

export type PluginCatalogEntry = {
  id: string;
  pluginId: string;
  name: string;
  version: string;
  description: string;
  developer: string;
  ecosystem: PluginEcosystem;
  category: string;
  license: string;
  free: boolean;
  sourceUrl: string;
  sha256: string;
};

export type KeyConfig = {
  index: number;
  name: string;
  color: string;
  text: string;
  iconPath?: string;
  animated: boolean;
  actions: KeyAction[];
};

export type Profile = {
  id: string;
  name: string;
  description: string;
  automaticApp?: string;
  keys: KeyConfig[];
  folders: FolderNode[];
  updatedAt: string;
};

export type FolderNode = {
  id: string;
  name: string;
  keys: KeyConfig[];
  children: FolderNode[];
};

export type MacroStep = {
  delayMs: number;
  action: KeyAction;
};

export type MacroDefinition = {
  id: string;
  name: string;
  repetitions: number;
  steps: MacroStep[];
};

export type IntegrationState = {
  id: string;
  name: string;
  status: "connected" | "disconnected" | "unconfigured" | "unavailable";
  detail: string;
  priority: number;
};

export type VisualAsset = {
  id: string;
  name: string;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
  animated: boolean;
  importedAt: string;
  source?: "user" | "basecamp" | "nexora";
};

export type VisualSettings = {
  initialScreenEnabled: boolean;
  initialAssetId?: string;
  initialDurationSeconds: number;
  panoramic: boolean;
  fit: "cover" | "contain";
  screensaverEnabled: boolean;
  screensaverAssetId?: string;
  screensaverIdleSeconds: number;
};

export type UpdateStatus = {
  phase: "idle" | "checking" | "available" | "current" | "downloading" | "downloaded" | "installing" | "development" | "error";
  currentVersion: string;
  availableVersion?: string | null;
  progress: number;
  message: string;
  configured: boolean;
};

export type BootstrapState = {
  version: string;
  activeProfileId: string;
  profiles: Profile[];
  macros: MacroDefinition[];
  device: DeviceStatus;
  integrations: IntegrationState[];
  assets: VisualAsset[];
  plugins: InstalledPlugin[];
  pluginCatalog: PluginCatalogEntry[];
  visualSettings: VisualSettings;
  updaterConfigured: boolean;
  startupWarning?: string;
};

