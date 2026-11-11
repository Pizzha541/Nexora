import { useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  AppWindow,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CirclePlay,
  FolderOpen,
  Globe2,
  ImagePlus,
  Layers3,
  MonitorPlay,
  Music2,
  PanelLeftClose,
  PanelRightClose,
  PlugZap,
  Radio,
  RefreshCw,
  Search,
  Trash2,
  Volume2,
} from "lucide-react";
import type { ActionKind, FolderNode, InstalledPlugin, KeyConfig, Profile, VisualAsset } from "../types";
import { NEXORA_NATIVE_ACTION_MIME, NEXORA_PLUGIN_ACTION_MIME } from "../lib/realtime";

export type PluginDrop = { pluginId: string; actionId: string; settings: Record<string, unknown> };
export type NativeActionDrop = {
  kind: Exclude<ActionKind, "none" | "plugin" | "hotkey" | "text" | "macro">;
  value: string;
  name: string;
  settings?: Record<string, unknown>;
};

type LibraryAction = {
  id: string;
  name: string;
  description: string;
  icon: ReactNode;
  native?: NativeActionDrop;
  plugin?: PluginDrop;
};

type LibraryCategory = { id: string; name: string; icon: ReactNode; actions: LibraryAction[] };

const flattenFolders = (folders: FolderNode[]): FolderNode[] => folders.flatMap((folder) => [folder, ...flattenFolders(folder.children)]);
const nativeAction = (kind: NativeActionDrop["kind"], value: string, name: string, settings?: Record<string, unknown>): NativeActionDrop => ({ kind, value, name, settings });

function buildCategories(
  profiles: Profile[],
  folders: FolderNode[],
  plugins: InstalledPlugin[],
  obsScenes: string[],
): LibraryCategory[] {
  const obs: LibraryAction[] = [
    ...obsScenes.map((scene) => ({
      id: `obs-scene-${scene}`,
      name: scene,
      description: "Cambiar escena de OBS",
      icon: <MonitorPlay size={16} />,
      native: nativeAction("obs", "scene", `OBS · ${scene}`, { sceneName: scene }),
    })),
    ["recordStart", "Iniciar grabación"],
    ["recordStop", "Detener grabación"],
    ["recordPause", "Pausar grabación"],
    ["recordResume", "Reanudar grabación"],
    ["streamStart", "Iniciar transmisión"],
    ["streamStop", "Detener transmisión"],
  ].map((item) => Array.isArray(item) ? ({
    id: `obs-${item[0]}`,
    name: item[1],
    description: "Control WebSocket de OBS",
    icon: <Radio size={16} />,
    native: nativeAction("obs", item[0], item[1]),
  }) : item);

  const pluginCategories = plugins.map((plugin) => ({
    id: `plugin-${plugin.id}`,
    name: plugin.name,
    icon: <PlugZap size={16} />,
    actions: plugin.actions.map((action) => ({
      id: `${plugin.id}-${action.id}`,
      name: action.name,
      description: action.description || "Acción del plugin",
      icon: <PlugZap size={16} />,
      plugin: { pluginId: plugin.id, actionId: action.id, settings: {} },
    })),
  }));

  return [
    {
      id: "system",
      name: "Sistema",
      icon: <AppWindow size={16} />,
      actions: [
        { id: "open-url", name: "Abrir página web", description: "Abre una dirección segura", icon: <Globe2 size={16} />, native: nativeAction("openUrl", "", "Abrir página web") },
        { id: "launch-path", name: "Abrir aplicación o archivo", description: "Selecciona el archivo en el inspector", icon: <FolderOpen size={16} />, native: nativeAction("launchPath", "", "Abrir aplicación") },
      ],
    },
    {
      id: "media",
      name: "Multimedia",
      icon: <Music2 size={16} />,
      actions: [
        ["playPause", "Reproducir / pausar", CirclePlay],
        ["previous", "Pista anterior", Music2],
        ["next", "Pista siguiente", Music2],
        ["volumeDown", "Bajar volumen", Volume2],
        ["volumeUp", "Subir volumen", Volume2],
        ["mute", "Silenciar", Volume2],
      ].map(([value, name, Icon]) => ({ id: `media-${value}`, name: String(name), description: "Control multimedia de Windows", icon: <Icon size={16} />, native: nativeAction("media", String(value), String(name)) })),
    },
    {
      id: "profiles",
      name: "Perfiles",
      icon: <Layers3 size={16} />,
      actions: profiles.map((profile) => ({ id: `profile-${profile.id}`, name: profile.name, description: "Cambiar a este perfil", icon: <Layers3 size={16} />, native: nativeAction("profile", profile.id, `Perfil · ${profile.name}`) })),
    },
    {
      id: "folders",
      name: "Carpetas",
      icon: <FolderOpen size={16} />,
      actions: flattenFolders(folders).map((folder) => ({ id: `folder-${folder.id}`, name: folder.name, description: "Abrir esta carpeta del DisplayPad", icon: <FolderOpen size={16} />, native: nativeAction("folder", folder.id, `Carpeta · ${folder.name}`) })),
    },
    { id: "obs", name: "OBS Studio", icon: <Radio size={16} />, actions: obs },
    ...pluginCategories,
  ].filter((category) => category.actions.length);
}

