import { useEffect, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  AppWindow,
  ChevronDown,
  ChevronLeft,
  CirclePlay,
  FolderOpen,
  Globe2,
  ImagePlus,
  Layers3,
  MonitorPlay,
  Music2,
  PanelRightClose,
  PlugZap,
  Radio,
  RefreshCw,
  Search,
  Trash2,
  Volume2,
} from "lucide-react";
import type { ActionKind, FolderNode, InstalledPlugin, KeyAction, KeyConfig, ObsCatalog, Profile, SequenceStep, VisualAsset } from "../types";
import { NEXORA_NATIVE_ACTION_MIME, NEXORA_PLUGIN_ACTION_MIME } from "../lib/realtime";
import { findNativeAction, NATIVE_PLUGINS, type NativeSettingField } from "../lib/nativePlugins";

export type PluginDrop = { pluginId: string; actionId: string; settings: Record<string, unknown> };
export type NativeActionDrop = {
  kind: Exclude<ActionKind, "none" | "plugin" | "text" | "macro">;
  value: string;
  name: string;
  settings?: Record<string, unknown>;
  steps?: import("../types").SequenceStep[];
  states?: [import("../types").SequenceStep[], import("../types").SequenceStep[]];
};

type LibraryAction = {
  id: string;
  name: string;
  description: string;
  icon: ReactNode;
  native?: NativeActionDrop;
  plugin?: PluginDrop;
  recommended?: boolean;
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
  const obsScenesActions: LibraryAction[] = [
    ...obsScenes.map((scene) => ({
      id: `obs-scene-${scene}`,
      name: scene,
      description: "Cambiar escena de OBS",
      icon: <MonitorPlay size={16} />,
      recommended: true,
      native: nativeAction("obs", "scene", `OBS · ${scene}`, { sceneName: scene }),
    })),
  ];
  const obs: LibraryAction[] = [
    ...obsScenesActions,
    ...(NATIVE_PLUGINS.find((plugin) => plugin.id === "obs")?.actions ?? []).map((action) => ({
      id: `obs-${action.id}`,
      name: action.name,
      description: action.description,
      icon: <Radio size={16} />,
      recommended: ["record-toggle", "stream-toggle", "scene", "audio-mute", "source-visibility", "replay-save"].includes(action.id),
      native: nativeAction(action.kind, action.value, action.name, action.settings),
    })),
  ];

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

  const nativePluginCategories = NATIVE_PLUGINS.map((plugin) => ({
    id: `plugin-native-${plugin.id}`,
    name: plugin.name,
    icon: <PlugZap size={16} />,
    actions: plugin.actions.map((action) => ({
      id: `native-${plugin.id}-${action.id}`,
      name: action.name,
      description: action.description,
      icon: <PlugZap size={16} />,
      native: nativeAction(action.kind, action.value, `${plugin.name} · ${action.name}`, action.settings),
    })),
  }));

  return [
    {
      id: "multi",
      name: "Multi Action",
      icon: <Layers3 size={16} />,
      actions: [
        { id: "multi-action", name: "Multi Action", description: "Ejecuta varias acciones en orden", icon: <Layers3 size={16} />, recommended: true, native: { kind: "multiAction" as const, value: "multiAction", name: "Multi Action", steps: [] } },
        { id: "multi-switch", name: "Multi Action Switch", description: "Alterna entre dos secuencias", icon: <Layers3 size={16} />, recommended: true, native: { kind: "multiSwitch" as const, value: "multiSwitch", name: "Multi Action Switch", states: [[], []] as [SequenceStep[], SequenceStep[]] } },
      ],
    },
    {
      id: "system",
      name: "Sistema",
      icon: <AppWindow size={16} />,
      actions: [
        { id: "hotkey", name: "Atajo de teclado", description: "Envía una combinación configurable", icon: <AppWindow size={16} />, recommended: true, native: { kind: "hotkey" as const, value: "A", name: "Atajo de teclado", settings: { modifiers: ["control"] } } },
        { id: "open-url", name: "Abrir página web", description: "Abre una dirección segura", icon: <Globe2 size={16} />, recommended: true, native: nativeAction("openUrl", "", "Abrir página web") },
        { id: "launch-path", name: "Abrir aplicación o archivo", description: "Selecciona el archivo en el inspector", icon: <FolderOpen size={16} />, recommended: true, native: nativeAction("launchPath", "", "Abrir aplicación") },
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
      ].map(([value, name, Icon]) => ({ id: `media-${value}`, name: String(name), description: "Control multimedia de Windows", icon: <Icon size={16} />, recommended: ["playPause", "volumeDown", "volumeUp", "mute"].includes(String(value)), native: nativeAction("media", String(value), String(name)) })),
    },
    {
      id: "profiles",
      name: "Perfiles",
      icon: <Layers3 size={16} />,
      actions: profiles.map((profile) => ({ id: `profile-${profile.id}`, name: profile.name, description: "Cambiar a este perfil", icon: <Layers3 size={16} />, recommended: true, native: nativeAction("profile", profile.id, `Perfil · ${profile.name}`) })),
    },
    {
      id: "folders",
      name: "Carpetas",
      icon: <FolderOpen size={16} />,
      actions: flattenFolders(folders).map((folder) => ({ id: `folder-${folder.id}`, name: folder.name, description: "Abrir esta carpeta del DisplayPad", icon: <FolderOpen size={16} />, recommended: true, native: nativeAction("folder", folder.id, `Carpeta · ${folder.name}`) })),
    },
    { id: "obs", name: "OBS Studio", icon: <Radio size={16} />, actions: obs },
    ...nativePluginCategories,
    ...pluginCategories,
  ].filter((category) => category.actions.length);
}

