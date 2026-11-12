import { describe, expect, it, vi } from "vitest";
import { createProfile } from "../src/lib/defaults";
import { isSupportedVisualFile, moveFolder, moveProfileKey, reorderProfiles, updateProfileKey } from "../src/lib/realtime";

describe("motor de estado en tiempo real", () => {
  it("actualiza una tecla sin mutar el perfil anterior", () => {
    const profile = createProfile("Tiempo real");
    const updated = updateProfileKey(profile, null, { ...profile.keys[3], name: "OBS", text: "LIVE" });

    expect(updated.keys[3].name).toBe("OBS");
    expect(updated.keys[3].text).toBe("LIVE");
    expect(profile.keys[3].name).toBe("Tecla 4");
  });

  it("intercambia configuraciones completas y conserva los índices físicos", () => {
    const profile = createProfile("Drag and Drop");
    profile.keys[0] = { ...profile.keys[0], name: "Primera", actions: [{ kind: "openUrl", value: "https://example.com" }] };
    profile.keys[1] = { ...profile.keys[1], name: "Segunda", iconPath: "asset-2" };

    const moved = moveProfileKey(profile, null, 0, 1);
    expect(moved.keys[0]).toMatchObject({ index: 0, name: "Segunda", iconPath: "asset-2" });
    expect(moved.keys[1]).toMatchObject({ index: 1, name: "Primera" });
    expect(moved.keys[1].actions[0]).toMatchObject({ kind: "openUrl", value: "https://example.com" });
  });

  it("copia una tecla y crea un contexto independiente para plugins", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "contexto-nuevo" });
    const profile = createProfile("Copiar");
    profile.keys[0] = { ...profile.keys[0], actions: [{ kind: "plugin", pluginId: "demo", actionId: "count", contextId: "anterior", settings: { step: 2 } }] };

    const copied = moveProfileKey(profile, null, 0, 2, true);
    expect(copied.keys[0].actions[0].contextId).toBe("anterior");
    expect(copied.keys[2].actions[0]).toMatchObject({ contextId: "contexto-nuevo", settings: { step: 2 } });
    vi.unstubAllGlobals();
  });

  it("solo acepta imágenes y GIF seguros de hasta 12 MB", () => {
    expect(isSupportedVisualFile({ name: "icon.png", type: "image/png", size: 1024 })).toBe(true);
    expect(isSupportedVisualFile({ name: "basecamp-icon.svg", type: "image/svg+xml", size: 2048 })).toBe(true);
    expect(isSupportedVisualFile({ name: "payload.exe", type: "image/png", size: 1024 })).toBe(false);
    expect(isSupportedVisualFile({ name: "huge.gif", type: "image/gif", size: 13 * 1024 * 1024 })).toBe(false);
  });

  it("mueve carpetas y rechaza ciclos", () => {
    const profile = createProfile("Carpetas");
    profile.folders = [
      { id: "a", name: "A", keys: structuredClone(profile.keys), children: [{ id: "b", name: "B", keys: structuredClone(profile.keys), children: [] }] },
      { id: "c", name: "C", keys: structuredClone(profile.keys), children: [] },
    ];
    const moved = moveFolder(profile, "c", "a");
    expect(moved.folders[0].children.map((folder) => folder.id)).toEqual(["b", "c"]);
    expect(() => moveFolder(profile, "a", "b")).toThrow(/sí misma/);
  });

  it("reordena perfiles sin perder sus datos", () => {
    const first = createProfile("A"); first.id = "a";
    const second = createProfile("B"); second.id = "b";
    const third = createProfile("C"); third.id = "c";
    expect(reorderProfiles([first, second, third], "c", "a").map((profile) => profile.id)).toEqual(["c", "a", "b"]);
  });
});
