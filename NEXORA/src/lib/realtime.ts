import type { FolderNode, KeyConfig, Profile } from "../types";

export const NEXORA_KEY_MIME = "application/x-nexora-key";
export const NEXORA_ASSET_MIME = "application/x-nexora-asset";
export const NEXORA_PLUGIN_ACTION_MIME = "application/x-nexora-plugin-action";
export const NEXORA_FOLDER_MIME = "application/x-nexora-folder";
export const NEXORA_PROFILE_MIME = "application/x-nexora-profile";
export const NEXORA_NATIVE_ACTION_MIME = "application/x-nexora-native-action";

const cloneAction = (action: import("../types").KeyAction): import("../types").KeyAction => ({
  ...structuredClone(action),
  contextId: ["plugin", "multiAction", "multiSwitch"].includes(action.kind) ? crypto.randomUUID() : action.contextId,
  settings: action.settings ? structuredClone(action.settings) : undefined,
  steps: action.steps?.map((step) => ({ ...step, id: crypto.randomUUID(), action: cloneAction(step.action) })),
  states: action.states ? [
    action.states[0].map((step) => ({ ...step, id: crypto.randomUUID(), action: cloneAction(step.action) })),
    action.states[1].map((step) => ({ ...step, id: crypto.randomUUID(), action: cloneAction(step.action) })),
  ] : undefined,
});

const cloneKeyAt = (key: KeyConfig, index: number): KeyConfig => ({
  ...structuredClone(key),
  index,
  actions: key.actions.map(cloneAction),
});

const updateFolder = (
  folders: FolderNode[],
  folderId: string,
  update: (folder: FolderNode) => FolderNode,
): FolderNode[] => folders.map((folder) => folder.id === folderId
  ? update(folder)
  : { ...folder, children: updateFolder(folder.children, folderId, update) });

export function keysForPage(profile: Profile, folderId: string | null): KeyConfig[] {
  if (!folderId) return profile.keys;
  const pending = [...profile.folders];
  while (pending.length) {
    const folder = pending.shift();
    if (!folder) break;
    if (folder.id === folderId) return folder.keys;
    pending.push(...folder.children);
  }
  return profile.keys;
}

export function updateProfileKey(profile: Profile, folderId: string | null, key: KeyConfig): Profile {
  const replace = (keys: KeyConfig[]) => keys.map((item) => item.index === key.index ? structuredClone(key) : item);
  return {
    ...profile,
    keys: folderId ? profile.keys : replace(profile.keys),
    folders: folderId
      ? updateFolder(profile.folders, folderId, (folder) => ({ ...folder, keys: replace(folder.keys) }))
      : profile.folders,
    updatedAt: new Date().toISOString(),
  };
}

export function moveProfileKey(
  profile: Profile,
  folderId: string | null,
  sourceIndex: number,
  targetIndex: number,
  copy = false,
): Profile {
  if (sourceIndex === targetIndex) return profile;
  const keys = keysForPage(profile, folderId);
  const source = keys[sourceIndex];
  const target = keys[targetIndex];
  if (!source || !target) throw new Error("Tecla fuera de rango.");

  let next = updateProfileKey(profile, folderId, cloneKeyAt(source, targetIndex));
  if (!copy) next = updateProfileKey(next, folderId, cloneKeyAt(target, sourceIndex));
  return { ...next, updatedAt: new Date().toISOString() };
}

export function isSupportedVisualFile(file: Pick<File, "name" | "type" | "size">): boolean {
  const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]);
  const allowedExtension = /\.(png|jpe?g|webp|gif|svg)$/i.test(file.name);
  return file.size > 0 && file.size <= 12 * 1024 * 1024 && allowedTypes.has(file.type) && allowedExtension;
}

export function updatePluginSettings(profile: Profile, contextId: string, settings: Record<string, unknown>): Profile | null {
  let changed = false;
  const updateKeys = (keys: KeyConfig[]) => keys.map((key) => {
    const actions = key.actions.map((action) => {
      if (action.kind !== "plugin" || action.contextId !== contextId) return action;
      changed = true;
      return { ...action, settings: structuredClone(settings) };
    });
    return actions.some((action, index) => action !== key.actions[index]) ? { ...key, actions } : key;
  });
  const updateFolders = (folders: FolderNode[]): FolderNode[] => folders.map((folder) => ({
    ...folder,
    keys: updateKeys(folder.keys),
    children: updateFolders(folder.children),
  }));
  const keys = updateKeys(profile.keys);
  const folders = updateFolders(profile.folders);
  return changed ? { ...profile, keys, folders, updatedAt: new Date().toISOString() } : null;
}

const folderContains = (folder: FolderNode, id: string): boolean => folder.id === id || folder.children.some((child) => folderContains(child, id));

function detachFolder(folders: FolderNode[], id: string): { folders: FolderNode[]; removed?: FolderNode } {
  let removed: FolderNode | undefined;
  const next: FolderNode[] = [];
  for (const folder of folders) {
    if (folder.id === id) {
      removed = folder;
      continue;
    }
    const nested = detachFolder(folder.children, id);
    if (!removed && nested.removed) removed = nested.removed;
    next.push(nested.removed ? { ...folder, children: nested.folders } : folder);
  }
  return { folders: next, removed };
}

export function moveFolder(profile: Profile, sourceId: string, targetParentId: string | null): Profile {
  const source = findFolderInTree(profile.folders, sourceId);
  if (!source) throw new Error("Carpeta de origen no encontrada.");
  if (targetParentId && !findFolderInTree(profile.folders, targetParentId)) throw new Error("Carpeta de destino no encontrada.");
  if (sourceId === targetParentId || (targetParentId && folderContains(source, targetParentId))) throw new Error("No se puede mover una carpeta dentro de sí misma.");
  const detached = detachFolder(profile.folders, sourceId);
  if (!detached.removed) throw new Error("No se pudo separar la carpeta.");
  const folders = targetParentId
    ? updateFolder(detached.folders, targetParentId, (target) => ({ ...target, children: [...target.children, detached.removed as FolderNode] }))
    : [...detached.folders, detached.removed];
  return { ...profile, folders, updatedAt: new Date().toISOString() };
}

function findFolderInTree(folders: FolderNode[], id: string): FolderNode | undefined {
  for (const folder of folders) {
    if (folder.id === id) return folder;
    const nested = findFolderInTree(folder.children, id);
    if (nested) return nested;
  }
  return undefined;
}

export function reorderProfiles(profiles: Profile[], sourceId: string, targetId: string): Profile[] {
  const sourceIndex = profiles.findIndex((profile) => profile.id === sourceId);
  const targetIndex = profiles.findIndex((profile) => profile.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return profiles;
  const next = [...profiles];
  const [source] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, source);
  return next;
}