export function EditorWorkspace({ left, center, right }: { left: ReactNode; center: ReactNode; right: ReactNode }) {
  const [leftWidth, setLeftWidth] = useState(220);
  const [rightWidth, setRightWidth] = useState(260);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  const resize = (side: "left" | "right", event: ReactPointerEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const initial = side === "left" ? leftWidth : rightWidth;
    const move = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      const next = Math.max(190, Math.min(390, initial + (side === "left" ? delta : -delta)));
      if (side === "left") setLeftWidth(next); else setRightWidth(next);
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };

  return (
    <div className="editor-workspace" style={{ "--editor-left": leftOpen ? `${leftWidth}px` : "42px", "--editor-right": rightOpen ? `${rightWidth}px` : "42px" } as React.CSSProperties}>
      <aside className={`editor-pane editor-left ${leftOpen ? "" : "collapsed"}`}>
        <button className="pane-collapse" type="button" onClick={() => setLeftOpen((value) => !value)} aria-label={leftOpen ? "Contraer acciones" : "Expandir acciones"}>{leftOpen ? <PanelLeftClose size={17} /> : <ChevronRight size={17} />}</button>
        {leftOpen && left}
      </aside>
      <div className="pane-resizer" onPointerDown={(event) => resize("left", event)} />
      <section className="editor-center">{center}</section>
      <div className="pane-resizer" onPointerDown={(event) => resize("right", event)} />
      <aside className={`editor-pane editor-right ${rightOpen ? "" : "collapsed"}`}>
        <button className="pane-collapse" type="button" onClick={() => setRightOpen((value) => !value)} aria-label={rightOpen ? "Contraer propiedades" : "Expandir propiedades"}>{rightOpen ? <PanelRightClose size={17} /> : <ChevronLeft size={17} />}</button>
        {rightOpen && right}
      </aside>
    </div>
  );
}

