import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Boxes,
  ChevronRight,
  CircleHelp,
  Command,
  Copy,
  Cpu,
  Download,
  FolderTree,
  Gauge,
  ImagePlus,
  Layers3,
  LayoutDashboard,
  LoaderCircle,
  MoreHorizontal,
  MonitorUp,
  PackageOpen,
  Play,
  Plus,
  PlugZap,
  Radio,
  Save,
  Search,
  ScreenShare,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  WandSparkles,
  Workflow,
  X,
} from "lucide-react";
import {
  createBackendProfile,
  deleteBackendProfile,
  deleteBackendMacro,
  duplicateBackendProfile,
  getBootstrapState,
  listenForButtonEvents,
  refreshDeviceStatus,
  saveProfile,
  saveBackendMacro,
  setActiveProfile,
  setProfileOrder,
  setDeviceMode,
  testObsConnection,
  applyHardwareKey,
  applyHardwarePage,
  applyInitialScreen,
  importVisualAsset,
  importBaseCampAssets,
  deleteVisualAsset,
  readVisualAsset,
  saveVisualSettings,
  executePluginAction,
  executeObsAction,
  executeConfiguredKey,
  getObsScenes,
  getObsCatalog,
  getUpdateStatus,
  checkForAppUpdate,
  installAppUpdate,
  pickFile,
  openPluginPropertyInspector,
  installCatalogPlugin,
  installPluginPackage,
  setPluginExecutionApproval,
  uninstallPlugin,
} from "./lib/backend";
import type { BootstrapState, ButtonEvent, DeviceMode, FolderNode, InstalledPlugin, KeyAction, KeyConfig, MacroDefinition, ObsCatalog, PluginActionDefinition, PluginCatalogEntry, Profile, UpdateStatus, VisualAsset, VisualSettings } from "./types";
import { shouldShowUpdatePrompt } from "./lib/updatePrompt";
import { ActionLibrary, EditorWorkspace, KeyInspector, type NativeActionDrop, type PluginDrop } from "./components/EditorWorkspace";
import { NATIVE_PLUGINS } from "./lib/nativePlugins";
import {
  isSupportedVisualFile,
  keysForPage,
  moveProfileKey,
  moveFolder,
  NEXORA_ASSET_MIME,
  NEXORA_FOLDER_MIME,
  NEXORA_KEY_MIME,
  NEXORA_NATIVE_ACTION_MIME,
  NEXORA_PLUGIN_ACTION_MIME,
  NEXORA_PROFILE_MIME,
  reorderProfiles,
  updateProfileKey,
  updatePluginSettings,
} from "./lib/realtime";

type Section = "dashboard" | "displaypad" | "profiles" | "library" | "initial" | "macros" | "integrations" | "plugins" | "settings" | "about";
const EMPTY_OBS_CATALOG: ObsCatalog = { currentScene: "", scenes: [], inputs: [], profiles: [], sceneCollections: [], transitions: [], hotkeys: [], sceneItems: [], filters: [] };
const bundledAsset = (name: string) => `${import.meta.env.BASE_URL}assets/${name}`;
const visualAssetCache = new Map<string, Promise<string>>();
const cachedVisualAsset = (assetId: string) => {
  const existing = visualAssetCache.get(assetId);
  if (existing) return existing;
  const pending = readVisualAsset(assetId).catch((error) => {
    visualAssetCache.delete(assetId);
    throw error;
  });
  visualAssetCache.set(assetId, pending);
  return pending;
};

const primaryNavigation: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "displaypad", label: "DisplayPad", icon: Gauge },
  { id: "library", label: "Biblioteca", icon: ImagePlus },
  { id: "integrations", label: "Integraciones", icon: PlugZap },
  { id: "plugins", label: "Plugins", icon: Boxes },
];

const secondaryNavigation: { id: Section; label: string; description: string; icon: typeof LayoutDashboard }[] = [
  { id: "profiles", label: "Perfiles", description: "Organiza configuraciones", icon: Layers3 },
  { id: "initial", label: "Pantalla inicial", description: "Configura el arranque físico", icon: ScreenShare },
  { id: "macros", label: "Automatizaciones", description: "Herramientas avanzadas", icon: Workflow },
];
const sectionIds: Section[] = ["dashboard", "displaypad", "profiles", "library", "initial", "macros", "integrations", "plugins", "settings", "about"];

const findFolder = (folders: FolderNode[], id: string | null): FolderNode | undefined => {
  if (!id) return undefined;
  for (const folder of folders) {
    if (folder.id === id) return folder;
    const nested = findFolder(folder.children, id);
    if (nested) return nested;
  }
  return undefined;
};

const updateFolderTree = (folders: FolderNode[], id: string, update: (folder: FolderNode) => FolderNode): FolderNode[] =>
  folders.map((folder) => folder.id === id ? update(folder) : { ...folder, children: updateFolderTree(folder.children, id, update) });

const removeFolderFromTree = (folders: FolderNode[], id: string): FolderNode[] =>
  folders.filter((folder) => folder.id !== id).map((folder) => ({ ...folder, children: removeFolderFromTree(folder.children, id) }));

function StatusPill({ connected, mode }: { connected: boolean; mode: DeviceMode }) {
  return (
    <div className={`status-pill ${connected ? "online" : "offline"}`}>
      <span className="status-dot" />
      {connected ? (mode === "simulation" ? "Simulación activa" : "DisplayPad conectado") : "Sin conexión"}
    </div>
  );
}

function AssetVisual({ assetId, alt = "" }: { assetId: string; alt?: string }) {
  const [source, setSource] = useState("");
  useEffect(() => {
    let active = true;
    void cachedVisualAsset(assetId).then((value) => { if (active) setSource(value); }).catch(() => undefined);
    return () => { active = false; };
  }, [assetId]);
  return source ? <img className="asset-visual" src={source} alt={alt} /> : <span className="asset-loading"><LoaderCircle className="spin" size={15} /></span>;
}

function DefaultActionIcon({ action, state }: { action?: KeyAction; state?: number }) {
  if (!action || action.kind === "none") return null;
  const Icon = action.kind === "obs" ? (action.value === "screenshot" ? ImagePlus : action.value === "scene" || action.value === "previewScene" ? ScreenShare : Radio)
    : action.kind === "multiAction" || action.kind === "multiSwitch" || action.kind === "macro" ? Workflow
    : action.kind === "media" ? Play
    : action.kind === "profile" ? Layers3
    : action.kind === "folder" ? FolderTree
    : action.kind === "plugin" ? Boxes
    : action.kind === "launchPath" ? PackageOpen
    : action.kind === "openUrl" ? ScreenShare
    : PlugZap;
  return <span className={`default-action-icon action-${action.kind}`}><Icon size={34} />{action.kind === "multiSwitch" && <b>{(state ?? 0) + 1}</b>}</span>;
}

function KeyArtwork({ assetId, image, text, alt, action, state }: { assetId?: string; image?: string; text?: string; alt: string; action?: KeyAction; state?: number }) {
  const hasImage = Boolean(assetId || image);
  return <span className={`key-artwork ${hasImage ? "has-image" : ""} ${action && action.kind !== "none" ? "has-action" : ""}`}>
    {image ? <img className="asset-visual" src={image} alt={alt} /> : assetId ? <AssetVisual assetId={assetId} alt={alt} /> : null}
    {!hasImage && <DefaultActionIcon action={action} state={state} />}
    {text && <span className={hasImage ? "key-text-overlay" : "key-text-only"}>{text}</span>}
  </span>;
}

type RuntimeKeyFeedback = { title?: string; image?: string; state?: number; disconnected?: boolean };

function KeyGrid({ keys, selected, pressedKeys = new Set(), runtimeFeedback = {}, onSelect, onActivate, onPluginDrop, onNativeDrop, onKeyMove, onAssetDrop, onFileDrop }: {
  keys: KeyConfig[];
  selected: number;
  pressedKeys?: Set<number>;
  runtimeFeedback?: Record<number, RuntimeKeyFeedback>;
  onSelect: (key: number) => void;
  onActivate?: (key: number) => void;
  onPluginDrop?: (key: number, value: PluginDrop) => void;
  onNativeDrop?: (key: number, value: NativeActionDrop) => void;
  onKeyMove?: (source: number, target: number, copy: boolean) => void;
  onAssetDrop?: (key: number, assetId: string) => void;
  onFileDrop?: (key: number, files: FileList) => void;
}) {
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [dropInvalid, setDropInvalid] = useState(false);
  const acceptsDrop = (event: React.DragEvent) => event.dataTransfer.types.some((type) =>
    [NEXORA_PLUGIN_ACTION_MIME, NEXORA_NATIVE_ACTION_MIME, NEXORA_KEY_MIME, NEXORA_ASSET_MIME, "Files"].includes(type));

  return (
    <div className="key-grid" aria-label="Teclas del DisplayPad">
      {keys.map((key) => {
        const feedback = runtimeFeedback[key.index];
        const action = key.actions[0];
        const empty = !action || action.kind === "none";
        return (
        <button
          type="button"
          key={key.index}
          draggable
          className={`device-key ${empty ? "empty" : "configured"} ${selected === key.index ? "selected" : ""} ${pressedKeys.has(key.index) ? "pressed" : ""} ${dropTarget === key.index ? (dropInvalid ? "drop-invalid" : "drop-valid") : ""}`}
          style={{ "--key-color": key.color } as React.CSSProperties}
          onClick={() => onSelect(key.index)}
          onDoubleClick={() => onActivate?.(key.index)}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "copyMove";
            event.dataTransfer.setData(NEXORA_KEY_MIME, JSON.stringify({ index: key.index }));
          }}
          onDragEnter={(event) => {
            if (!acceptsDrop(event)) return;
            event.preventDefault();
            const invalidFiles = event.dataTransfer.types.includes("Files") && !onFileDrop;
            setDropInvalid(invalidFiles);
            setDropTarget(key.index);
          }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null); }}
          onDragOver={(event) => {
            if (!acceptsDrop(event)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = event.ctrlKey ? "copy" : "move";
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDropTarget(null);
            setDropInvalid(false);
            try {
              if (event.dataTransfer.files.length && onFileDrop) {
                onFileDrop(key.index, event.dataTransfer.files);
                return;
              }
              const plugin = event.dataTransfer.getData(NEXORA_PLUGIN_ACTION_MIME);
              if (plugin && onPluginDrop) {
                onPluginDrop(key.index, JSON.parse(plugin) as PluginDrop);
                return;
              }
              const nativeAction = event.dataTransfer.getData(NEXORA_NATIVE_ACTION_MIME);
              if (nativeAction && onNativeDrop) {
                onNativeDrop(key.index, JSON.parse(nativeAction) as NativeActionDrop);
                return;
              }
              const assetId = event.dataTransfer.getData(NEXORA_ASSET_MIME);
              if (assetId && onAssetDrop) {
                onAssetDrop(key.index, assetId);
                return;
              }
              const source = event.dataTransfer.getData(NEXORA_KEY_MIME);
              if (source && onKeyMove) onKeyMove(Number((JSON.parse(source) as { index: number }).index), key.index, event.ctrlKey);
            } catch { setDropInvalid(true); }
          }}
        >
          {!empty && <span className="key-glow" />}
          <span className="key-content"><KeyArtwork assetId={empty || feedback?.image ? undefined : key.iconPath} image={empty ? undefined : feedback?.image} text={empty ? "" : feedback?.title || key.text} alt={feedback?.title || key.name} action={empty ? undefined : action} state={feedback?.state} /></span>
          {!empty && <small>{key.name}</small>}
          {feedback?.disconnected && <span className="runtime-offline">offline</span>}
        </button>
      );})}
    </div>
  );
}

