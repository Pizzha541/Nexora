import { useEffect, useMemo, useState } from "react";
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
  setDeviceMode,
  testObsConnection,
  applyHardwareKey,
  applyHardwarePage,
  applyInitialScreen,
  importVisualAsset,
  readVisualAsset,
  saveVisualSettings,
  executePluginAction,
  installCatalogPlugin,
  installPluginPackage,
  setPluginExecutionApproval,
  uninstallPlugin,
} from "./lib/backend";
import type { BootstrapState, ButtonEvent, DeviceMode, FolderNode, InstalledPlugin, KeyConfig, MacroDefinition, PluginActionDefinition, PluginCatalogEntry, Profile, VisualAsset, VisualSettings } from "./types";

type Section = "dashboard" | "displaypad" | "profiles" | "library" | "initial" | "macros" | "integrations" | "plugins" | "settings" | "about";
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

const navigation: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "displaypad", label: "DisplayPad", icon: Gauge },
  { id: "profiles", label: "Perfiles", icon: Layers3 },
  { id: "library", label: "Biblioteca", icon: ImagePlus },
  { id: "initial", label: "Initial Screen", icon: ScreenShare },
  { id: "macros", label: "Macros", icon: Workflow },
  { id: "integrations", label: "Integraciones", icon: PlugZap },
  { id: "plugins", label: "Plugins", icon: Boxes },
  { id: "settings", label: "Configuración", icon: Settings },
  { id: "about", label: "Acerca de", icon: CircleHelp },
];

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

function Splash({ onDone }: { onDone: () => void }) {
  const [videoEnded, setVideoEnded] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), 650);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const watchdog = window.setTimeout(() => setVideoEnded(true), 20_000);
    return () => window.clearTimeout(watchdog);
  }, []);

  useEffect(() => {
    if (videoEnded && ready) onDone();
  }, [videoEnded, ready, onDone]);

  return (
    <div className="splash">
      <video
        autoPlay
        muted
        playsInline
        className="splash-video"
        src={bundledAsset("intro.mp4")}
        onEnded={() => setVideoEnded(true)}
        onError={() => setVideoEnded(true)}
      />
      <div className="splash-status"><LoaderCircle size={16} className="spin" /> Inicializando NEXORA</div>
      <button type="button" className="splash-skip" onClick={() => setVideoEnded(true)}>Omitir intro</button>
    </div>
  );
}

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

type PluginDrop = { pluginId: string; actionId: string; settings: Record<string, unknown> };