export function ActionLibrary({ profiles, folders, plugins, obsScenes, obsConnected, onRefreshObs, onAssignNative, onAssignPlugin }: {
  profiles: Profile[];
  folders: FolderNode[];
  plugins: InstalledPlugin[];
  obsScenes: string[];
  obsConnected: boolean;
  onRefreshObs: () => void;
  onAssignNative: (action: NativeActionDrop) => void;
  onAssignPlugin: (action: PluginDrop) => void;
}) {
  const [query, setQuery] = useState("");
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const categories = buildCategories(profiles, folders, plugins, obsScenes);
  const normalized = query.trim().toLocaleLowerCase("es");

  return <div className="action-library">
    <header><span className="eyebrow">BIBLIOTECA</span><h2>Acciones</h2></header>
    <label className="editor-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar acciones" /></label>
    {!obsConnected && <button type="button" className="obs-disconnected" onClick={onRefreshObs}><Radio size={14} /> Conecta OBS para cargar escenas</button>}
    {obsConnected && <button type="button" className="library-refresh" onClick={onRefreshObs}><RefreshCw size={13} /> Actualizar escenas</button>}
    <div className="action-categories">
      {categories.map((category) => {
        const actions = category.actions.filter((action) => !normalized || `${action.name} ${action.description} ${category.name}`.toLocaleLowerCase("es").includes(normalized));
        if (!actions.length) return null;
        const isClosed = closed.has(category.id);
        return <section className="action-category" key={category.id}>
          <button type="button" className="category-heading" onClick={() => setClosed((current) => { const next = new Set(current); if (next.has(category.id)) next.delete(category.id); else next.add(category.id); return next; })}>
            {category.icon}<span>{category.name}</span><ChevronDown className={isClosed ? "closed" : ""} size={14} />
          </button>
          {!isClosed && <div>{actions.map((action) => <button
            type="button"
            draggable
            className="editor-action"
            key={action.id}
            onClick={() => action.native ? onAssignNative(action.native) : action.plugin && onAssignPlugin(action.plugin)}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "copy";
              if (action.native) event.dataTransfer.setData(NEXORA_NATIVE_ACTION_MIME, JSON.stringify(action.native));
              if (action.plugin) event.dataTransfer.setData(NEXORA_PLUGIN_ACTION_MIME, JSON.stringify(action.plugin));
            }}
          >{action.icon}<span><strong>{action.name}</strong><small>{action.description}</small></span></button>)}</div>}
        </section>;
      })}
    </div>
  </div>;
}

const actionLabel = (key: KeyConfig, profiles: Profile[], folders: FolderNode[], plugins: InstalledPlugin[]) => {
  const action = key.actions[0];
  if (!action || action.kind === "none") return "Sin acción";
  if (action.kind === "profile") return `Perfil · ${profiles.find((item) => item.id === action.value)?.name ?? "No disponible"}`;
  if (action.kind === "folder") return `Carpeta · ${flattenFolders(folders).find((item) => item.id === action.value)?.name ?? "No disponible"}`;
  if (action.kind === "plugin") {
    const plugin = plugins.find((item) => item.id === action.pluginId);
    return `${plugin?.name ?? "Plugin"} · ${plugin?.actions.find((item) => item.id === action.actionId)?.name ?? "Acción"}`;
  }
  const labels: Partial<Record<ActionKind, string>> = { openUrl: "Abrir página web", launchPath: "Abrir aplicación o archivo", media: "Control multimedia", obs: "OBS Studio" };
  return labels[action.kind] ?? action.kind;
};

