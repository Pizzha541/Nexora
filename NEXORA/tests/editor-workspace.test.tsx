import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActionLibrary, KeyInspector } from "../src/components/EditorWorkspace";
import { createProfile } from "../src/lib/defaults";
import { NEXORA_NATIVE_ACTION_MIME } from "../src/lib/realtime";
import type { InstalledPlugin } from "../src/types";

const plugin: InstalledPlugin = {
  id: "technical-plugin-id",
  name: "Twitch Tools",
  description: "Controles de canal",
  developer: "Demo",
  ecosystem: "streamdeck",
  category: "Streaming",
  version: "1.0.0",
  license: "MIT",
  sourceUrl: "https://example.com",
  sha256: "abc",
  installedAt: new Date(0).toISOString(),
  actions: [{ id: "technical-action-id", name: "Crear marcador", description: "Marca el directo", configurable: false }],
  permissions: [],
  compatibility: "experimental-runtime",
  executionApproved: true,
  free: true,
};

describe("editor DisplayPad", () => {
  it("asigna acciones reales desde la biblioteca con un clic", () => {
    const profile = createProfile("Perfil principal");
    profile.id = "profile-id";
    const onAssignNative = vi.fn();
    const onAssignPlugin = vi.fn();
    render(<ActionLibrary profiles={[profile]} folders={[]} plugins={[plugin]} obsScenes={["Cámara"]} obsConnected onRefreshObs={vi.fn()} onAssignNative={onAssignNative} onAssignPlugin={onAssignPlugin} />);

    const webAction = screen.getByRole("button", { name: /Abrir página web/ });
    const dataTransfer = { effectAllowed: "", setData: vi.fn() };
    fireEvent.dragStart(webAction, { dataTransfer });
    expect(dataTransfer.setData).toHaveBeenCalledWith(NEXORA_NATIVE_ACTION_MIME, expect.stringContaining('"kind":"openUrl"'));

    fireEvent.click(webAction);
    expect(onAssignNative).toHaveBeenCalledWith(expect.objectContaining({ kind: "openUrl" }));

    fireEvent.click(screen.getByRole("button", { name: "Plugins" }));
    fireEvent.click(screen.getByRole("button", { name: /Crear marcador/ }));
    expect(onAssignPlugin).toHaveBeenCalledWith({ pluginId: plugin.id, actionId: plugin.actions[0].id, settings: {} });
  });

  it("muestra nombres comprensibles y oculta identificadores técnicos en el inspector", () => {
    const profile = createProfile("Principal");
    const key = { ...profile.keys[0], actions: [{ kind: "plugin" as const, pluginId: plugin.id, actionId: plugin.actions[0].id, settings: {} }] };
    render(<KeyInspector keyConfig={key} assets={[]} profiles={[profile]} folders={[]} plugins={[plugin]} obsCatalog={{ currentScene: "", scenes: [], inputs: [], profiles: [], sceneCollections: [], transitions: [], hotkeys: [], sceneItems: [], filters: [] }} obsConnected={false} onChange={vi.fn()} onImport={vi.fn()} onPickFile={vi.fn()} onOpenPluginInspector={vi.fn()} onTest={vi.fn()} />);

    expect(screen.getByText("Twitch Tools · Crear marcador")).toBeInTheDocument();
    expect(screen.queryByText(plugin.id)).not.toBeInTheDocument();
    expect(screen.queryByText(plugin.actions[0].id)).not.toBeInTheDocument();
  });

  it("configura una acción OBS con datos del catálogo conectado", () => {
    const profile = createProfile("Principal");
    const onChange = vi.fn();
    const key = { ...profile.keys[0], actions: [{ kind: "obs" as const, value: "scene", settings: {} }] };
    render(<KeyInspector keyConfig={key} assets={[]} profiles={[profile]} folders={[]} plugins={[]} obsCatalog={{ currentScene: "Inicio", scenes: ["Inicio", "Juego"], inputs: [], profiles: [], sceneCollections: [], transitions: [], hotkeys: [], sceneItems: [], filters: [] }} obsConnected onChange={onChange} onImport={vi.fn()} onPickFile={vi.fn()} onOpenPluginInspector={vi.fn()} onTest={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Escena"), { target: { value: "Juego" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ actions: [expect.objectContaining({ settings: { sceneName: "Juego" } })] }));
  });

  it("abre y edita una Multi Action desde la propia tecla", () => {
    const profile = createProfile("Principal");
    const onChange = vi.fn();
    const key = { ...profile.keys[0], actions: [{ kind: "multiAction" as const, value: "multiAction", contextId: "multi-1", steps: [] }] };
    render(<KeyInspector keyConfig={key} assets={[]} profiles={[profile]} folders={[]} plugins={[]} obsCatalog={{ currentScene: "", scenes: [], inputs: [], profiles: [], sceneCollections: [], transitions: [], hotkeys: [], sceneItems: [], filters: [] }} obsConnected={false} onChange={onChange} onImport={vi.fn()} onPickFile={vi.fn()} onOpenPluginInspector={vi.fn()} onTest={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "Editor de acciones múltiples" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Añadir acción/ }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ actions: [expect.objectContaining({ steps: [expect.objectContaining({ action: expect.objectContaining({ kind: "obs", value: "recordToggle" }) })] })] }));
  });
});