function KeyEditor({ keyConfig, assets, hardwareReady, onImport, onApplyHardware, onChange, onClose, onSave }: { keyConfig: KeyConfig; assets: VisualAsset[]; hardwareReady: boolean; onImport: (files: FileList) => Promise<VisualAsset[]>; onApplyHardware: () => Promise<string>; onChange: (key: KeyConfig) => void; onClose: () => void; onSave: () => void }) {
  const action = keyConfig.actions[0] ?? { kind: "none" as const };
  const [hardwareMessage, setHardwareMessage] = useState("");
  return (
    <aside className="key-editor">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">TECLA {keyConfig.index + 1}</span>
          <h2>Editor visual</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar editor"><X size={18} /></button>
      </div>
      <div className="key-preview" style={{ "--key-color": keyConfig.color } as React.CSSProperties}>
        <KeyArtwork assetId={keyConfig.iconPath} text={keyConfig.text} alt={keyConfig.name} action={action} />
        <small>{keyConfig.name}</small>
      </div>
      <label>Nombre<input value={keyConfig.name} onChange={(e) => onChange({ ...keyConfig, name: e.target.value })} maxLength={40} /></label>
      <label>Texto<input value={keyConfig.text} onChange={(e) => onChange({ ...keyConfig, text: e.target.value })} maxLength={12} /></label>
      <label>Color<input className="color-input" type="color" value={keyConfig.color} onChange={(e) => onChange({ ...keyConfig, color: e.target.value })} /></label>
      <label>Imagen o GIF
        <select value={keyConfig.iconPath ?? ""} onChange={(e) => {
          const asset = assets.find((item) => item.id === e.target.value);
          onChange({ ...keyConfig, iconPath: e.target.value || undefined, animated: asset?.animated ?? false });
        }}>
          <option value="">Sin recurso visual</option>
          {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}{asset.animated ? " · GIF" : ""}</option>)}
        </select>
      </label>
      {keyConfig.iconPath && <button type="button" className="secondary-button" onClick={() => onChange({ ...keyConfig, iconPath: undefined, animated: false })}><X size={15} /> Quitar imagen de esta tecla</button>}
      <label className="file-button"><ImagePlus size={16} /> Importar desde archivo
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onChange={(event) => {
          if (!event.target.files?.length) return;
          void onImport(event.target.files).then(([asset]) => {
            if (asset) onChange({ ...keyConfig, iconPath: asset.id, animated: asset.animated });
          });
          event.target.value = "";
        }} />
      </label>
      <label>Acción principal
        <select value={action.kind} onChange={(e) => onChange({ ...keyConfig, actions: [{ ...action, kind: e.target.value as typeof action.kind }] })}>
          <option value="none">Sin acción</option>
          <option value="hotkey">Atajo de teclado</option>
          <option value="openUrl">Abrir página web</option>
          <option value="launchPath">Abrir aplicación o archivo</option>
          <option value="text">Escribir texto</option>
          <option value="media">Control multimedia</option>
          <option value="profile">Cambiar perfil</option>
          <option value="folder">Abrir carpeta</option>
          <option value="macro">Ejecutar macro</option>
          <option value="obs">Acción de OBS</option>
          <option value="native" disabled={action.kind !== "native"}>Plugin nativo NEXORA</option>
          <option value="plugin" disabled={action.kind !== "plugin"}>Acción de Plugin Hub</option>
        </select>
      </label>
      {action.kind === "plugin" ? <div className="permission-box"><Boxes size={17} /><div><strong>Acción externa asignada</strong><p>{action.pluginId}<br />{action.actionId}</p></div></div> : action.kind === "native" ? <div className="permission-box"><PlugZap size={17} /><div><strong>Plugin nativo NEXORA</strong><p>{keyConfig.name}</p></div></div> : action.kind !== "none" && (
        <label>Valor<input value={action.value ?? ""} onChange={(e) => onChange({ ...keyConfig, actions: [{ ...action, value: e.target.value }] })} placeholder="Configuración de la acción" /></label>
      )}
      <label className="toggle-row"><span><strong>Recurso animado</strong><small>Se validará antes de enviarlo al hardware</small></span><input type="checkbox" checked={keyConfig.animated} onChange={(e) => onChange({ ...keyConfig, animated: e.target.checked })} /></label>
      <button type="button" className="primary-button" onClick={onSave}><Save size={17} /> Guardar tecla</button>
      <button type="button" className="secondary-button" disabled={!hardwareReady} onClick={() => {
        if (!window.confirm(`¿Enviar ahora la imagen de la tecla ${keyConfig.index + 1} al DisplayPad?`)) return;
        setHardwareMessage("Enviando al DisplayPad…");
        void onApplyHardware().then(setHardwareMessage).catch((error) => setHardwareMessage(error instanceof Error ? error.message : String(error)));
      }}><MonitorUp size={17} /> Probar en la tecla física</button>
      {hardwareMessage && <p className="device-message">{hardwareMessage}</p>}
      <p className="safety-note">Las acciones sensibles requieren validación. NEXORA no ejecuta comandos arbitrarios silenciosamente.</p>
    </aside>
  );
}

function LibraryPanel({ assets, onImport, onAssign, onDelete, onImportBaseCamp }: { assets: VisualAsset[]; onImport: (files: FileList) => Promise<VisualAsset[]>; onAssign: (asset: VisualAsset) => void; onDelete: (asset: VisualAsset) => Promise<void>; onImportBaseCamp: () => Promise<{ imported: number; total: number; source: string }> }) {
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(80);
  const filtered = assets
    .filter((asset) => asset.name.toLowerCase().includes(query.toLowerCase()))
    .sort((left, right) => Number(right.source === "nexora") - Number(left.source === "nexora") || left.name.localeCompare(right.name, "es"));
  const includedCount = assets.filter((asset) => asset.source === "nexora").length;
  return (
    <div className="section-stack">
      <div className="section-title"><span><em>04</em> Biblioteca</span><h1>Recursos visuales reutilizables</h1><p>Importa PNG, JPG, WEBP o GIF una sola vez y reutilízalo en cualquier tecla, carpeta o pantalla inicial.</p></div>
      <div className="library-toolbar glass-card">
        <label className="primary-button file-button"><ImagePlus size={17} /> Importar imágenes o GIF
          <input multiple type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onChange={(event) => {
            if (!event.target.files?.length) return;
            void onImport(event.target.files).then((items) => setMessage(`${items.length} recurso(s) disponibles.`)).catch((error) => setMessage(String(error)));
            event.target.value = "";
          }} />
        </label>
        <button type="button" className="secondary-button" onClick={() => { setMessage("Buscando recursos de Base Camp…"); void onImportBaseCamp().then((result) => setMessage(`${result.imported} nuevos; ${result.total} recursos de Base Camp disponibles.`)).catch((error) => setMessage(error instanceof Error ? error.message : String(error))); }}><Download size={16} /> Importar pack de Base Camp</button>
        <p>{includedCount} imágenes originales vienen incluidas con NEXORA. También puede detectar una instalación legítima de Base Camp o dejarte elegir su carpeta.</p>
        {message && <strong>{message}</strong>}
      </div>
      <label className="library-search"><Search size={16} /><input value={query} onChange={(event) => { setQuery(event.target.value); setLimit(80); }} placeholder={`Buscar entre ${assets.length} recursos`} /></label>
      <div className="asset-grid">
        {filtered.slice(0, limit).map((asset) => <article className="asset-card glass-card" key={asset.id} draggable onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "copy";
          event.dataTransfer.setData(NEXORA_ASSET_MIME, asset.id);
        }}>
          <div className="asset-preview"><AssetVisual assetId={asset.id} alt={asset.name} />{asset.animated && <span>GIF</span>}</div>
          <h3>{asset.name}</h3><small>{(asset.sizeBytes / 1024).toFixed(1)} KB · {asset.mimeType.replace("image/", "").toUpperCase()} · {asset.source === "basecamp" ? "Base Camp" : asset.source === "nexora" ? "Incluido con NEXORA" : "Usuario"}</small>
          <button type="button" className="secondary-button" onClick={() => onAssign(asset)}>Asignar a tecla seleccionada</button>
          {asset.source !== "nexora" && <button type="button" className="danger-button" onClick={() => { if (!window.confirm(`¿Eliminar “${asset.name}” de la biblioteca y quitarla de todas las teclas?`)) return; void onDelete(asset).then(() => setMessage("Recurso eliminado.")).catch((error) => setMessage(error instanceof Error ? error.message : String(error))); }}><Trash2 size={14} /> Eliminar recurso</button>}
        </article>)}
        {!filtered.length && <div className="empty-library glass-card"><ImagePlus size={34} /><h2>{assets.length ? "No hay coincidencias" : "Tu biblioteca está vacía"}</h2><p>Admite PNG, JPG, WEBP, SVG y GIF de hasta 12 MB.</p></div>}
      </div>
      {filtered.length > limit && <button type="button" className="secondary-button library-more" onClick={() => setLimit((value) => value + 80)}>Mostrar 80 más ({filtered.length - limit} restantes)</button>}
    </div>
  );
}

function PanoramaPreview({ assetId }: { assetId?: string }) {
  const [source, setSource] = useState("");
  useEffect(() => {
    if (!assetId) { setSource(""); return; }
    void cachedVisualAsset(assetId).then(setSource).catch(() => setSource(""));
  }, [assetId]);
  return <div className="panorama-preview">{Array.from({ length: 12 }, (_, index) => {
    const column = index % 6;
    const row = Math.floor(index / 6);
    return <div key={index} style={source ? { backgroundImage: `url(${source})`, backgroundSize: "600% 200%", backgroundPosition: `${column * 20}% ${row * 100}%` } : undefined}>{!source && <img src={bundledAsset("noxorabanner.png")} alt="" />}</div>;
  })}</div>;
}