function KeyGrid({ keys, selected, onSelect, onPluginDrop }: { keys: KeyConfig[]; selected: number; onSelect: (key: number) => void; onPluginDrop?: (key: number, value: PluginDrop) => void }) {
  return (
    <div className="key-grid" aria-label="Teclas del DisplayPad">
      {keys.map((key) => (
        <button
          type="button"
          key={key.index}
          className={`device-key ${selected === key.index ? "selected" : ""}`}
          style={{ "--key-color": key.color } as React.CSSProperties}
          onClick={() => onSelect(key.index)}
          onDragOver={(event) => { if (onPluginDrop && event.dataTransfer.types.includes("application/x-nexora-plugin-action")) event.preventDefault(); }}
          onDrop={(event) => {
            if (!onPluginDrop) return;
            event.preventDefault();
            try { onPluginDrop(key.index, JSON.parse(event.dataTransfer.getData("application/x-nexora-plugin-action")) as PluginDrop); } catch { /* Paquete de arrastre ajeno. */ }
          }}
        >
          <span className="key-glow" />
          <span className="key-content">{key.iconPath ? <AssetVisual assetId={key.iconPath} alt={key.name} /> : (key.text || key.index + 1)}</span>
          <small>{key.name}</small>
        </button>
      ))}
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
        <span>{keyConfig.iconPath ? <AssetVisual assetId={keyConfig.iconPath} alt={keyConfig.name} /> : (keyConfig.text || keyConfig.index + 1)}</span>
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
      <label className="file-button"><ImagePlus size={16} /> Importar desde archivo
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => {
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
          <option value="plugin" disabled={action.kind !== "plugin"}>Acción de Plugin Hub</option>
        </select>
      </label>
      {action.kind === "plugin" ? <div className="permission-box"><Boxes size={17} /><div><strong>Acción externa asignada</strong><p>{action.pluginId}<br />{action.actionId}</p></div></div> : action.kind !== "none" && (
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

function LibraryPanel({ assets, onImport, onAssign }: { assets: VisualAsset[]; onImport: (files: FileList) => Promise<VisualAsset[]>; onAssign: (asset: VisualAsset) => void }) {
  const [message, setMessage] = useState("");
  return (
    <div className="section-stack">
      <div className="section-title"><span><em>04</em> Biblioteca</span><h1>Recursos visuales reutilizables</h1><p>Importa PNG, JPG, WEBP o GIF una sola vez y reutilízalo en cualquier tecla, carpeta o pantalla inicial.</p></div>
      <div className="library-toolbar glass-card">
        <label className="primary-button file-button"><ImagePlus size={17} /> Importar imágenes o GIF
          <input multiple type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => {
            if (!event.target.files?.length) return;
            void onImport(event.target.files).then((items) => setMessage(`${items.length} recurso(s) disponibles.`)).catch((error) => setMessage(String(error)));
            event.target.value = "";
          }} />
        </label>
        <p>Puedes seleccionar también los iconos que ya tengas en la carpeta de Base Camp. NEXORA los copia a su biblioteca; no depende después de Base Camp.</p>
        {message && <strong>{message}</strong>}
      </div>
      <div className="asset-grid">
        {assets.map((asset) => <article className="asset-card glass-card" key={asset.id}>
          <div className="asset-preview"><AssetVisual assetId={asset.id} alt={asset.name} />{asset.animated && <span>GIF</span>}</div>
          <h3>{asset.name}</h3><small>{(asset.sizeBytes / 1024).toFixed(1)} KB · {asset.mimeType.replace("image/", "").toUpperCase()}</small>
          <button type="button" className="secondary-button" onClick={() => onAssign(asset)}>Asignar a tecla seleccionada</button>
        </article>)}
        {!assets.length && <div className="empty-library glass-card"><ImagePlus size={34} /><h2>Tu biblioteca está vacía</h2><p>Admite archivos de hasta 12 MB. Los GIF se previsualizan animados en NEXORA.</p></div>}
      </div>
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
  useEffect(() => setDraft(settings), [settings]);
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

function PluginsPanel({ plugins, catalog, keys, selectedKey, onRefresh, onAssign }: {
  plugins: InstalledPlugin[];
  catalog: PluginCatalogEntry[];
  keys: KeyConfig[];
  selectedKey: number;
  onRefresh: () => Promise<void>;
  onAssign: (key: number, value: PluginDrop) => Promise<void>;
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
    <div className="section-title"><span><em>06</em> Plugin Hub</span><h1>Acciones externas, bajo control</h1><p>Instala, inspecciona y autoriza plugins gratuitos. Stream Deck usa un runtime WebSocket limitado; Macro Deck 3 se inspecciona con un adaptador separado mientras se completa su protocolo.</p></div>
    <section className="plugin-toolbar glass-card">
      <label className="plugin-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar plugins o acciones" /></label>
      <select value={ecosystem} onChange={(event) => setEcosystem(event.target.value)}><option value="all">Todos los ecosistemas</option><option value="streamdeck">Stream Deck</option><option value="macrodeck">Macro Deck</option><option value="nexora">NEXORA</option></select>
      <label className="secondary-button plugin-import"><Upload size={16} /> Importar paquete<input type="file" accept=".streamDeckPlugin,.macroDeckPlugin,.zip" onChange={(event) => { void importPackage(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
    </section>
    {message && <p className={`device-message ${/error|no |inválid|fall/i.test(message) ? "error" : "ok"}`}>{message}</p>}
    <section className="glass-card plugin-drop-panel"><div><span className="eyebrow">ASIGNACIÓN RÁPIDA</span><h2>Arrastra una acción hacia una tecla</h2><p>La configuración JSON se guarda de forma independiente en cada botón.</p></div><div className="plugin-drop-grid">{keys.map((key) => <button type="button" key={key.index} className={selectedKey === key.index ? "selected" : ""} onDragOver={(event) => { if (event.dataTransfer.types.includes("application/x-nexora-plugin-action")) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); try { void onAssign(key.index, JSON.parse(event.dataTransfer.getData("application/x-nexora-plugin-action")) as PluginDrop).then(() => setMessage(`Acción asignada a la tecla ${key.index + 1}.`)); } catch { setMessage("La acción arrastrada no es válida."); } }}><strong>{key.index + 1}</strong><span>{key.name}</span></button>)}</div></section>
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
          return <div className="plugin-action-row" draggable key={action.id} onDragStart={(event) => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData("application/x-nexora-plugin-action", JSON.stringify({ pluginId: plugin.id, actionId: action.id, settings: dragSettings })); }}><div><strong>{action.name}</strong><p>{action.description || action.id}</p></div><textarea aria-label={`Configuración de ${action.name}`} value={settings[actionKey] ?? "{}"} onChange={(event) => setSettings((current) => ({ ...current, [actionKey]: event.target.value }))} spellCheck={false} /><button type="button" className="secondary-button" onClick={() => void assign(plugin, action)} title={`Asignar a tecla ${selectedKey + 1}`}>Tecla {selectedKey + 1}</button><button type="button" className="secondary-button" disabled={!plugin.executionApproved || busy === actionKey} onClick={() => { let parsed: Record<string, unknown>; try { parsed = parseSettings(actionKey); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); return; } void task(actionKey, () => executePluginAction(plugin.id, action.id, parsed, selectedKey), `Acción “${action.name}” ejecutada en simulación.`); }}><Play size={14} /> Probar</button></div>;
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
        <div className="panel-heading"><div><span className="eyebrow">{folder ? "CARPETA" : "PERFIL"}</span><h2>{folder?.name ?? profile.name}</h2></div><div className="folder-actions"><button type="button" className="primary-button" disabled={!hardwareReady} onClick={() => { if (!window.confirm("¿Enviar esta página completa al DisplayPad?")) return; setHardwareMessage("Enviando página…"); void onApplyPage(keys).then(setHardwareMessage).catch((error) => setHardwareMessage(error instanceof Error ? error.message : String(error))); }}><MonitorUp size={16} /> Aplicar al DisplayPad</button><button type="button" className="secondary-button" onClick={onCreateFolder}><FolderTree size={16} /> Nueva {folder ? "subcarpeta" : "carpeta"}</button>{folder && <button type="button" className="danger-button" onClick={onDeleteFolder}><Trash2 size={16} /> Eliminar carpeta</button>}</div></div>
        <div className="folder-strip"><button type="button" className={!folder ? "active" : ""} onClick={() => onNavigate(null)}><FolderTree size={14} /> Raíz</button>{visibleFolders.map((item) => <button type="button" key={item.id} className={selectedFolderId === item.id ? "active" : ""} onClick={() => onNavigate(item.id)}><FolderTree size={14} /> {item.name}<small>{item.children.length} subcarpetas</small></button>)}</div>
        <KeyGrid keys={keys} selected={selectedKey} onSelect={onSelectKey} onPluginDrop={onPluginDrop} />
        {hardwareMessage && <p className="device-message ok">{hardwareMessage}</p>}
        <div className="device-footer"><span><FolderTree size={15} /> {folder ? `Carpeta ${folder.name}` : "Nivel raíz"}</span><span>{visibleFolders.length} carpetas visibles</span><span>12 teclas configurables</span></div>
      </section>
    </div>
  );
}

function IntegrationPanel({ state, onRefresh }: { state: BootstrapState; onRefresh: () => void }) {
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
        <p>{state.updaterConfigured ? "Canal firmado configurado." : "Pendiente de repositorio y clave pública. Nunca se incluirá la clave privada."}</p>
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
  const [splash, setSplash] = useState(true);
  const [section, setSection] = useState<Section>("dashboard");
  const [state, setState] = useState<BootstrapState | null>(null);
  const [selectedKey, setSelectedKey] = useState(0);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pluginNotice, setPluginNotice] = useState("");

  const refresh = async () => setState(await getBootstrapState());
  useEffect(() => { void refresh(); }, []);
  useEffect(() => window.nexoraDesktop?.onEvent((value) => {
    if (!value || typeof value !== "object" || !("type" in value) || value.type !== "plugin-feedback") return;
    const feedback = value as { event?: string; keyIndex?: number; payload?: { title?: string } };
    const label = feedback.event === "setTitle" && feedback.payload?.title ? `Título: ${feedback.payload.title.replaceAll("\n", " · ")}` : feedback.event || "actualización";
    setPluginNotice(`Plugin · tecla ${(feedback.keyIndex ?? 0) + 1} · ${label}`);
    window.setTimeout(() => setPluginNotice(""), 3500);
  }), []);

  const activeProfile = useMemo(() => state?.profiles.find((profile) => profile.id === state.activeProfileId) ?? state?.profiles[0], [state]);
  const selectedFolder = useMemo(() => activeProfile ? findFolder(activeProfile.folders, selectedFolderId) : undefined, [activeProfile, selectedFolderId]);
  const selectedConfig = (selectedFolder?.keys ?? activeProfile?.keys)?.[selectedKey];

  const updateKey = (key: KeyConfig) => {
    if (!state || !activeProfile) return;
    const updatedProfile = selectedFolderId
      ? { ...activeProfile, folders: updateFolderTree(activeProfile.folders, selectedFolderId, (folder) => ({ ...folder, keys: folder.keys.map((item) => item.index === key.index ? key : item) })), updatedAt: new Date().toISOString() }
      : { ...activeProfile, keys: activeProfile.keys.map((item) => item.index === key.index ? key : item), updatedAt: new Date().toISOString() };
    setState({ ...state, profiles: state.profiles.map((profile) => profile.id === activeProfile.id ? updatedProfile : profile) });
  };

  const persistProfile = async () => {
    if (!activeProfile) return;
    setSaving(true);
    const saved = await saveProfile(activeProfile);
    setState((current) => current ? { ...current, profiles: current.profiles.map((profile) => profile.id === saved.id ? saved : profile) } : current);
    setSaving(false);
  };

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
    const imported = await Promise.all(Array.from(files).map((file) => importVisualAsset(file)));
    setState((current) => current ? {
      ...current,
      assets: [...current.assets, ...imported.filter((item) => !current.assets.some((existing) => existing.id === item.id))],
    } : current);
    return imported;
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
      text: action.name.slice(0, 6).toUpperCase(),
      actions: [{ kind: "plugin", pluginId: plugin.id, actionId: action.id, contextId: crypto.randomUUID(), settings: value.settings }],
    };
    const updatedProfile = selectedFolderId
      ? { ...activeProfile, folders: updateFolderTree(activeProfile.folders, selectedFolderId, (folder) => ({ ...folder, keys: folder.keys.map((key) => key.index === keyIndex ? configured : key) })) }
      : { ...activeProfile, keys: activeProfile.keys.map((key) => key.index === keyIndex ? configured : key) };
    const saved = await saveProfile({ ...updatedProfile, updatedAt: new Date().toISOString() });
    setState((current) => current ? { ...current, profiles: current.profiles.map((profile) => profile.id === saved.id ? saved : profile) } : current);
    setSelectedKey(keyIndex);
  };

  const createFolder = async () => {
    if (!state || !activeProfile) return;
    const name = window.prompt(selectedFolderId ? "Nombre de la subcarpeta" : "Nombre de la carpeta", `Carpeta ${activeProfile.folders.length + 1}`)?.trim();
    if (!name) return;
    const folder: FolderNode = { id: crypto.randomUUID(), name, keys: Array.from({ length: 12 }, (_, index) => ({ index, name: `Tecla ${index + 1}`, color: ["#8b5cf6", "#6d28d9", "#4c1d95", "#7c3aed"][index % 4], text: `${index + 1}`, animated: false, actions: [{ kind: "none" }] })), children: [] };
    const updatedProfile = selectedFolderId
      ? { ...activeProfile, folders: updateFolderTree(activeProfile.folders, selectedFolderId, (parent) => ({ ...parent, children: [...parent.children, folder] })) }
      : { ...activeProfile, folders: [...activeProfile.folders, folder] };
    const saved = await saveProfile({ ...updatedProfile, updatedAt: new Date().toISOString() });
    setState({ ...state, profiles: state.profiles.map((profile) => profile.id === saved.id ? saved : profile) });
    setSelectedFolderId(folder.id);
    setSelectedKey(0);
  };

  const deleteSelectedFolder = async () => {
    if (!state || !activeProfile || !selectedFolderId || !selectedFolder) return;
    if (!window.confirm(`¿Eliminar la carpeta “${selectedFolder.name}” y todas sus subcarpetas? El perfil anterior quedará en backups.`)) return;
    const saved = await saveProfile({ ...activeProfile, folders: removeFolderFromTree(activeProfile.folders, selectedFolderId), updatedAt: new Date().toISOString() });
    setState({ ...state, profiles: state.profiles.map((profile) => profile.id === saved.id ? saved : profile) });
    setSelectedFolderId(null);
    setSelectedKey(0);
  };

  if (splash) return <Splash onDone={() => setSplash(false)} />;
  if (!state || !activeProfile) return <div className="app-loading"><LoaderCircle className="spin" /> Cargando NEXORA…</div>;

  const mainContent = section === "integrations" ? <IntegrationPanel state={state} onRefresh={refresh} /> : section === "library" ? (
    <LibraryPanel assets={state.assets} onImport={importAssets} onAssign={assignAssetToSelectedKey} />
  ) : section === "initial" ? (
    <InitialScreenPanel assets={state.assets} settings={state.visualSettings} hardwareReady={state.device.mode === "hardware" && state.device.connected} onSave={saveInitialScreen} onApply={applyInitialScreen} />
  ) : section === "plugins" ? (
    <PluginsPanel plugins={state.plugins} catalog={state.pluginCatalog} keys={selectedFolder?.keys ?? activeProfile.keys} selectedKey={selectedKey} onRefresh={refresh} onAssign={assignPluginAction} />
  ) : section === "displaypad" ? (
    <DisplayPadPanel profile={activeProfile} selectedFolderId={selectedFolderId} selectedKey={selectedKey} hardwareReady={state.device.mode === "hardware" && state.device.connected} onApplyPage={applyPageToHardware} onPluginDrop={(key, value) => { void assignPluginAction(key, value); }} onNavigate={(folderId) => { setSelectedFolderId(folderId); setSelectedKey(0); }} onSelectKey={(index) => { setSelectedKey(index); setEditorOpen(true); }} onCreateFolder={() => void createFolder()} onDeleteFolder={() => void deleteSelectedFolder()} />
  ) : section === "macros" ? (
    <MacrosPanel macros={state.macros} onChange={(macros) => setState((current) => current ? { ...current, macros } : current)} />
  ) : section === "profiles" ? (
    <div className="section-stack"><div className="section-title"><span><em>02</em> Perfiles</span><h1>Contextos que se adaptan</h1><p>Crea perfiles independientes y activa automatización por aplicación cuando la necesites.</p></div><div className="profile-actions"><button type="button" className="secondary-button" onClick={() => void duplicateActiveProfile()}><Copy size={16} /> Duplicar activo</button><button type="button" className="danger-button" disabled={state.profiles.length <= 1} onClick={() => void deleteActiveProfile()}><Trash2 size={16} /> Eliminar activo</button></div><div className="profile-grid">{state.profiles.map((profile) => <button type="button" key={profile.id} className={`profile-card ${profile.id === activeProfile.id ? "active" : ""}`} onClick={() => void selectProfile(profile)}><Layers3 /><div><h3>{profile.name}</h3><p>{profile.description}</p><small>{profile.keys.length} teclas · {profile.automaticApp || "Manual"}</small></div><ChevronRight /></button>)}<button type="button" className="profile-card new" onClick={() => void addProfile()}><Sparkles /><div><h3>Nuevo perfil</h3><p>Parte de una configuración limpia y segura.</p></div></button></div></div>
  ) : section === "settings" ? (
    <DeviceSettingsPanel state={state} onModeChange={changeMode} onRedetect={redetectDevice} />
  ) : (
    <div className="dashboard-grid">
      <section className="hero-card">
        <div><span className="eyebrow">CENTRO DE CONTROL</span><h1>Tu flujo, en doce teclas.</h1><p>Personaliza acciones, perfiles e integraciones desde una aplicación ligera e independiente.</p><StatusPill connected={state.device.connected} mode={state.device.mode} /></div>
        <div className="hero-orb"><img src={bundledAsset("noxoralogo.png")} alt="NEXORA" /></div>
      </section>
      <section className="device-panel glass-card">
        <div className="panel-heading"><div><span className="eyebrow">MOUNTAIN DISPLAYPAD</span><h2>{activeProfile.name}</h2></div><button type="button" className="secondary-button" onClick={() => setSection("displaypad")}><WandSparkles size={16} /> Personalizar</button></div>
        <KeyGrid keys={activeProfile.keys} selected={selectedKey} onSelect={(index) => { setSelectedFolderId(null); setSelectedKey(index); setEditorOpen(true); }} />
        <div className="device-footer"><span><Cpu size={15} /> {state.device.name}</span><span><Activity size={15} /> {state.device.mode === "hardware" ? "HID" : "Motor simulado"}</span><span>Perfil actualizado {new Date(activeProfile.updatedAt).toLocaleDateString("es-ES")}</span></div>
      </section>
      <section className="metric-card"><MonitorUp /><div><span>Perfil activo</span><strong>{activeProfile.name}</strong></div><ChevronRight /></section>
      <section className="metric-card"><Radio /><div><span>OBS Studio</span><strong>{state.integrations[0]?.status ?? "sin configurar"}</strong></div><ChevronRight /></section>
      <section className="metric-card"><Command /><div><span>Macros</span><strong>Motor protegido</strong></div><ChevronRight /></section>
    </div>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><img src={bundledAsset("noxoralogo.png")} alt="" /><span>NEXORA</span><small>CONTROL STUDIO</small></div>
        <nav>{navigation.map((item) => <button type="button" key={item.id} className={section === item.id ? "active" : ""} onClick={() => setSection(item.id)}><item.icon size={19} /><span>{item.label}</span></button>)}</nav>
        <div className="sidebar-foot"><span>v{state.version}</span><span className="build-dot" /> ALPHA</div>
      </aside>
      <main className="main-area">
        <header><div><span className="breadcrumb">NEXORA / {navigation.find((item) => item.id === section)?.label}</span></div><div className="header-actions"><StatusPill connected={state.device.connected} mode={state.device.mode} /><button className="avatar">NX</button></div></header>
        {state.startupWarning && <div className="recovery-banner">{state.startupWarning}</div>}
        <div className="content">{mainContent}</div>
      </main>
      {editorOpen && selectedConfig && <KeyEditor keyConfig={selectedConfig} assets={state.assets} hardwareReady={state.device.mode === "hardware" && state.device.connected} onImport={importAssets} onApplyHardware={applySelectedKeyToHardware} onChange={updateKey} onClose={() => setEditorOpen(false)} onSave={() => void persistProfile()} />}
      {saving && <div className="toast"><LoaderCircle className="spin" size={16} /> Guardando perfil…</div>}
      {pluginNotice && <div className="toast plugin-toast"><Boxes size={16} /> {pluginNotice}</div>}
    </div>
  );
}

export default App;