export function KeyInspector({ keyConfig, assets, profiles, folders, plugins, obsScenes, obsConnected, onChange, onImport, onPickFile, onOpenPluginInspector, onTest }: {
  keyConfig: KeyConfig;
  assets: VisualAsset[];
  profiles: Profile[];
  folders: FolderNode[];
  plugins: InstalledPlugin[];
  obsScenes: string[];
  obsConnected: boolean;
  onChange: (key: KeyConfig) => void;
  onImport: (files: FileList) => Promise<VisualAsset[]>;
  onPickFile: () => Promise<string | undefined>;
  onOpenPluginInspector: (plugin: InstalledPlugin, actionId: string, settings: Record<string, unknown>) => void;
  onTest: () => void;
}) {
  const action = keyConfig.actions[0] ?? { kind: "none" as const };
  const setAction = (change: Record<string, unknown>) => onChange({ ...keyConfig, actions: [{ ...action, ...change }] });
  const plugin = action.kind === "plugin" ? plugins.find((item) => item.id === action.pluginId) : undefined;
  const pluginAction = plugin?.actions.find((item) => item.id === action.actionId);
  const allFolders = flattenFolders(folders);

  return <div className="key-inspector">
    <header><span className="eyebrow">TECLA {keyConfig.index + 1}</span><h2>Propiedades</h2><small>Guardado automático</small></header>
    <div className="inspector-preview" style={{ "--key-color": keyConfig.color } as React.CSSProperties}>{keyConfig.text || keyConfig.index + 1}</div>
    <label>Nombre<input value={keyConfig.name} maxLength={40} onChange={(event) => onChange({ ...keyConfig, name: event.target.value })} /></label>
    <div className="inspector-row"><label>Texto<input value={keyConfig.text} maxLength={12} onChange={(event) => onChange({ ...keyConfig, text: event.target.value })} /></label><label>Color<input className="color-input" type="color" value={keyConfig.color} onChange={(event) => onChange({ ...keyConfig, color: event.target.value })} /></label></div>
    <label>Imagen o GIF<select value={keyConfig.iconPath ?? ""} onChange={(event) => { const asset = assets.find((item) => item.id === event.target.value); onChange({ ...keyConfig, iconPath: event.target.value || undefined, animated: asset?.animated ?? false }); }}><option value="">Sin imagen</option>{assets.map((asset) => <option value={asset.id} key={asset.id}>{asset.name}{asset.animated ? " · GIF" : ""}</option>)}</select></label>
    <label className="file-button inspector-file"><ImagePlus size={15} /> Importar imagen o GIF<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { if (!event.target.files?.length) return; void onImport(event.target.files).then(([asset]) => { if (asset) onChange({ ...keyConfig, iconPath: asset.id, animated: asset.animated }); }); event.target.value = ""; }} /></label>
    <div className="assigned-action"><span>Acción asignada</span><strong>{actionLabel(keyConfig, profiles, folders, plugins)}</strong></div>
    {action.kind === "openUrl" && <label>Dirección web<input value={action.value ?? ""} placeholder="https://…" onChange={(event) => setAction({ value: event.target.value })} /></label>}
    {action.kind === "launchPath" && <label>Aplicación o archivo<div className="path-picker"><input readOnly value={action.value ?? ""} placeholder="Selecciona un archivo" /><button type="button" onClick={() => void onPickFile().then((value) => value && setAction({ value }))}>Examinar</button></div></label>}
    {action.kind === "profile" && <label>Perfil<select value={action.value ?? ""} onChange={(event) => setAction({ value: event.target.value })}>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>}
    {action.kind === "folder" && <label>Carpeta<select value={action.value ?? ""} onChange={(event) => setAction({ value: event.target.value })}>{allFolders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>}
    {action.kind === "obs" && action.value === "scene" && <label>Escena de OBS<select disabled={!obsConnected} value={String(action.settings?.sceneName ?? "")} onChange={(event) => setAction({ settings: { ...action.settings, sceneName: event.target.value } })}><option value="">{obsConnected ? "Selecciona una escena" : "OBS no está conectado"}</option>{obsScenes.map((scene) => <option key={scene} value={scene}>{scene}</option>)}</select></label>}
    {action.kind === "plugin" && plugin && pluginAction?.configurable && <button type="button" className="secondary-button inspector-wide" onClick={() => onOpenPluginInspector(plugin, pluginAction.id, action.settings ?? {})}><PlugZap size={15} /> Configurar plugin</button>}
    <div className="inspector-actions"><button type="button" className="primary-button" disabled={action.kind === "none"} onClick={onTest}><CirclePlay size={16} /> Probar acción</button><button type="button" className="danger-button" disabled={action.kind === "none"} onClick={() => onChange({ ...keyConfig, actions: [{ kind: "none" }] })}><Trash2 size={15} /> Quitar</button></div>
    <p className="inspector-note">Arrastra una acción sobre una tecla o haz clic para asignarla a la tecla seleccionada.</p>
  </div>;
}