function InitialScreenPanel({ assets, settings, hardwareReady, onSave, onApply }: { assets: VisualAsset[]; settings: VisualSettings; hardwareReady: boolean; onSave: (settings: VisualSettings) => Promise<void>; onApply: () => Promise<string> }) {
  const [draft, setDraft] = useState(settings);
  const [message, setMessage] = useState("");
  const lastPersisted = useRef(JSON.stringify(settings));
  const onSaveRef = useRef(onSave);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);
  useEffect(() => { lastPersisted.current = JSON.stringify(settings); setDraft(settings); }, [settings]);
  useEffect(() => {
    const signature = JSON.stringify(draft);
    if (signature === lastPersisted.current) return;
    const timer = window.setTimeout(() => {
      lastPersisted.current = signature;
      void onSaveRef.current(draft).then(() => setMessage("Configuración guardada automáticamente.")).catch((error) => setMessage(error instanceof Error ? error.message : String(error)));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [draft]);
  const save = async () => { await onSave(draft); setMessage("Configuración visual guardada."); };
  return <div className="section-stack">
    <div className="section-title"><span><em>05</em> Initial Screen</span><h1>Una bienvenida en doce pantallas</h1><p>Configura una imagen o GIF inicial y un salvapantallas opcional. El banner NEXORA se usa cuando no eliges otro recurso.</p></div>
    <div className="initial-layout">
      <section className="glass-card initial-editor">
        <label className="toggle-row"><span><strong>Mostrar al conectar</strong><small>Se aplicará al hardware cuando termine la validación de escritura.</small></span><input type="checkbox" checked={draft.initialScreenEnabled} onChange={(e) => setDraft({ ...draft, initialScreenEnabled: e.target.checked })} /></label>
        <label>Recurso inicial<select value={draft.initialAssetId ?? ""} onChange={(e) => setDraft({ ...draft, initialAssetId: e.target.value || undefined })}><option value="">Banner NEXORA incluido</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
        <label>Duración (segundos)<input type="number" min={1} max={3600} value={draft.initialDurationSeconds} onChange={(e) => setDraft({ ...draft, initialDurationSeconds: Math.max(1, Math.min(3600, Number(e.target.value))) })} /></label>
        <label className="toggle-row"><span><strong>Composición panorámica 6 × 2</strong><small>Divide visualmente el recurso entre las doce teclas.</small></span><input type="checkbox" checked={draft.panoramic} onChange={(e) => setDraft({ ...draft, panoramic: e.target.checked })} /></label>
        <label>Ajuste<select value={draft.fit} onChange={(e) => setDraft({ ...draft, fit: e.target.value as VisualSettings["fit"] })}><option value="cover">Cubrir</option><option value="contain">Contener</option></select></label>
        <hr />
        <label className="toggle-row"><span><strong>Salvapantallas</strong><small>Se activará tras un periodo sin pulsaciones.</small></span><input type="checkbox" checked={draft.screensaverEnabled} onChange={(e) => setDraft({ ...draft, screensaverEnabled: e.target.checked })} /></label>
        <label>Recurso del salvapantallas<select value={draft.screensaverAssetId ?? ""} onChange={(e) => setDraft({ ...draft, screensaverAssetId: e.target.value || undefined })}><option value="">Banner NEXORA incluido</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
        <label>Activar tras (segundos)<input type="number" min={30} max={86400} value={draft.screensaverIdleSeconds} onChange={(e) => setDraft({ ...draft, screensaverIdleSeconds: Math.max(30, Math.min(86400, Number(e.target.value))) })} /></label>
        <button type="button" className="primary-button" onClick={() => void save()}><Save size={16} /> Guardar Initial Screen</button>{message && <p className="device-message ok">{message}</p>}
        <button type="button" className="secondary-button" disabled={!hardwareReady} onClick={() => {
          if (!window.confirm("¿Enviar la composición panorámica a las doce teclas físicas?")) return;
          setMessage("Enviando 12 fragmentos…");
          void save().then(onApply).then(setMessage).catch((error) => setMessage(error instanceof Error ? error.message : String(error)));
        }}><MonitorUp size={16} /> Enviar Initial Screen ahora</button>
      </section>
      <section className="glass-card initial-preview"><span className="eyebrow">PREVISUALIZACIÓN 6 × 2</span><PanoramaPreview assetId={draft.initialAssetId} /><p>Resolución lógica: 612 × 204 px (12 fragmentos de 102 × 102).</p></section>
    </div>
  </div>;
}

function PluginsPanel({ plugins, catalog, keys, selectedKey, onRefresh, onAssign, onAssignNative, onOpenInspector }: {
  plugins: InstalledPlugin[];
  catalog: PluginCatalogEntry[];
  keys: KeyConfig[];
  selectedKey: number;
  onRefresh: () => Promise<void>;
  onAssign: (key: number, value: PluginDrop) => Promise<void>;
  onAssignNative: (key: number, value: NativeActionDrop) => void;
  onOpenInspector?: (plugin: InstalledPlugin, action: PluginActionDefinition, key: number, settings: Record<string, unknown>) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [ecosystem, setEcosystem] = useState("all");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [settings, setSettings] = useState<Record<string, string>>({});
  const matches = (name: string, source: string) => name.toLowerCase().includes(query.toLowerCase()) && (ecosystem === "all" || source === ecosystem);
  const parseSettings = (key: string) => {
    const raw = settings[key]?.trim() || "{}";
    const value = JSON.parse(raw) as unknown;
    if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("La configuración debe ser un objeto JSON.");
    return value as Record<string, unknown>;
  };
  const task = async (id: string, run: () => Promise<unknown>, success: string) => {
    setBusy(id); setMessage("");
    try { await run(); await onRefresh(); setMessage(success); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(""); }
  };
  const importPackage = async (file?: File) => {
    if (!file) return;
    if (!window.confirm(`¿Inspeccionar e instalar “${file.name}”? El código NO se ejecutará hasta que lo autorices por separado.`)) return;
    const declaredLicense = window.prompt("Licencia declarada por la fuente (por ejemplo MIT). Déjala vacía si no se conoce.", "") || undefined;
    const sourceUrl = window.prompt("URL de procedencia o repositorio (opcional)", "") || undefined;
    await task(`file:${file.name}`, () => installPluginPackage(file, { declaredLicense, sourceUrl }), "Paquete instalado sin ejecutar código.");
  };
  const assign = async (plugin: InstalledPlugin, action: PluginActionDefinition, key = selectedKey) => {
    const actionKey = `${plugin.id}:${action.id}`;
    try {
      await onAssign(key, { pluginId: plugin.id, actionId: action.id, settings: parseSettings(actionKey) });
      setMessage(`“${action.name}” asignada a la tecla ${key + 1}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };
  return <div className="section-stack plugin-hub">
    <div className="section-title"><span><em>06</em> Plugin Hub</span><h1>Plugins propios, listos para usar</h1><p>OBS, Spotify, Discord, Twitch y Camo ahora tienen módulos nativos de NEXORA. Los paquetes externos siguen disponibles únicamente como compatibilidad experimental.</p></div>
    <section className="plugin-toolbar glass-card">
      <label className="plugin-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar plugins o acciones" /></label>
      <select value={ecosystem} onChange={(event) => setEcosystem(event.target.value)}><option value="all">Todos los ecosistemas</option><option value="streamdeck">Stream Deck</option><option value="macrodeck">Macro Deck</option><option value="nexora">NEXORA</option></select>
      <label className="secondary-button plugin-import"><Upload size={16} /> Plugin externo experimental<input type="file" accept=".streamDeckPlugin,.macroDeckPlugin,.zip" onChange={(event) => { void importPackage(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
    </section>
    <details className="glass-card plugin-install-guide">
      <summary><CircleHelp size={17} /> Cómo instalar y usar un plugin</summary>
      <ol><li>Pulsa <strong>Importar paquete</strong> y elige un ZIP o .streamDeckPlugin abierto y sin DRM.</li><li>Revisa la licencia, procedencia y permisos mostrados por NEXORA.</li><li>Pulsa <strong>Autorizar ejecución</strong> sólo si confías en el desarrollador.</li><li>Arrastra una acción del plugin a una tecla y abre <strong>Configurar</strong> cuando exista Property Inspector.</li></ol>
      <p><strong>Importante:</strong> los paquetes oficiales de Elgato Marketplace (como Twitch, Discord, Spotify, OBS o Camo) pueden llevar DRM y están hechos para la app Stream Deck. NEXORA los detecta, pero no intenta romper esa protección. Para esos servicios se usan integraciones NEXORA autorizadas o una versión abierta del plugin.</p>
    </details>
    {message && <p className={`device-message ${/error|no |inválid|fall/i.test(message) ? "error" : "ok"}`}>{message}</p>}
    <div className="hub-heading"><h2>Plugins nativos NEXORA</h2><span>{NATIVE_PLUGINS.length} incluidos · sin instalación</span></div>
    <div className="native-plugin-grid">
      {NATIVE_PLUGINS.filter((plugin) => matches(plugin.name, "nexora")).map((plugin) => <article className="glass-card native-plugin-card" key={plugin.id}>
        <header><div><span className="ecosystem nexora">NEXORA</span><h2>{plugin.name}</h2></div><span className={`native-plugin-status ${plugin.status}`}>{plugin.status === "ready" ? "Listo" : "Requiere conexión"}</span></header>
        <p>{plugin.description}</p>
        <div className="native-plugin-actions">{plugin.actions.map((action) => {
          const payload: NativeActionDrop = { kind: action.kind, value: action.value, name: `${plugin.name} · ${action.name}`, settings: action.settings };
          const configurable = Boolean(action.fields?.length);
          const needsConfiguration = Boolean(action.fields?.some((field) => field.required && !action.settings?.[field.key]));
          return <div key={action.id}><span><strong>{action.name}</strong><small>{action.description}{configurable ? " · Configurable por tecla" : ""}</small></span><button type="button" className="secondary-button" onClick={() => { onAssignNative(selectedKey, payload); setMessage(`“${action.name}” asignada a la tecla ${selectedKey + 1}.${configurable ? " Configúrala en las propiedades de DisplayPad." : ""}`); }}>Asignar</button><button type="button" className="secondary-button" disabled={needsConfiguration} title={needsConfiguration ? "Asigna la acción y completa sus propiedades" : "Probar acción"} onClick={() => { const source = keys[selectedKey]; if (!source) return; void executeConfiguredKey({ ...source, actions: [{ kind: action.kind, value: action.value, settings: action.settings }] }).then(setMessage).catch((error) => setMessage(error instanceof Error ? error.message : String(error))); }}><Play size={13} /> Probar</button></div>;
        })}</div>
      </article>)}
    </div>
    <section className="glass-card plugin-drop-panel"><div><span className="eyebrow">ASIGNACIÓN RÁPIDA</span><h2>Arrastra una acción hacia una tecla</h2><p>Los ajustes se guardan de forma independiente en cada botón.</p></div><div className="plugin-drop-grid">{keys.map((key) => <button type="button" key={key.index} className={selectedKey === key.index ? "selected" : ""} onDragOver={(event) => { if (event.dataTransfer.types.includes(NEXORA_PLUGIN_ACTION_MIME)) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); try { void onAssign(key.index, JSON.parse(event.dataTransfer.getData(NEXORA_PLUGIN_ACTION_MIME)) as PluginDrop).then(() => setMessage(`Acción asignada a la tecla ${key.index + 1}.`)); } catch { setMessage("La acción arrastrada no es válida."); } }}><strong>{key.index + 1}</strong><span>{key.name}</span></button>)}</div></section>
    <div className="hub-heading"><h2>Catálogo gratuito verificado</h2><span>{catalog.length} disponible</span></div>
    <div className="plugin-grid">
      {catalog.filter((item) => matches(item.name, item.ecosystem)).map((item) => {
        const installedPlugin = plugins.find((plugin) => plugin.id === item.pluginId);
        const installed = installedPlugin?.version === item.version;
        const updateAvailable = Boolean(installedPlugin && !installed);
        return <article className="glass-card plugin-card" key={item.id}><div className="plugin-card-head"><PackageOpen /><span className={`ecosystem ${item.ecosystem}`}>{item.ecosystem}</span></div><h2>{item.name}</h2><p>{item.description}</p><dl><div><dt>Desarrollador</dt><dd>{item.developer}</dd></div><div><dt>Versión</dt><dd>{item.version}</dd></div><div><dt>Licencia</dt><dd>{item.license} · gratuito</dd></div><div><dt>Integridad</dt><dd title={item.sha256}>{item.sha256.slice(0, 12)}…</dd></div></dl><div className="plugin-card-actions"><a className="secondary-button" href={item.sourceUrl} target="_blank" rel="noreferrer">Fuente ↗</a><button type="button" className="primary-button" disabled={installed || busy === item.id} onClick={() => { if (!window.confirm(`¿Descargar e instalar “${item.name}” desde la fuente oficial? Se verificará SHA-256 y no se ejecutará todavía.`)) return; void task(item.id, () => installCatalogPlugin(item.id), updateAvailable ? "Plugin actualizado y verificado." : "Plugin oficial instalado y verificado."); }}><Download size={15} /> {installed ? "Instalado" : updateAvailable ? "Actualizar" : "Instalar"}</button></div></article>;
      })}
    </div>
    <div className="hub-heading"><h2>Instalados</h2><span>{plugins.length} plugins</span></div>
    <div className="installed-plugins">
      {plugins.filter((plugin) => matches(plugin.name, plugin.ecosystem)).map((plugin) => <article className="glass-card installed-plugin" key={plugin.id}>
        <header><div><span className={`ecosystem ${plugin.ecosystem}`}>{plugin.ecosystem}</span><h2>{plugin.name}</h2><p>{plugin.developer} · v{plugin.version} · {plugin.license}</p></div><span className={`compatibility ${plugin.compatibility}`}>{plugin.compatibility === "experimental-runtime" ? "Runtime experimental" : plugin.compatibility === "inspection-only" ? "Solo inspección" : "Solo manifiesto"}</span></header>
        <p>{plugin.description || "Sin descripción."}</p>
        <div className="permission-box"><ShieldCheck size={18} /><div><strong>Permisos declarados o inferidos</strong><p>{plugin.permissions.length ? plugin.permissions.join(" · ") : "Ningún permiso declarado por el manifiesto."}</p></div></div>
        <div className="plugin-runtime-actions">
          {plugin.compatibility === "experimental-runtime" && <button type="button" className={plugin.executionApproved ? "danger-button" : "primary-button"} disabled={busy === plugin.id} onClick={() => { const approved = !plugin.executionApproved; if (approved && !window.confirm(`¿Autorizar la primera ejecución de “${plugin.name}”?\n\nPermisos: ${plugin.permissions.join(", ")}\n\nEl plugin ejecutará código local bajo tu cuenta de Windows.`)) return; void task(plugin.id, () => setPluginExecutionApproval(plugin.id, approved), approved ? "Ejecución autorizada." : "Ejecución revocada."); }}>{plugin.executionApproved ? "Revocar ejecución" : "Autorizar ejecución"}</button>}
          <button type="button" className="danger-button" onClick={() => { if (!window.confirm(`¿Desinstalar “${plugin.name}” y eliminar sus archivos instalados?`)) return; void task(plugin.id, () => uninstallPlugin(plugin.id), "Plugin desinstalado."); }}><Trash2 size={15} /> Desinstalar</button>
        </div>
        <div className="plugin-actions-library"><h3>Acciones disponibles</h3>{plugin.actions.length ? plugin.actions.map((action) => {
          const actionKey = `${plugin.id}:${action.id}`;
          let dragSettings: Record<string, unknown> = {};
          try { dragSettings = parseSettings(actionKey); } catch {}
          return <div className="plugin-action-row" draggable key={action.id} onDragStart={(event) => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData(NEXORA_PLUGIN_ACTION_MIME, JSON.stringify({ pluginId: plugin.id, actionId: action.id, settings: dragSettings })); }}>
            <div><strong>{action.name}</strong><p>{action.description || "Acción del plugin"}</p></div>
            <details className="advanced-settings"><summary>Ajustes avanzados</summary><textarea aria-label={`Configuración avanzada de ${action.name}`} value={settings[actionKey] ?? "{}"} onChange={(event) => setSettings((current) => ({ ...current, [actionKey]: event.target.value }))} spellCheck={false} /></details>
            <button type="button" className="secondary-button" onClick={() => void assign(plugin, action)} title={`Asignar a tecla ${selectedKey + 1}`}>Tecla {selectedKey + 1}</button>
            {action.configurable && <button type="button" className="secondary-button" disabled={!plugin.executionApproved || busy === `pi:${actionKey}`} onClick={() => {
              let parsed: Record<string, unknown>;
              try { parsed = parseSettings(actionKey); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); return; }
              if (!onOpenInspector) return;
              void task(`pi:${actionKey}`, () => onOpenInspector(plugin, action, selectedKey, parsed), "Property Inspector abierto; sus cambios se guardan en tiempo real.");
            }}><Settings size={14} /> Configurar</button>}
            <button type="button" className="secondary-button" disabled={!plugin.executionApproved || busy === actionKey} onClick={() => { let parsed: Record<string, unknown>; try { parsed = parseSettings(actionKey); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); return; } void task(actionKey, () => executePluginAction(plugin.id, action.id, parsed, selectedKey), `Acción “${action.name}” ejecutada en simulación.`); }}><Play size={14} /> Probar</button>
          </div>;
        }) : <p className="empty-actions">El manifiesto no expone acciones. Macro Deck las anuncia al conectarse a su runtime, que aún no se ejecuta en esta etapa.</p>}</div>
      </article>)}
      {!plugins.length && <div className="glass-card empty-plugins"><Boxes size={34} /><h2>No hay plugins instalados</h2><p>Instala la muestra verificada o importa un paquete externo. Importar nunca autoriza su ejecución automáticamente.</p></div>}
    </div>
  </div>;
}

function DisplayPadPanel({
  profile,
  selectedFolderId,
  selectedKey,
  onNavigate,
  onSelectKey,
  onCreateFolder,
  onDeleteFolder,
  onApplyPage,
  onPluginDrop,
  onNativeDrop,
  onKeyMove,
  onAssetDrop,
  onFileDrop,
  onFolderMove,
  runtimeFeedback,
  hardwareReady,
}: {
  profile: Profile;
  selectedFolderId: string | null;
  selectedKey: number;
  onNavigate: (folderId: string | null) => void;
  onSelectKey: (index: number) => void;
  onCreateFolder: () => void;
  onDeleteFolder: () => void;
  onApplyPage: (keys: KeyConfig[]) => Promise<string>;
  onPluginDrop: (key: number, value: PluginDrop) => void;
  onNativeDrop: (key: number, value: NativeActionDrop) => void;
  onKeyMove: (source: number, target: number, copy: boolean) => void;
  onAssetDrop: (key: number, assetId: string) => void;
  onFileDrop: (key: number, files: FileList) => void;
  onFolderMove: (sourceId: string, targetParentId: string | null) => void;
  runtimeFeedback: Record<number, RuntimeKeyFeedback>;
  hardwareReady: boolean;
}) {
  const folder = findFolder(profile.folders, selectedFolderId);
  const keys = folder?.keys ?? profile.keys;
  const visibleFolders = folder?.children ?? profile.folders;
  const [hardwareMessage, setHardwareMessage] = useState("");
  return (
    <div className="section-stack">
      <div className="section-title"><span><em>01</em> DisplayPad</span><h1>Doce teclas, niveles ilimitados</h1><p>La raíz y cada carpeta mantienen doce teclas independientes. La profundidad está limitada a ocho niveles para evitar ciclos y navegación incontrolable.</p></div>
      <section className="device-panel glass-card">
        <div className="panel-heading"><div><span className="eyebrow">{folder ? "CARPETA" : "PERFIL"}</span><h2 draggable={Boolean(folder)} onDragStart={(event) => { if (folder) event.dataTransfer.setData(NEXORA_FOLDER_MIME, folder.id); }}>{folder?.name ?? profile.name}</h2></div><div className="folder-actions"><button type="button" className="primary-button" disabled={!hardwareReady} onClick={() => { if (!window.confirm("¿Enviar esta página completa al DisplayPad?")) return; setHardwareMessage("Enviando página…"); void onApplyPage(keys).then(setHardwareMessage).catch((error) => setHardwareMessage(error instanceof Error ? error.message : String(error))); }}><MonitorUp size={16} /> Aplicar al DisplayPad</button><button type="button" className="secondary-button" onClick={onCreateFolder}><FolderTree size={16} /> Nueva {folder ? "subcarpeta" : "carpeta"}</button>{folder && <button type="button" className="danger-button" onClick={onDeleteFolder}><Trash2 size={16} /> Eliminar carpeta</button>}</div></div>
        <div className="folder-strip"><button type="button" className={!folder ? "active" : ""} onClick={() => onNavigate(null)} onDragOver={(event) => { if (event.dataTransfer.types.includes(NEXORA_FOLDER_MIME)) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); const source = event.dataTransfer.getData(NEXORA_FOLDER_MIME); if (source) onFolderMove(source, null); }}><FolderTree size={14} /> Raíz</button>{visibleFolders.map((item) => <button type="button" draggable key={item.id} className={selectedFolderId === item.id ? "active" : ""} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData(NEXORA_FOLDER_MIME, item.id); }} onDragOver={(event) => { if (event.dataTransfer.types.includes(NEXORA_FOLDER_MIME)) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); const source = event.dataTransfer.getData(NEXORA_FOLDER_MIME); if (source) onFolderMove(source, item.id); }} onClick={() => onNavigate(item.id)}><FolderTree size={14} /> {item.name}<small>{item.children.length} subcarpetas</small></button>)}</div>
        <KeyGrid keys={keys} selected={selectedKey} runtimeFeedback={runtimeFeedback} onSelect={onSelectKey} onPluginDrop={onPluginDrop} onNativeDrop={onNativeDrop} onKeyMove={onKeyMove} onAssetDrop={onAssetDrop} onFileDrop={onFileDrop} />
        {hardwareMessage && <p className="device-message ok">{hardwareMessage}</p>}
        <div className="device-footer"><span><FolderTree size={15} /> {folder ? `Carpeta ${folder.name}` : "Nivel raíz"}</span><span>{visibleFolders.length} carpetas visibles</span><span>12 teclas configurables</span></div>
      </section>
    </div>
  );
}

function IntegrationPanel({ state, selectedKey, onRefresh, onAssign }: { state: BootstrapState; selectedKey: number; onRefresh: () => void; onAssign: (key: number, value: NativeActionDrop) => void }) {
  const [url, setUrl] = useState("ws://127.0.0.1:4455");
  const [password, setPassword] = useState("");
  const [result, setResult] = useState("");
  const [testing, setTesting] = useState(false);

  const test = async () => {
    setTesting(true);
    setResult("");
    try { setResult(await testObsConnection(url, password)); onRefresh(); }
    catch (error) { setResult(error instanceof Error ? error.message : String(error)); }
    finally { setTesting(false); setPassword(""); }
  };
  const obsActions = NATIVE_PLUGINS.find((plugin) => plugin.id === "obs")?.actions ?? [];

  return (
    <div className="section-stack">
      <div className="section-title"><span><em>01</em> Integraciones independientes</span><h1>Conecta tu flujo</h1><p>OBS es la primera integración operativa. Las credenciales se usan solo durante la prueba y no se persisten aquí.</p></div>
      <div className="integration-layout">
        <div className="integration-list">
          {state.integrations.map((integration) => (
            <article className="integration-card" key={integration.id}>
              <div className="integration-icon">{integration.id === "obs" ? <Radio /> : <PlugZap />}</div>
              <div><h3>{integration.name}</h3><p>{integration.detail}</p></div>
              <span className={`mini-state ${integration.status}`}>{integration.status}</span>
            </article>
          ))}
          <section className="glass-card obs-action-library"><span className="eyebrow">ACCIONES OBS</span><h2>Control completo WebSocket 5.x</h2><p>Asigna una acción y completa sus propiedades desde el inspector de DisplayPad.</p>{obsActions.map((action) => {
            const payload: NativeActionDrop = { kind: "obs", value: action.value, name: action.name, settings: action.settings };
            const needsConfiguration = Boolean(action.fields?.some((field) => field.required && !action.settings?.[field.key]));
            return <div className="native-action-row" draggable key={action.id} onDragStart={(event) => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData(NEXORA_NATIVE_ACTION_MIME, JSON.stringify(payload)); }}><span><strong>{action.name}</strong>{action.fields?.length ? <small>Configurable</small> : null}</span><button type="button" className="secondary-button" onClick={() => { onAssign(selectedKey, payload); setResult(`“${action.name}” asignada. Configúrala en DisplayPad.`); }}>Tecla {selectedKey + 1}</button><button type="button" className="secondary-button" disabled={state.integrations[0]?.status !== "connected" || needsConfiguration} onClick={() => { void executeObsAction(action.value, action.settings).then(setResult).catch((error) => setResult(error instanceof Error ? error.message : String(error))); }}><Play size={14} /> Probar</button></div>;
          })}</section>
        </div>
        <div className="obs-config glass-card">
          <span className="eyebrow">OBS WEBSOCKET 5.X</span><h2>Probar conexión</h2>
          <label>Dirección<input value={url} onChange={(e) => setUrl(e.target.value)} /></label>
          <label>Contraseña<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" /></label>
          <button type="button" className="primary-button" onClick={test} disabled={testing}>{testing ? <LoaderCircle className="spin" size={17} /> : <Radio size={17} />} Conectar</button>
          {result && <div className="connection-result">{result}</div>}
        </div>
      </div>
    </div>
  );
}

function DeviceSettingsPanel({
  state,
  onModeChange,
  onRedetect,
}: {
  state: BootstrapState;
  onModeChange: (mode: DeviceMode) => Promise<void>;
  onRedetect: () => Promise<void>;
}) {
  const [listening, setListening] = useState(false);
  const [events, setEvents] = useState<ButtonEvent[]>([]);
  const [listenMessage, setListenMessage] = useState("");
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ phase: "idle", currentVersion: state.version, progress: 0, message: "Listo para buscar actualizaciones.", configured: state.updaterConfigured });
  const [updateBusy, setUpdateBusy] = useState(false);

  useEffect(() => {
    void getUpdateStatus().then(setUpdateStatus).catch((error) => setUpdateStatus((current) => ({ ...current, phase: "error", message: error instanceof Error ? error.message : String(error) })));
    return window.nexoraDesktop?.onEvent((value) => {
      if (!value || typeof value !== "object" || !("type" in value) || value.type !== "update-status" || !("status" in value)) return;
      setUpdateStatus(value.status as UpdateStatus);
    });
  }, []);

  const listen = async () => {
    setListening(true);
    setEvents([]);
    setListenMessage("Pulsa y suelta varias teclas durante 15 segundos…");
    try {
      const captured = await listenForButtonEvents(15_000);
      setEvents(captured);
      setListenMessage(captured.length ? `Capturados ${captured.length} cambios de estado.` : "No se recibieron pulsaciones.");
    } catch (error) {
      setListenMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setListening(false);
    }
  };

  return (
    <div className="section-stack">
      <div className="section-title"><span><em>07</em> Configuración</span><h1>Control explícito</h1><p>El modo de simulación siempre se distingue del hardware real.</p></div>
      <div className="glass-card settings-card">
        <h2>Modo del dispositivo</h2>
        <div className="segmented">
          <button className={state.device.mode === "simulation" ? "active" : ""} onClick={() => void onModeChange("simulation")}>Simulación</button>
          <button className={state.device.mode === "hardware" ? "active" : ""} onClick={() => void onModeChange("hardware")}>Hardware</button>
        </div>
        <p className={state.device.connected ? "device-message ok" : "device-message error"}>
          {state.device.connected
            ? `${state.device.name} detectado${state.device.vendorId ? ` · VID 0x${state.device.vendorId.toString(16).padStart(4, "0")} / PID 0x${(state.device.productId ?? 0).toString(16).padStart(4, "0")}` : ""}`
            : state.device.lastError || "No se detectó el dispositivo."}
        </p>
        {state.device.mode === "hardware" && (
          <div className="hardware-actions">
            <button type="button" className="secondary-button" onClick={() => void onRedetect()}><Activity size={16} /> Volver a detectar</button>
            <button type="button" className="primary-button" disabled={!state.device.connected || listening} onClick={() => void listen()}>{listening ? <LoaderCircle className="spin" size={16} /> : <Radio size={16} />} Escuchar pulsaciones 15 s</button>
          </div>
        )}
        <p>La prueba de pulsaciones abre únicamente la interfaz HID de control y no envía datos al dispositivo.</p>
        {listenMessage && <div className="listener-result"><strong>{listenMessage}</strong>{events.length > 0 && <div className="event-chips">{events.map((event, index) => <span key={`${event.timestampMs}-${event.key}-${index}`} className={event.pressed ? "pressed" : "released"}>T{event.key} {event.pressed ? "↓" : "↑"} · {event.timestampMs} ms <small>{event.rawOffset42.toString(16).padStart(2, "0")}/{event.rawOffset47.toString(16).padStart(2, "0")}</small></span>)}</div>}</div>}
        <hr />
        <h2>Actualizaciones</h2>
        <div className={`update-status ${updateStatus.phase}`}>
          <div><strong>NEXORA {updateStatus.currentVersion}</strong>{updateStatus.availableVersion && <span>Nueva: {updateStatus.availableVersion}</span>}</div>
          <p>{updateStatus.message}</p>
          {updateStatus.phase === "downloading" && <div className="update-progress"><span style={{ width: `${updateStatus.progress}%` }} /></div>}
        </div>
        <div className="hardware-actions">
          <button type="button" className="secondary-button" disabled={updateBusy || updateStatus.phase === "checking" || updateStatus.phase === "downloading"} onClick={() => { setUpdateBusy(true); void checkForAppUpdate().then(setUpdateStatus).catch((error) => setUpdateStatus((current) => ({ ...current, phase: "error", message: error instanceof Error ? error.message : String(error) }))).finally(() => setUpdateBusy(false)); }}>{updateStatus.phase === "checking" ? <LoaderCircle className="spin" size={16} /> : <Activity size={16} />} Buscar actualizaciones</button>
          <button type="button" className="primary-button" disabled={updateBusy || !["available", "downloaded"].includes(updateStatus.phase)} onClick={() => {
            if (!window.confirm(`¿Descargar NEXORA ${updateStatus.availableVersion || "nueva"}, cerrar la aplicación e instalarla automáticamente?`)) return;
            setUpdateBusy(true);
            void installAppUpdate().then(setUpdateStatus).catch((error) => setUpdateStatus((current) => ({ ...current, phase: "error", message: error instanceof Error ? error.message : String(error) }))).finally(() => setUpdateBusy(false));
          }}><Download size={16} /> {updateStatus.phase === "downloaded" ? "Instalar y reiniciar" : "Descargar e instalar"}</button>
        </div>
        <p>El canal usa GitHub Releases y verifica el SHA-512 publicado por electron-builder. La descarga solo comienza tras pulsar el botón.</p>
      </div>
    </div>
  );
}

function AboutPanel({ state, onOpenSettings }: { state: BootstrapState; onOpenSettings: () => void }) {
  return (
    <div className="section-stack">
      <div className="section-title"><span><em>08</em> Acerca de</span><h1>NEXORA Control Studio</h1><p>Control visual independiente para Mountain DisplayPad.</p></div>
      <div className="glass-card about-card">
        <div className="about-mark"><img src={bundledAsset("noxoralogo.png")} alt="" /><div><span>NEXORA</span><strong>Versión {state.version}</strong></div></div>
        <p>Configura teclas, imágenes, GIF, perfiles, carpetas, OBS y plugins compatibles desde una sola interfaz.</p>
        <dl>
          <div><dt>Dispositivo</dt><dd>{state.device.name}</dd></div>
          <div><dt>Modo actual</dt><dd>{state.device.mode === "hardware" ? "Hardware" : "Simulación"}</dd></div>
          <div><dt>Actualizaciones</dt><dd>{state.updaterConfigured ? "GitHub Releases configurado" : "No configuradas"}</dd></div>
        </dl>
        <div className="about-actions">
          <button type="button" className="primary-button" onClick={onOpenSettings}><Download size={16} /> Buscar actualizaciones</button>
          <a className="secondary-button" href="https://github.com/Pizzha541/Nexora" target="_blank" rel="noreferrer">Repositorio y versiones</a>
        </div>
        <small>NEXORA no está afiliado con Elgato. Los plugins protegidos por DRM requieren autorización de sus proveedores.</small>
      </div>
    </div>
  );
}

function MacrosPanel({ macros, onChange }: { macros: MacroDefinition[]; onChange: (macros: MacroDefinition[]) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(macros[0]?.id ?? null);
  const selected = macros.find((macro) => macro.id === selectedId) ?? null;
  const [draft, setDraft] = useState<MacroDefinition | null>(selected);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setDraft(macros.find((macro) => macro.id === selectedId) ?? null);
  }, [macros, selectedId]);

  const createMacro = () => {
    const macro: MacroDefinition = {
      id: crypto.randomUUID(),
      name: `Macro ${macros.length + 1}`,
      repetitions: 1,
      steps: [{ delayMs: 100, action: { kind: "hotkey", value: "" } }],
    };
    setSelectedId(macro.id);
    setDraft(macro);
    setMessage("Nueva macro sin guardar.");
  };

  const save = async () => {
    if (!draft) return;
    try {
      const saved = await saveBackendMacro(draft);
      onChange(macros.some((macro) => macro.id === saved.id) ? macros.map((macro) => macro.id === saved.id ? saved : macro) : [...macros, saved]);
      setSelectedId(saved.id);
      setMessage("Macro guardada con límites de seguridad.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const remove = async () => {
    if (!draft || !macros.some((macro) => macro.id === draft.id)) return;
    if (!window.confirm(`¿Eliminar “${draft.name}”? Se archivará una copia.`)) return;
    await deleteBackendMacro(draft.id);
    const remaining = macros.filter((macro) => macro.id !== draft.id);
    onChange(remaining);
    setSelectedId(remaining[0]?.id ?? null);
    setDraft(remaining[0] ?? null);
    setMessage("Macro eliminada y archivada.");
  };

  const updateStep = (index: number, patch: Partial<MacroDefinition["steps"][number]>) => {
    if (!draft) return;
    setDraft({ ...draft, steps: draft.steps.map((step, stepIndex) => stepIndex === index ? { ...step, ...patch } : step) });
  };

  return (
    <div className="section-stack">
      <div className="section-title"><span><em>03</em> Macros</span><h1>Secuencias bajo control</h1><p>Define pasos, pausas y repeticiones. El núcleo limita cada macro a 100 repeticiones, 500 pasos y 60 segundos por pausa.</p></div>
      <div className="macro-layout">
        <aside className="macro-list glass-card">
          <button type="button" className="primary-button" onClick={createMacro}><Plus size={16} /> Nueva macro</button>
          {macros.map((macro) => <button type="button" key={macro.id} className={selectedId === macro.id ? "active" : ""} onClick={() => setSelectedId(macro.id)}><Workflow size={16} /><span>{macro.name}<small>{macro.steps.length} pasos · ×{macro.repetitions}</small></span></button>)}
          {!macros.length && <p>Aún no hay macros guardadas.</p>}
        </aside>
        <section className="macro-editor glass-card">
          {draft ? <>
            <div className="macro-fields"><label>Nombre<input value={draft.name} maxLength={60} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label>Repeticiones<input type="number" min={1} max={100} value={draft.repetitions} onChange={(event) => setDraft({ ...draft, repetitions: Math.max(1, Math.min(100, Number(event.target.value))) })} /></label></div>
            <div className="macro-steps">{draft.steps.map((step, index) => <div className="macro-step" key={index}><span className="step-number">{index + 1}</span><label>Pausa ms<input type="number" min={0} max={60000} value={step.delayMs} onChange={(event) => updateStep(index, { delayMs: Math.max(0, Math.min(60000, Number(event.target.value))) })} /></label><label>Acción<select value={step.action.kind} onChange={(event) => updateStep(index, { action: { kind: event.target.value as typeof step.action.kind, value: "" } })}><option value="hotkey">Atajo</option><option value="text">Texto</option><option value="openUrl">Web</option><option value="launchPath">Aplicación/archivo</option><option value="media">Multimedia</option><option value="profile">Perfil</option></select></label><label>Valor<input value={step.action.value ?? ""} onChange={(event) => updateStep(index, { action: { ...step.action, value: event.target.value } })} /></label><button type="button" className="icon-button" disabled={draft.steps.length <= 1} onClick={() => setDraft({ ...draft, steps: draft.steps.filter((_, stepIndex) => stepIndex !== index) })}><Trash2 size={15} /></button></div>)}</div>
            <button type="button" className="secondary-button" disabled={draft.steps.length >= 500} onClick={() => setDraft({ ...draft, steps: [...draft.steps, { delayMs: 100, action: { kind: "hotkey", value: "" } }] })}><Plus size={15} /> Añadir paso</button>
            <div className="macro-footer"><button type="button" className="primary-button" onClick={() => void save()}><Save size={16} /> Guardar macro</button><button type="button" className="danger-button" disabled={!macros.some((macro) => macro.id === draft.id)} onClick={() => void remove()}><Trash2 size={16} /> Eliminar</button><span>{message || "La ejecución se habilitará tras completar el motor de acciones autorizado."}</span></div>
          </> : <div className="empty-editor"><Workflow size={32} /><h2>Crea una macro</h2><p>El editor persiste configuraciones reales; no ejecuta entradas hasta que el motor tenga cancelación y consentimiento.</p></div>}
        </section>
      </div>
    </div>
  );
}

function App() {
  const queryParameters = new URLSearchParams(window.location.search);
  const requestedSection = queryParameters.get("section") as Section | null;
  const initialSection: Section = requestedSection && sectionIds.includes(requestedSection) ? requestedSection : "displaypad";
  const [section, setSection] = useState<Section>(initialSection);
  const [moreOpen, setMoreOpen] = useState(false);
  const [state, setState] = useState<BootstrapState | null>(null);
  const [selectedKey, setSelectedKey] = useState(0);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pluginNotice, setPluginNotice] = useState("");
  const [runtimeFeedback, setRuntimeFeedback] = useState<Record<number, RuntimeKeyFeedback>>({});
  const [pressedKeys, setPressedKeys] = useState<Set<number>>(new Set());
  const [obsScenes, setObsScenes] = useState<string[]>([]);
  const [obsCatalog, setObsCatalog] = useState<ObsCatalog>(EMPTY_OBS_CATALOG);
  const [updatePrompt, setUpdatePrompt] = useState<UpdateStatus | null>(null);
  const [dismissedUpdate, setDismissedUpdate] = useState<string | null>(null);
  const [updatePromptBusy, setUpdatePromptBusy] = useState(false);
  const stateRef = useRef<BootstrapState | null>(null);
  const dirtyProfiles = useRef(new Map<string, Profile>());
  const saveTimer = useRef<number | null>(null);

  const refresh = async () => setState(await getBootstrapState());
  const loadObsScenes = useCallback(async () => {
    try {
      const [result, catalog] = await Promise.all([getObsScenes(), getObsCatalog()]);
      setObsScenes(catalog.scenes.length ? catalog.scenes : result.scenes);
      setObsCatalog(catalog);
      return { ...result, scenes: catalog.scenes.length ? catalog.scenes : result.scenes };
    } catch {
      setObsScenes([]);
      setObsCatalog(EMPTY_OBS_CATALOG);
      return undefined;
    }
  }, []);
  useEffect(() => { void refresh(); }, []);
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => {
    if (state) window.nexoraDesktop?.ready();
  }, [state]);
  useEffect(() => window.nexoraDesktop?.onEvent((value) => {
    if (!value || typeof value !== "object" || !("type" in value) || value.type !== "plugin-feedback") return;
    const feedback = value as { event?: string; keyIndex?: number; payload?: { title?: string; image?: string; state?: number } };
    if (Number.isInteger(feedback.keyIndex) && feedback.keyIndex !== undefined) {
      setRuntimeFeedback((current) => ({
        ...current,
        [feedback.keyIndex as number]: {
          ...current[feedback.keyIndex as number],
          ...(feedback.event === "setTitle" ? { title: feedback.payload?.title || "" } : {}),
          ...(feedback.event === "setImage" ? { image: feedback.payload?.image || "" } : {}),
          ...(feedback.event === "setState" ? { state: feedback.payload?.state } : {}),
          disconnected: false,
        },
      }));
    }
    const label = feedback.event === "setTitle" && feedback.payload?.title ? `Título: ${feedback.payload.title.replaceAll("\n", " · ")}` : feedback.event || "actualización";
    setPluginNotice(`Plugin · tecla ${(feedback.keyIndex ?? 0) + 1} · ${label}`);
    window.setTimeout(() => setPluginNotice(""), 3500);
  }), []);

  const flushProfileSaves = useCallback(async () => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const pendingProfiles = [...dirtyProfiles.current.values()];
    dirtyProfiles.current.clear();
    if (!pendingProfiles.length) return;
    setSaving(true);
    try {
      for (const profile of pendingProfiles) {
        const saved = await saveProfile(profile);
        setState((current) => current ? {
          ...current,
          profiles: current.profiles.map((item) => item.id === saved.id && item.updatedAt === profile.updatedAt ? saved : item),
        } : current);
      }
    } catch (error) {
      pendingProfiles.forEach((profile) => dirtyProfiles.current.set(profile.id, profile));
      setPluginNotice(`No se pudo guardar: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  }, []);

  const scheduleProfileSave = useCallback((profile: Profile) => {
    dirtyProfiles.current.set(profile.id, structuredClone(profile));
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { void flushProfileSaves(); }, 350);
  }, [flushProfileSaves]);

  useEffect(() => () => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    if (dirtyProfiles.current.size) void flushProfileSaves();
  }, [flushProfileSaves]);

  const activeProfile = useMemo(() => state?.profiles.find((profile) => profile.id === state.activeProfileId) ?? state?.profiles[0], [state]);
  const selectedFolder = useMemo(() => activeProfile ? findFolder(activeProfile.folders, selectedFolderId) : undefined, [activeProfile, selectedFolderId]);
  const selectedConfig = (selectedFolder?.keys ?? activeProfile?.keys)?.[selectedKey];

  const commitProfile = useCallback((profile: Profile, changedKeys: KeyConfig[] = []) => {
    setState((current) => current ? { ...current, profiles: current.profiles.map((item) => item.id === profile.id ? profile : item) } : current);
    scheduleProfileSave(profile);
    if (stateRef.current?.device.mode === "hardware") {
      changedKeys.forEach((key) => { void applyHardwareKey(key).catch((error) => setPluginNotice(`USB: ${error instanceof Error ? error.message : String(error)}`)); });
    }
  }, [scheduleProfileSave]);

  useEffect(() => window.nexoraDesktop?.onEvent((value) => {
    if (!value || typeof value !== "object" || !("type" in value)) return;
    if (value.type === "update-status" && "status" in value) {
      setUpdatePrompt(value.status as UpdateStatus);
      return;
    }
    if (value.type === "event") {
      const event = value as { name?: string; key?: number };
      if ((event.name === "buttonDown" || event.name === "buttonUp") && Number.isFinite(event.key)) {
        const index = Math.max(0, Math.min(11, Number(event.key) - 1));
        setPressedKeys((current) => {
          const next = new Set(current);
          if (event.name === "buttonDown") next.add(index); else next.delete(index);
          return next;
        });
        setSelectedKey(index);
      }
      return;
    }
    if (value.type === "navigate-profile") {
      const event = value as { profileId?: string };
      if (event.profileId) setState((current) => current ? { ...current, activeProfileId: event.profileId as string } : current);
      setSelectedFolderId(null);
      setSelectedKey(0);
      return;
    }
    if (value.type === "navigate-folder") {
      const event = value as { folderId?: string };
      setSelectedFolderId(event.folderId || null);
      setSelectedKey(0);
      return;
    }
    if (value.type === "obs-status") {
      const event = value as { connected?: boolean };
      setState((current) => current ? { ...current, integrations: current.integrations.map((integration) => integration.id === "obs" ? { ...integration, status: event.connected ? "connected" : "disconnected" } : integration) } : current);
      if (event.connected) void loadObsScenes(); else { setObsScenes([]); setObsCatalog(EMPTY_OBS_CATALOG); }
      return;
    }
    if (value.type === "obs-event") {
      const event = value as { eventType?: string };
      const catalogEvents = new Set(["SceneListChanged", "InputCreated", "InputRemoved", "InputNameChanged", "SceneItemCreated", "SceneItemRemoved", "SceneItemListReindexed", "SourceFilterCreated", "SourceFilterRemoved", "SourceFilterNameChanged", "ProfileListChanged", "SceneCollectionListChanged", "CurrentSceneCollectionChanged", "SceneTransitionCreated", "SceneTransitionRemoved", "SceneTransitionNameChanged"]);
      if (event.eventType && catalogEvents.has(event.eventType)) void loadObsScenes();
      return;
    }
    if (value.type === "plugin-runtime-status") {
      const status = value as { connected?: boolean; pluginId?: string };
      if (!status.connected) setRuntimeFeedback((current) => Object.fromEntries(Object.entries(current).map(([key, feedback]) => [key, { ...feedback, disconnected: true }])));
      setPluginNotice(`Plugin ${status.pluginId || ""} · ${status.connected ? "runtime conectado" : "runtime desconectado"}.`);
      return;
    }
    if (value.type !== "plugin-settings") return;
    const change = value as { contextId?: string; settings?: Record<string, unknown> };
    if (!change.contextId || !change.settings) return;
    const snapshot = stateRef.current;
    const profile = snapshot?.profiles.find((item) => item.id === snapshot.activeProfileId);
    if (!profile) return;
    const updated = updatePluginSettings(profile, change.contextId, change.settings);
    if (!updated) return;
    const changedKeys = keysForPage(updated, selectedFolderId).filter((key) => key.actions.some((action) => action.contextId === change.contextId));
    commitProfile(updated, changedKeys);
    setPluginNotice("Property Inspector · configuración actualizada y guardada.");
  }), [commitProfile, loadObsScenes, selectedFolderId]);

  const updateKey = (key: KeyConfig) => {
    if (!activeProfile) return;
    commitProfile(updateProfileKey(activeProfile, selectedFolderId, key), [key]);
  };

  const persistProfile = async () => {
    if (!activeProfile) return;
    dirtyProfiles.current.set(activeProfile.id, structuredClone(activeProfile));
    await flushProfileSaves();
  };

  useEffect(() => {
    if (!activeProfile || state?.device.mode !== "hardware") return;
    void applyHardwarePage(keysForPage(activeProfile, selectedFolderId)).catch((error) => setPluginNotice(`Sincronización pendiente: ${error instanceof Error ? error.message : String(error)}`));
  }, [activeProfile?.id, selectedFolderId, state?.device.mode, state?.device.connected]);

  const selectProfile = async (profile: Profile) => {
    await setActiveProfile(profile.id);
    setState((current) => current ? { ...current, activeProfileId: profile.id } : current);
    setSelectedFolderId(null);
    setSelectedKey(0);
  };

  const addProfile = async () => {
    const profile = await createBackendProfile(`Perfil ${state ? state.profiles.length + 1 : 1}`);
    setState((current) => current ? { ...current, profiles: [...current.profiles, profile], activeProfileId: profile.id } : current);
    await setActiveProfile(profile.id);
  };

  const duplicateActiveProfile = async () => {
    if (!activeProfile) return;
    const profile = await duplicateBackendProfile(activeProfile.id);
    setState((current) => current ? { ...current, profiles: [...current.profiles, profile], activeProfileId: profile.id } : current);
    await setActiveProfile(profile.id);
  };

  const deleteActiveProfile = async () => {
    if (!state || !activeProfile) return;
    if (state.profiles.length <= 1) return;
    if (!window.confirm(`¿Eliminar “${activeProfile.name}”? Se guardará una copia recuperable.`)) return;
    const activeProfileId = await deleteBackendProfile(activeProfile.id);
    setState((current) => current ? { ...current, profiles: current.profiles.filter((profile) => profile.id !== activeProfile.id), activeProfileId } : current);
  };

  const changeMode = async (mode: DeviceMode) => {
    const device = await setDeviceMode(mode);
    setState((current) => current ? { ...current, device } : current);
  };

  const redetectDevice = async () => {
    const device = await refreshDeviceStatus();
    setState((current) => current ? { ...current, device } : current);
  };

  const importAssets = async (files: FileList) => {
    const candidates = Array.from(files);
    const invalid = candidates.find((file) => !isSupportedVisualFile(file));
    if (invalid) throw new Error(`“${invalid.name}” no es PNG, JPG, WEBP o GIF válido de hasta 12 MB.`);
    const imported = await Promise.all(candidates.map((file) => importVisualAsset(file)));
    setState((current) => current ? {
      ...current,
      assets: [...current.assets, ...imported.filter((item) => !current.assets.some((existing) => existing.id === item.id))],
    } : current);
    return imported;
  };

  const importBaseCampPack = async () => {
    const result = await importBaseCampAssets();
    await refresh();
    return result;
  };

  const removeVisualAsset = async (asset: VisualAsset) => {
    await deleteVisualAsset(asset.id);
    visualAssetCache.delete(asset.id);
    await refresh();
  };

  const saveInitialScreen = async (visualSettings: VisualSettings) => {
    const saved = await saveVisualSettings(visualSettings);
    setState((current) => current ? { ...current, visualSettings: saved } : current);
  };

  const applyPageToHardware = async (keys: KeyConfig[]) => applyHardwarePage(keys);
  const applySelectedKeyToHardware = async () => {
    if (!selectedConfig) throw new Error("No hay una tecla seleccionada.");
    await persistProfile();
    return applyHardwareKey(selectedConfig);
  };

  const assignAssetToSelectedKey = (asset: VisualAsset) => {
    if (!selectedConfig) return;
    updateKey({ ...selectedConfig, iconPath: asset.id, animated: asset.animated });
    setSection("displaypad");
    setEditorOpen(true);
  };

  const assignAssetToKey = (keyIndex: number, assetId: string, importedAsset?: VisualAsset) => {
    if (!activeProfile || !state) return;
    const asset = importedAsset ?? state.assets.find((item) => item.id === assetId);
    const key = keysForPage(activeProfile, selectedFolderId)[keyIndex];
    if (!asset || !key) return;
    const configured = { ...key, iconPath: asset.id, animated: asset.animated };
    commitProfile(updateProfileKey(activeProfile, selectedFolderId, configured), [configured]);
    setSelectedKey(keyIndex);
  };

  const importFilesToKey = async (keyIndex: number, files: FileList) => {
    try {
      const imported = await importAssets(files);
      if (imported[0]) assignAssetToKey(keyIndex, imported[0].id, imported[0]);
      setPluginNotice(`${imported.length} recurso(s) importado(s); tecla ${keyIndex + 1} actualizada.`);
    } catch (error) {
      setPluginNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const moveKey = (source: number, target: number, copy: boolean) => {
    if (!activeProfile || source === target) return;
    try {
      const updated = moveProfileKey(activeProfile, selectedFolderId, source, target, copy);
      const page = keysForPage(updated, selectedFolderId);
      commitProfile(updated, copy ? [page[target]] : [page[source], page[target]]);
      setSelectedKey(target);
      setPluginNotice(copy ? `Tecla ${source + 1} copiada a ${target + 1}.` : `Teclas ${source + 1} y ${target + 1} intercambiadas.`);
    } catch (error) {
      setPluginNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const assignPluginAction = async (keyIndex: number, value: PluginDrop) => {
    if (!state || !activeProfile) return;
    const plugin = state.plugins.find((item) => item.id === value.pluginId);
    const action = plugin?.actions.find((item) => item.id === value.actionId);
    if (!plugin || !action) throw new Error("El plugin o la acción ya no están disponibles.");
    const currentKeys = selectedFolder?.keys ?? activeProfile.keys;
    const currentKey = currentKeys[keyIndex];
    if (!currentKey) throw new Error("Tecla fuera de rango.");
    const configured: KeyConfig = {
      ...currentKey,
      name: action.name.slice(0, 60),
      text: "",
      actions: [{ kind: "plugin", pluginId: plugin.id, actionId: action.id, contextId: crypto.randomUUID(), settings: value.settings }],
    };
    commitProfile(updateProfileKey(activeProfile, selectedFolderId, configured), [configured]);
    setSelectedKey(keyIndex);
  };

  const assignNativeAction = (keyIndex: number, value: NativeActionDrop) => {
    if (!activeProfile) return;
    const key = keysForPage(activeProfile, selectedFolderId)[keyIndex];
    if (!key) return;
    const configured: KeyConfig = {
      ...key,
      name: value.name.slice(0, 60),
      text: "",
      actions: [{ kind: value.kind, value: value.value, settings: value.settings || {}, steps: value.steps, states: value.states, ...(["multiAction", "multiSwitch"].includes(value.kind) ? { contextId: crypto.randomUUID() } : {}) }],
    };
    commitProfile(updateProfileKey(activeProfile, selectedFolderId, configured), [configured]);
    setSelectedKey(keyIndex);
    setPluginNotice(`“${value.name}” asignada a la tecla ${keyIndex + 1}.`);
  };

  const openPropertyInspector = async (plugin: InstalledPlugin, action: PluginActionDefinition, keyIndex: number, settings: Record<string, unknown>) => {
    if (!activeProfile) return;
    const key = keysForPage(activeProfile, selectedFolderId)[keyIndex];
    if (!key) throw new Error("Tecla fuera de rango.");
    const assigned = key.actions[0];
    const contextId = assigned?.kind === "plugin" && assigned.pluginId === plugin.id && assigned.actionId === action.id
      ? assigned.contextId || crypto.randomUUID()
      : crypto.randomUUID();
    const configured: KeyConfig = {
      ...key,
      name: action.name.slice(0, 60),
      text: action.name.slice(0, 6).toUpperCase(),
      actions: [{ kind: "plugin", pluginId: plugin.id, actionId: action.id, contextId, settings }],
    };
    commitProfile(updateProfileKey(activeProfile, selectedFolderId, configured), [configured]);
    setSelectedKey(keyIndex);
    await openPluginPropertyInspector(plugin.id, action.id, settings, contextId, keyIndex);
  };

  const moveFolderNode = (sourceId: string, targetParentId: string | null) => {
    if (!activeProfile) return;
    try {
      commitProfile(moveFolder(activeProfile, sourceId, targetParentId));
      setPluginNotice(targetParentId ? "Carpeta movida a la nueva ubicación." : "Carpeta movida a la raíz.");
    } catch (error) {
      setPluginNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const reorderProfileCards = (sourceId: string, targetId: string) => {
    if (!state) return;
    const profiles = reorderProfiles(state.profiles, sourceId, targetId);
    if (profiles === state.profiles) return;
    setState({ ...state, profiles });
    void setProfileOrder(profiles.map((profile) => profile.id)).catch((error) => setPluginNotice(`No se pudo guardar el orden: ${error instanceof Error ? error.message : String(error)}`));
  };

  const createFolder = async () => {
    if (!state || !activeProfile) return;
    const name = window.prompt(selectedFolderId ? "Nombre de la subcarpeta" : "Nombre de la carpeta", `Carpeta ${activeProfile.folders.length + 1}`)?.trim();
    if (!name) return;
    const folder: FolderNode = { id: crypto.randomUUID(), name, keys: Array.from({ length: 12 }, (_, index) => ({ index, name: `Tecla ${index + 1}`, color: "#000000", text: "", animated: false, actions: [{ kind: "none" }] })), children: [] };
    const updatedProfile = selectedFolderId
      ? { ...activeProfile, folders: updateFolderTree(activeProfile.folders, selectedFolderId, (parent) => ({ ...parent, children: [...parent.children, folder] })) }
      : { ...activeProfile, folders: [...activeProfile.folders, folder] };
    commitProfile({ ...updatedProfile, updatedAt: new Date().toISOString() });
    setSelectedFolderId(folder.id);
    setSelectedKey(0);
  };

  const deleteSelectedFolder = async () => {
    if (!state || !activeProfile || !selectedFolderId || !selectedFolder) return;
    if (!window.confirm(`¿Eliminar la carpeta “${selectedFolder.name}” y todas sus subcarpetas? El perfil anterior quedará en backups.`)) return;
    commitProfile({ ...activeProfile, folders: removeFolderFromTree(activeProfile.folders, selectedFolderId), updatedAt: new Date().toISOString() });
    setSelectedFolderId(null);
    setSelectedKey(0);
  };

  if (!state || !activeProfile) return <div className="app-loading"><LoaderCircle className="spin" /> Cargando NEXORA…</div>;

  const mainContent = section === "integrations" ? <IntegrationPanel state={state} selectedKey={selectedKey} onRefresh={refresh} onAssign={assignNativeAction} /> : section === "library" ? (
    <LibraryPanel assets={state.assets} onImport={importAssets} onAssign={assignAssetToSelectedKey} onDelete={removeVisualAsset} onImportBaseCamp={importBaseCampPack} />
  ) : section === "initial" ? (
    <InitialScreenPanel assets={state.assets} settings={state.visualSettings} hardwareReady={state.device.mode === "hardware" && state.device.connected} onSave={saveInitialScreen} onApply={applyInitialScreen} />
  ) : section === "plugins" ? (
    <PluginsPanel plugins={state.plugins} catalog={state.pluginCatalog} keys={selectedFolder?.keys ?? activeProfile.keys} selectedKey={selectedKey} onRefresh={refresh} onAssign={assignPluginAction} onAssignNative={assignNativeAction} onOpenInspector={openPropertyInspector} />
  ) : section === "displaypad" ? (
    <EditorWorkspace
      library={<ActionLibrary
        profiles={state.profiles}
        folders={activeProfile.folders}
        plugins={state.plugins}
        obsScenes={obsScenes}
        obsConnected={state.integrations.some((integration) => integration.id === "obs" && integration.status === "connected")}
        onRefreshObs={() => { void loadObsScenes().then((result) => setPluginNotice(result ? `${result.scenes.length} escenas de OBS cargadas.` : "Conecta OBS desde Integraciones.")); }}
        onAssignNative={(action) => assignNativeAction(selectedKey, action)}
        onAssignPlugin={(action) => { void assignPluginAction(selectedKey, action); }}
      />}
      center={<div className="device-stage">
        <div className="stage-toolbar">
          <div><span className="eyebrow">EDITOR EN TIEMPO REAL</span><h1>{selectedFolder?.name ?? activeProfile.name}</h1></div>
          <div className="stage-controls">
            <select aria-label="Perfil activo" value={activeProfile.id} onChange={(event) => { const profile = state.profiles.find((item) => item.id === event.target.value); if (profile) void selectProfile(profile); }}>{state.profiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.name}</option>)}</select>
          </div>
        </div>
        <div className="stage-folder-bar">
          <button type="button" className={!selectedFolderId ? "active" : ""} onClick={() => { setSelectedFolderId(null); setSelectedKey(0); }}><Layers3 size={14} /> Principal</button>
          {activeProfile.folders.map((folder) => <button type="button" className={selectedFolderId === folder.id ? "active" : ""} key={folder.id} onClick={() => { setSelectedFolderId(folder.id); setSelectedKey(0); }}><FolderTree size={14} /> {folder.name}</button>)}
          <button type="button" className="stage-add" onClick={() => void createFolder()}><Plus size={14} /> Carpeta</button>
          {selectedFolderId && <button type="button" className="stage-delete" onClick={() => void deleteSelectedFolder()}><Trash2 size={14} /></button>}
        </div>
        <div className="displaypad-frame">
          <div className="displaypad-brand"><span>NEXORA</span><small>DISPLAYPAD 6 × 2</small></div>
          <KeyGrid
            keys={keysForPage(activeProfile, selectedFolderId)}
            selected={selectedKey}
            pressedKeys={pressedKeys}
            runtimeFeedback={runtimeFeedback}
            onSelect={(index) => { setSelectedKey(index); setEditorOpen(false); }}
            onActivate={(index) => {
              const key = keysForPage(activeProfile, selectedFolderId)[index];
              if (!key) return;
              void executeConfiguredKey(key).then(setPluginNotice).catch((error) => setPluginNotice(error instanceof Error ? error.message : String(error)));
            }}
            onPluginDrop={(key, value) => { void assignPluginAction(key, value); }}
            onNativeDrop={assignNativeAction}
            onKeyMove={moveKey}
            onAssetDrop={assignAssetToKey}
            onFileDrop={(key, files) => { void importFilesToKey(key, files); }}
          />
          <div className="stage-hint"><span>1 · Selecciona una tecla</span><span>2 · Elige una acción</span><span>3 · Configúrala abajo</span></div>
        </div>
        <div className="stage-footer">
          <span><Cpu size={14} /> {state.device.name}</span>
          <span><Activity size={14} /> {state.device.mode === "hardware" ? (state.device.connected ? "Hardware detectado" : "Hardware no detectado") : "Simulación"}</span>
          <button type="button" className="secondary-button" disabled={state.device.mode !== "hardware" || !state.device.connected} onClick={() => void applyPageToHardware(keysForPage(activeProfile, selectedFolderId)).then(setPluginNotice).catch((error) => setPluginNotice(error instanceof Error ? error.message : String(error)))}><MonitorUp size={15} /> Enviar página</button>
        </div>
      </div>}
      inspector={selectedConfig ? <KeyInspector
        keyConfig={selectedConfig}
        assetPreview={selectedConfig.iconPath ? <AssetVisual assetId={selectedConfig.iconPath} alt={selectedConfig.name} /> : undefined}
        assets={state.assets}
        profiles={state.profiles}
        folders={activeProfile.folders}
        plugins={state.plugins}
        obsCatalog={obsCatalog}
        obsConnected={state.integrations.some((integration) => integration.id === "obs" && integration.status === "connected")}
        onChange={updateKey}
        onImport={importAssets}
        onPickFile={pickFile}
        onOpenPluginInspector={(plugin, actionId, settings) => {
          const action = plugin.actions.find((item) => item.id === actionId);
          if (action) void openPropertyInspector(plugin, action, selectedKey, settings).catch((error) => setPluginNotice(error instanceof Error ? error.message : String(error)));
        }}
        onTest={() => void executeConfiguredKey(selectedConfig).then(setPluginNotice).catch((error) => setPluginNotice(error instanceof Error ? error.message : String(error)))}
      /> : <div className="empty-inspector">Selecciona una tecla</div>}
    />
  ) : section === "macros" ? (
    <MacrosPanel macros={state.macros} onChange={(macros) => setState((current) => current ? { ...current, macros } : current)} />
  ) : section === "profiles" ? (
    <div className="section-stack"><div className="section-title"><span><em>02</em> Perfiles</span><h1>Contextos que se adaptan</h1><p>Crea perfiles independientes y arrástralos para cambiar su orden.</p></div><div className="profile-actions"><button type="button" className="secondary-button" onClick={() => void duplicateActiveProfile()}><Copy size={16} /> Duplicar activo</button><button type="button" className="danger-button" disabled={state.profiles.length <= 1} onClick={() => void deleteActiveProfile()}><Trash2 size={16} /> Eliminar activo</button></div><div className="profile-grid">{state.profiles.map((profile) => <button type="button" draggable key={profile.id} className={`profile-card ${profile.id === activeProfile.id ? "active" : ""}`} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData(NEXORA_PROFILE_MIME, profile.id); }} onDragOver={(event) => { if (event.dataTransfer.types.includes(NEXORA_PROFILE_MIME)) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); const source = event.dataTransfer.getData(NEXORA_PROFILE_MIME); if (source) reorderProfileCards(source, profile.id); }} onClick={() => void selectProfile(profile)}><Layers3 /><div><h3>{profile.name}</h3><p>{profile.description}</p><small>{profile.keys.length} teclas · {profile.automaticApp || "Manual"}</small></div><ChevronRight /></button>)}<button type="button" className="profile-card new" onClick={() => void addProfile()}><Sparkles /><div><h3>Nuevo perfil</h3><p>Parte de una configuración limpia y segura.</p></div></button></div></div>
  ) : section === "settings" ? (
    <DeviceSettingsPanel state={state} onModeChange={changeMode} onRedetect={redetectDevice} />
  ) : section === "about" ? (
    <AboutPanel state={state} onOpenSettings={() => setSection("settings")} />
  ) : (
    <div className="dashboard-grid">
      <section className="hero-card">
        <div><span className="eyebrow">CENTRO DE CONTROL</span><h1>Tu flujo, en doce teclas.</h1><p>Personaliza acciones, perfiles e integraciones desde una aplicación ligera e independiente.</p><StatusPill connected={state.device.connected} mode={state.device.mode} /></div>
        <div className="hero-orb"><img src={bundledAsset("noxoralogo.png")} alt="NEXORA" /></div>
      </section>
      <section className="device-panel glass-card">
        <div className="panel-heading"><div><span className="eyebrow">MOUNTAIN DISPLAYPAD</span><h2>{activeProfile.name}</h2></div><button type="button" className="secondary-button" onClick={() => setSection("displaypad")}><WandSparkles size={16} /> Personalizar</button></div>
        <KeyGrid keys={activeProfile.keys} selected={selectedKey} runtimeFeedback={runtimeFeedback} onSelect={(index) => { setSelectedFolderId(null); setSelectedKey(index); setEditorOpen(true); }} onPluginDrop={(key, value) => { void assignPluginAction(key, value); }} onNativeDrop={assignNativeAction} onKeyMove={moveKey} onAssetDrop={assignAssetToKey} onFileDrop={(key, files) => { void importFilesToKey(key, files); }} />
        <div className="device-footer"><span><Cpu size={15} /> {state.device.name}</span><span><Activity size={15} /> {state.device.mode === "hardware" ? "HID" : "Motor simulado"}</span><span>Perfil actualizado {new Date(activeProfile.updatedAt).toLocaleDateString("es-ES")}</span></div>
      </section>
      <section className="metric-card"><MonitorUp /><div><span>Perfil activo</span><strong>{activeProfile.name}</strong></div><ChevronRight /></section>
      <section className="metric-card"><Radio /><div><span>OBS Studio</span><strong>{state.integrations[0]?.status ?? "sin configurar"}</strong></div><ChevronRight /></section>
      <section className="metric-card"><Command /><div><span>Macros</span><strong>Motor protegido</strong></div><ChevronRight /></section>
    </div>
  );

  const updatePromptVisible = shouldShowUpdatePrompt(updatePrompt, dismissedUpdate);

  return (
    <div className={`app-shell modern-shell ${section === "displaypad" ? "editor-mode" : ""}`}>
      <main className="main-area">
        <header className="modern-appbar">
          <button type="button" className="modern-brand" onClick={() => setSection("displaypad")} title="Volver al DisplayPad"><img src={bundledAsset("noxoralogo.png")} alt="" /><span>NEXORA<small>v{state.version}</small></span></button>
          <nav className="modern-tabs" aria-label="Secciones principales de NEXORA">{primaryNavigation.map((item) => <button type="button" key={item.id} className={section === item.id ? "active" : ""} onClick={() => { setSection(item.id); setMoreOpen(false); }} title={item.label}><item.icon size={16} /><span>{item.label}</span></button>)}</nav>
          <div className="modern-app-actions">
            <div className={`more-navigation ${moreOpen ? "open" : ""}`}>
              <button type="button" className={`more-navigation-trigger ${secondaryNavigation.some((item) => item.id === section) ? "active" : ""}`} onClick={() => setMoreOpen((value) => !value)} aria-expanded={moreOpen}><MoreHorizontal size={17} /><span>Más</span></button>
              {moreOpen && <div className="more-navigation-menu">{secondaryNavigation.map((item) => <button type="button" key={item.id} className={section === item.id ? "active" : ""} onClick={() => { setSection(item.id); setMoreOpen(false); }}><item.icon size={17} /><span><strong>{item.label}</strong><small>{item.description}</small></span></button>)}</div>}
            </div>
            <StatusPill connected={state.device.connected} mode={state.device.mode} />
            <button type="button" className={`icon-button ${section === "settings" ? "active" : ""}`} title="Configuración" onClick={() => { setSection("settings"); setMoreOpen(false); }}><Settings size={17} /></button>
            <button type="button" className={`icon-button ${section === "about" ? "active" : ""}`} title="Acerca de" onClick={() => { setSection("about"); setMoreOpen(false); }}><CircleHelp size={17} /></button>
          </div>
        </header>
        {state.startupWarning && <div className="recovery-banner">{state.startupWarning}</div>}
        <div className={`content ${section === "displaypad" ? "editor-content" : ""}`}>{mainContent}</div>
      </main>
      {section !== "displaypad" && editorOpen && selectedConfig && <KeyEditor keyConfig={selectedConfig} assets={state.assets} hardwareReady={state.device.mode === "hardware" && state.device.connected} onImport={importAssets} onApplyHardware={applySelectedKeyToHardware} onChange={updateKey} onClose={() => setEditorOpen(false)} onSave={() => void persistProfile()} />}
      {updatePromptVisible && updatePrompt && <div className="update-popup-backdrop" role="dialog" aria-modal="true" aria-label="Nueva versión de NEXORA disponible">
        <section className="update-popup">
          <div className="update-popup-mark"><Download size={24} /></div>
          <span className="eyebrow">ACTUALIZACIÓN DISPONIBLE</span>
          <h2>NEXORA {updatePrompt.availableVersion}</h2>
          <p>{updatePrompt.message}</p>
          {updatePrompt.phase === "downloading" && <div className="update-progress"><span style={{ width: `${updatePrompt.progress}%` }} /></div>}
          <small>Tu configuración, perfiles e imágenes locales se conservarán.</small>
          <div className="update-popup-actions">
            <button type="button" className="secondary-button" disabled={updatePromptBusy || updatePrompt.phase === "installing"} onClick={() => setDismissedUpdate(updatePrompt.availableVersion ?? null)}>Más tarde</button>
            <button type="button" className="primary-button" disabled={updatePromptBusy || updatePrompt.phase === "downloading" || updatePrompt.phase === "installing"} onClick={() => {
              setUpdatePromptBusy(true);
              void installAppUpdate().then(setUpdatePrompt).catch((error) => setPluginNotice(`Actualización: ${error instanceof Error ? error.message : String(error)}`)).finally(() => setUpdatePromptBusy(false));
            }}>{updatePromptBusy || updatePrompt.phase === "downloading" ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />} {updatePrompt.phase === "downloaded" ? "Instalar y reiniciar" : updatePrompt.phase === "downloading" ? `Descargando ${Math.round(updatePrompt.progress)} %` : "Descargar e instalar"}</button>
          </div>
        </section>
      </div>}
      {saving && <div className="toast"><LoaderCircle className="spin" size={16} /> Guardando perfil…</div>}
      {pluginNotice && <div className="toast plugin-toast"><Boxes size={16} /> {pluginNotice}</div>}
    </div>
  );
}

export default App;