export function EditorWorkspace({ library, center, inspector }: { library: ReactNode; center: ReactNode; inspector: ReactNode }) {
  const [rightWidth, setRightWidth] = useState(280);
  const [rightOpen, setRightOpen] = useState(true);

  const resize = (event: ReactPointerEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const initial = rightWidth;
    const move = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      setRightWidth(Math.max(240, Math.min(380, initial - delta)));
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };

  return (
    <div className="editor-workspace" style={{ "--editor-right": rightOpen ? `${rightWidth}px` : "42px" } as React.CSSProperties}>
      <section className="editor-main">
        <div className="editor-center">{center}</div>
        <div className="editor-inspector">{inspector}</div>
      </section>
      <div className="pane-resizer" onPointerDown={resize} />
      <aside className={`editor-pane editor-library ${rightOpen ? "" : "collapsed"}`}>
        <button className="pane-collapse" type="button" onClick={() => setRightOpen((value) => !value)} aria-label={rightOpen ? "Contraer propiedades" : "Expandir propiedades"}>{rightOpen ? <PanelRightClose size={17} /> : <ChevronLeft size={17} />}</button>
        {rightOpen && library}
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
  const [closed, setClosed] = useState<Set<string>>(new Set(["system", "media", "profiles", "folders"]));
  const [view, setView] = useState<"keys" | "plugins">("keys");
  const [mode, setMode] = useState<"basic" | "advanced">("basic");
  const categories = buildCategories(profiles, folders, plugins, obsScenes);
  const normalized = query.trim().toLocaleLowerCase("es");

  return <div className={`action-library ${mode}`}>
    <header><div><span className="eyebrow">BIBLIOTECA</span><h2>Acciones</h2></div><div className="library-mode"><button type="button" className={mode === "basic" ? "active" : ""} onClick={() => setMode("basic")}>Básico</button><button type="button" className={mode === "advanced" ? "active" : ""} onClick={() => setMode("advanced")}>Todo</button></div></header>
    <label className="editor-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar acciones" /></label>
    <div className="library-tabs"><button type="button" className={view === "keys" ? "active" : ""} onClick={() => setView("keys")}>Teclas</button><button type="button" className={view === "plugins" ? "active" : ""} onClick={() => { setView("plugins"); setMode("advanced"); }}>Plugins</button></div>
    {view === "keys" && !obsConnected && <button type="button" className="obs-disconnected" onClick={onRefreshObs}><Radio size={14} /> Conecta OBS para cargar escenas</button>}
    {view === "keys" && obsConnected && <button type="button" className="library-refresh" onClick={onRefreshObs}><RefreshCw size={13} /> Actualizar escenas</button>}
    <div className="action-categories">
      {categories.map((category) => {
        const isPlugin = category.id.startsWith("plugin-");
        if ((view === "plugins") !== isPlugin) return null;
        const actions = category.actions.filter((action) => (view === "plugins" || mode === "advanced" || action.recommended || normalized) && (!normalized || `${action.name} ${action.description} ${category.name}`.toLocaleLowerCase("es").includes(normalized)));
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
  const labels: Partial<Record<ActionKind, string>> = { openUrl: "Abrir página web", launchPath: "Abrir aplicación o archivo", hotkey: "Atajo de teclado", media: "Control multimedia", obs: "OBS Studio", native: "Plugin nativo NEXORA", multiAction: "Multi Action", multiSwitch: "Multi Action Switch", delay: "Delay" };
  return labels[action.kind] ?? action.kind;
};

export function KeyInspector({ keyConfig, assetPreview, assets, profiles, folders, plugins, obsCatalog, obsConnected, onChange, onImport, onPickFile, onOpenPluginInspector, onTest }: {
  keyConfig: KeyConfig;
  assetPreview?: ReactNode;
  assets: VisualAsset[];
  profiles: Profile[];
  folders: FolderNode[];
  plugins: InstalledPlugin[];
  obsCatalog: ObsCatalog;
  obsConnected: boolean;
  onChange: (key: KeyConfig) => void;
  onImport: (files: FileList) => Promise<VisualAsset[]>;
  onPickFile: () => Promise<string | undefined>;
  onOpenPluginInspector: (plugin: InstalledPlugin, actionId: string, settings: Record<string, unknown>) => void;
  onTest: () => void;
}) {
  const action = keyConfig.actions[0] ?? { kind: "none" as const };
  const [sequenceOpen, setSequenceOpen] = useState(false);
  const [switchTab, setSwitchTab] = useState<0 | 1>(0);
  const [newSequenceAction, setNewSequenceAction] = useState("obs-record-toggle");
  const [appearanceOpen, setAppearanceOpen] = useState(action.kind === "none");
  useEffect(() => { setSequenceOpen(action.kind === "multiAction" || action.kind === "multiSwitch"); setSwitchTab(0); }, [keyConfig.index, action.kind]);
  useEffect(() => { setAppearanceOpen(action.kind === "none"); }, [keyConfig.index]);
  const setAction = (change: Record<string, unknown>) => onChange({ ...keyConfig, actions: [{ ...action, ...change }] });
  const plugin = action.kind === "plugin" ? plugins.find((item) => item.id === action.pluginId) : undefined;
  const pluginAction = plugin?.actions.find((item) => item.id === action.actionId);
  const allFolders = flattenFolders(folders);
  const nativeDefinition = findNativeAction(action.kind, action.value, action.settings);
  const fieldOptions = (field: NativeSettingField) => {
    if (field.options) return field.options;
    const source = field.source;
    if (source === "obsScenes") return obsCatalog.scenes.map((value) => ({ value, label: value }));
    if (source === "obsInputs") return [...new Set([...obsCatalog.inputs, ...obsCatalog.scenes])].map((value) => ({ value, label: value }));
    if (source === "obsProfiles") return obsCatalog.profiles.map((value) => ({ value, label: value }));
    if (source === "obsSceneCollections") return obsCatalog.sceneCollections.map((value) => ({ value, label: value }));
    if (source === "obsTransitions") return obsCatalog.transitions.map((value) => ({ value, label: value }));
    if (source === "obsHotkeys") return obsCatalog.hotkeys.map((value) => ({ value, label: value }));
    if (source === "obsSceneItems") return obsCatalog.sceneItems.map((item) => ({ value: JSON.stringify([item.sceneName, item.sceneItemId]), label: `${item.sceneName} · ${item.sourceName}` }));
    if (source === "obsFilters") return obsCatalog.filters.map((item) => ({ value: JSON.stringify([item.sourceName, item.filterName]), label: `${item.sourceName} · ${item.filterName}` }));
    return [];
  };
  const renderNativeField = (field: NativeSettingField, target: KeyAction = action, updateTarget: (next: KeyAction) => void = (next) => setAction(next), keyPrefix = "root") => {
    const definition = findNativeAction(target.kind, target.value, target.settings);
    const current = target.settings?.[field.key] ?? definition?.settings?.[field.key] ?? (field.type === "boolean" ? false : "");
    const update = (value: unknown) => updateTarget({ ...target, settings: { ...definition?.settings, ...target.settings, [field.key]: value } });
    if (field.type === "boolean") return <label className="toggle-row inspector-native-field" key={`${keyPrefix}-${field.key}`}><span><strong>{field.label}</strong>{field.help && <small>{field.help}</small>}</span><input type="checkbox" checked={Boolean(current)} onChange={(event) => update(event.target.checked)} /></label>;
    if (field.type === "select") {
      const options = fieldOptions(field);
      return <label className="inspector-native-field" key={`${keyPrefix}-${field.key}`}>{field.label}<select disabled={Boolean(field.source?.startsWith("obs") && !obsConnected)} value={String(current)} onChange={(event) => update(event.target.value)}><option value="">{field.source?.startsWith("obs") && !obsConnected ? "Conecta OBS primero" : `Selecciona ${field.label.toLowerCase()}`}</option>{options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select>{field.help && <small>{field.help}</small>}</label>;
    }
    if (field.type === "path") return <label className="inspector-native-field" key={`${keyPrefix}-${field.key}`}>{field.label}<div className="path-picker"><input value={String(current)} placeholder={field.placeholder} onChange={(event) => update(event.target.value)} /><button type="button" onClick={() => void onPickFile().then((value) => value && update(value))}>Examinar</button></div>{field.help && <small>{field.help}</small>}</label>;
    return <label className="inspector-native-field" key={`${keyPrefix}-${field.key}`}>{field.label}<input type={field.type === "number" ? "number" : "text"} value={String(current)} placeholder={field.placeholder} min={field.min} max={field.max} step={field.step} onChange={(event) => update(field.type === "number" ? Number(event.target.value) : event.target.value)} />{field.help && <small>{field.help}</small>}</label>;
  };

  const sequenceOptions: Array<{ id: string; label: string; action: KeyAction }> = [
    { id: "system-url", label: "Sistema · Abrir web", action: { kind: "openUrl", value: "" } },
    { id: "system-app", label: "Sistema · Abrir aplicación", action: { kind: "launchPath", value: "" } },
    { id: "system-hotkey", label: "Sistema · Atajo de teclado", action: { kind: "hotkey", value: "A", settings: { modifiers: ["control"] } } },
    { id: "media-playPause", label: "Multimedia · Reproducir / pausar", action: { kind: "media", value: "playPause" } },
    { id: "media-next", label: "Multimedia · Siguiente", action: { kind: "media", value: "next" } },
    ...NATIVE_PLUGINS.flatMap((nativePlugin) => nativePlugin.actions.map((item) => ({ id: `${nativePlugin.id}-${item.id}`, label: `${nativePlugin.name} · ${item.name}`, action: { kind: item.kind, value: item.value, settings: structuredClone(item.settings ?? {}) } as KeyAction }))),
    ...plugins.flatMap((installed) => installed.actions.map((item) => ({ id: `plugin-${installed.id}-${item.id}`, label: `${installed.name} · ${item.name}`, action: { kind: "plugin" as const, pluginId: installed.id, actionId: item.id, contextId: crypto.randomUUID(), settings: {} } }))),
  ];
  const sequenceSteps = action.kind === "multiSwitch" ? (action.states?.[switchTab] ?? []) : (action.steps ?? []);
  const setSequenceSteps = (steps: SequenceStep[]) => {
    if (action.kind === "multiSwitch") {
      const states: [SequenceStep[], SequenceStep[]] = [action.states?.[0] ?? [], action.states?.[1] ?? []];
      states[switchTab] = steps;
      setAction({ states });
    } else setAction({ steps });
  };
  const appendSequenceAction = (nextAction: KeyAction) => setSequenceSteps([...sequenceSteps, { id: crypto.randomUUID(), action: structuredClone(nextAction) }]);
  const updateSequenceAction = (index: number, nextAction: KeyAction) => setSequenceSteps(sequenceSteps.map((step, current) => current === index ? { ...step, action: nextAction } : step));
  const sequenceLabel = (target: KeyAction) => {
    if (target.kind === "delay") return `Delay · ${Number(target.settings?.delayMs || 0)} ms`;
    const definition = findNativeAction(target.kind, target.value, target.settings);
    if (definition) return definition.name;
    if (target.kind === "plugin") return plugins.find((item) => item.id === target.pluginId)?.actions.find((item) => item.id === target.actionId)?.name ?? "Acción de plugin";
    return ({ openUrl: "Abrir página web", launchPath: "Abrir aplicación", hotkey: "Atajo de teclado", media: "Multimedia" } as Partial<Record<ActionKind, string>>)[target.kind] ?? target.kind;
  };

  return <div className="key-inspector">
    <header><div><span className="eyebrow">TECLA {keyConfig.index + 1}</span><h2>Configurar tecla</h2></div><small>Guardado automático</small></header>
    <div className="inspector-overview">
      <div className={`inspector-preview ${assetPreview ? "has-image" : ""} ${action.kind === "none" ? "empty" : ""}`} style={{ "--key-color": keyConfig.color } as React.CSSProperties}>{assetPreview}{keyConfig.text && <span className={assetPreview ? "key-text-overlay" : "key-text-only"}>{keyConfig.text}</span>}{!assetPreview && !keyConfig.text && action.kind !== "none" && <PlugZap size={25} />}</div>
      <div className="inspector-primary"><label>Nombre<input value={keyConfig.name} maxLength={40} onChange={(event) => onChange({ ...keyConfig, name: event.target.value })} /></label><div className="assigned-action"><span>Acción</span><strong>{actionLabel(keyConfig, profiles, folders, plugins)}</strong></div></div>
      <div className="inspector-actions"><button type="button" className="primary-button" disabled={action.kind === "none"} onClick={onTest}><CirclePlay size={16} /> Probar</button><button type="button" className="danger-button" disabled={action.kind === "none"} onClick={() => onChange({ ...keyConfig, actions: [{ kind: "none" }] })}><Trash2 size={15} /> Quitar</button></div>
    </div>
    {action.kind === "none" && <div className="inspector-empty-action"><PlugZap size={16} /><span>Elige una acción en la biblioteca de la derecha.</span></div>}
    {action.kind !== "none" && <div className="inspector-action-settings">
      {action.kind === "openUrl" && <label>Dirección web<input value={action.value ?? ""} placeholder="https://…" onChange={(event) => setAction({ value: event.target.value })} /></label>}
      {action.kind === "launchPath" && <label>Aplicación o archivo<div className="path-picker"><input readOnly value={action.value ?? ""} placeholder="Selecciona un archivo" /><button type="button" onClick={() => void onPickFile().then((value) => value && setAction({ value }))}>Examinar</button></div></label>}
      {action.kind === "hotkey" && <div className="hotkey-settings"><label>Tecla<input value={action.value ?? ""} maxLength={8} placeholder="A, F1, ENTER…" onChange={(event) => setAction({ value: event.target.value.toUpperCase() })} /></label><label>Modificadores<select multiple value={(action.settings?.modifiers as string[] | undefined) ?? []} onChange={(event) => setAction({ settings: { ...action.settings, modifiers: [...event.target.selectedOptions].map((option) => option.value) } })}><option value="control">Ctrl</option><option value="shift">Shift</option><option value="alt">Alt</option><option value="meta">Windows</option></select></label></div>}
      {action.kind === "profile" && <label>Perfil<select value={action.value ?? ""} onChange={(event) => setAction({ value: event.target.value })}>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>}
      {action.kind === "folder" && <label>Carpeta<select value={action.value ?? ""} onChange={(event) => setAction({ value: event.target.value })}>{allFolders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>}
      {nativeDefinition?.fields?.map((field) => renderNativeField(field))}
      {(action.kind === "multiAction" || action.kind === "multiSwitch") && <button type="button" className="primary-button inspector-wide" onClick={() => setSequenceOpen(true)}><Layers3 size={15} /> Editar secuencia · {action.kind === "multiSwitch" ? `${action.states?.[0]?.length ?? 0} / ${action.states?.[1]?.length ?? 0}` : action.steps?.length ?? 0}</button>}
      {action.kind === "plugin" && plugin && pluginAction?.configurable && <button type="button" className="secondary-button inspector-wide" onClick={() => onOpenPluginInspector(plugin, pluginAction.id, action.settings ?? {})}><PlugZap size={15} /> Configurar plugin</button>}
    </div>}
    <details className="inspector-appearance" open={appearanceOpen} onToggle={(event) => setAppearanceOpen(event.currentTarget.open)}>
      <summary><ImagePlus size={15} /><span><strong>Apariencia</strong><small>Imagen, texto y color</small></span><ChevronDown size={14} /></summary>
      <div className="inspector-appearance-fields"><div className="inspector-row"><label>Texto<input value={keyConfig.text} maxLength={12} onChange={(event) => onChange({ ...keyConfig, text: event.target.value })} /></label><label>Color<input className="color-input" type="color" value={keyConfig.color} onChange={(event) => onChange({ ...keyConfig, color: event.target.value })} /></label></div><label>Imagen o GIF<select value={keyConfig.iconPath ?? ""} onChange={(event) => { const asset = assets.find((item) => item.id === event.target.value); onChange({ ...keyConfig, iconPath: event.target.value || undefined, animated: asset?.animated ?? false }); }}><option value="">Sin imagen</option>{assets.map((asset) => <option value={asset.id} key={asset.id}>{asset.name}{asset.animated ? " · GIF" : ""}</option>)}</select></label><label className="file-button inspector-file"><ImagePlus size={15} /> Importar<input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onChange={(event) => { if (!event.target.files?.length) return; void onImport(event.target.files).then(([asset]) => { if (asset) onChange({ ...keyConfig, iconPath: asset.id, animated: asset.animated }); }); event.target.value = ""; }} /></label>{keyConfig.iconPath && <button type="button" className="secondary-button" onClick={() => onChange({ ...keyConfig, iconPath: undefined, animated: false })}><Trash2 size={14} /> Quitar imagen</button>}</div>
    </details>
    {sequenceOpen && (action.kind === "multiAction" || action.kind === "multiSwitch") && <div className="sequence-modal" role="dialog" aria-label="Editor de acciones múltiples">
      <header><button type="button" className="sequence-back" onClick={() => setSequenceOpen(false)}><ChevronLeft size={18} /> Volver</button><div><span className="eyebrow">TECLA {keyConfig.index + 1}</span><h2>{action.kind === "multiSwitch" ? "Multi Action Switch" : "Multi Action"}</h2></div><button type="button" className="icon-button" onClick={() => setSequenceOpen(false)} aria-label="Cerrar editor"><PanelRightClose size={18} /></button></header>
      {action.kind === "multiSwitch" && <div className="sequence-tabs"><button type="button" className={switchTab === 0 ? "active" : ""} onClick={() => setSwitchTab(0)}>Estado 1</button><button type="button" className={switchTab === 1 ? "active" : ""} onClick={() => setSwitchTab(1)}>Estado 2</button></div>}
      <div className="sequence-toolbar"><select value={newSequenceAction} onChange={(event) => setNewSequenceAction(event.target.value)}>{sequenceOptions.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}</select><button type="button" className="primary-button" onClick={() => { const selected = sequenceOptions.find((option) => option.id === newSequenceAction); if (selected) appendSequenceAction(selected.action); }}><CirclePlay size={15} /> Añadir acción</button><button type="button" className="secondary-button" onClick={() => appendSequenceAction({ kind: "delay", settings: { delayMs: 1000 } })}>+ Delay</button></div>
      <div className="sequence-dropzone" onDragOver={(event) => { if (event.dataTransfer.types.includes(NEXORA_NATIVE_ACTION_MIME) || event.dataTransfer.types.includes(NEXORA_PLUGIN_ACTION_MIME)) event.preventDefault(); }} onDrop={(event) => {
        event.preventDefault();
        try {
          const nativeRaw = event.dataTransfer.getData(NEXORA_NATIVE_ACTION_MIME);
          const pluginRaw = event.dataTransfer.getData(NEXORA_PLUGIN_ACTION_MIME);
          if (nativeRaw) {
            const value = JSON.parse(nativeRaw) as NativeActionDrop;
            if (!["multiAction", "multiSwitch"].includes(value.kind)) appendSequenceAction({ kind: value.kind, value: value.value, settings: value.settings ?? {}, steps: value.steps, states: value.states });
          } else if (pluginRaw) {
            const value = JSON.parse(pluginRaw) as PluginDrop;
            appendSequenceAction({ kind: "plugin", pluginId: value.pluginId, actionId: value.actionId, contextId: crypto.randomUUID(), settings: value.settings });
          }
        } catch { /* El arrastre inválido se ignora sin alterar la secuencia. */ }
      }}>
        {!sequenceSteps.length && <div className="sequence-empty"><Layers3 size={30} /><strong>Arrastra acciones aquí</strong><small>También puedes usar el selector superior. Los delays son pasos independientes.</small></div>}
        {sequenceSteps.map((step, index) => {
          const target = step.action;
          const definition = findNativeAction(target.kind, target.value, target.settings);
          return <details className="sequence-step" key={step.id} open={sequenceSteps.length <= 3}>
            <summary><span className="sequence-step-number">{index + 1}</span><strong>{sequenceLabel(target)}</strong><span className="sequence-step-controls"><button type="button" disabled={index === 0} onClick={(event) => { event.preventDefault(); const next = [...sequenceSteps]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setSequenceSteps(next); }}>↑</button><button type="button" disabled={index === sequenceSteps.length - 1} onClick={(event) => { event.preventDefault(); const next = [...sequenceSteps]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; setSequenceSteps(next); }}>↓</button><button type="button" onClick={(event) => { event.preventDefault(); setSequenceSteps(sequenceSteps.filter((_, current) => current !== index)); }}><Trash2 size={13} /></button></span></summary>
            <div className="sequence-step-settings">
              {target.kind === "delay" && <label>Duración del delay (ms)<input type="number" min={0} max={60000} step={100} value={Number(target.settings?.delayMs ?? 1000)} onChange={(event) => updateSequenceAction(index, { ...target, settings: { ...target.settings, delayMs: Math.max(0, Math.min(60000, Number(event.target.value))) } })} /></label>}
              {target.kind === "openUrl" && <label>Dirección web<input value={target.value ?? ""} placeholder="https://…" onChange={(event) => updateSequenceAction(index, { ...target, value: event.target.value })} /></label>}
              {target.kind === "launchPath" && <label>Aplicación o archivo<div className="path-picker"><input value={target.value ?? ""} readOnly /><button type="button" onClick={() => void onPickFile().then((value) => value && updateSequenceAction(index, { ...target, value }))}>Examinar</button></div></label>}
              {target.kind === "hotkey" && <><label>Tecla<input value={target.value ?? ""} maxLength={8} onChange={(event) => updateSequenceAction(index, { ...target, value: event.target.value.toUpperCase() })} /></label><label>Modificadores<select multiple value={(target.settings?.modifiers as string[] | undefined) ?? []} onChange={(event) => updateSequenceAction(index, { ...target, settings: { ...target.settings, modifiers: [...event.target.selectedOptions].map((option) => option.value) } })}><option value="control">Ctrl</option><option value="shift">Shift</option><option value="alt">Alt</option><option value="meta">Windows</option></select></label></>}
              {target.kind === "media" && <label>Control multimedia<select value={target.value ?? "playPause"} onChange={(event) => updateSequenceAction(index, { ...target, value: event.target.value })}><option value="playPause">Reproducir / pausar</option><option value="previous">Anterior</option><option value="next">Siguiente</option><option value="volumeDown">Bajar volumen</option><option value="volumeUp">Subir volumen</option><option value="mute">Silenciar</option></select></label>}
              {definition?.fields?.map((field) => renderNativeField(field, target, (next) => updateSequenceAction(index, next), step.id))}
            </div>
          </details>;
        })}
      </div>
      <footer><span>{sequenceSteps.length} pasos · máximo 100</span><button type="button" className="primary-button" onClick={() => setSequenceOpen(false)}>Listo</button></footer>
    </div>}
  </div>;
}
