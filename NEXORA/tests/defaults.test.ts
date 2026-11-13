import { describe, expect, it } from "vitest";
import { createKey, createProfile, localBootstrap, NEXORA_PRESET_FILES } from "../src/lib/defaults";

describe("perfil inicial", () => {
  it("crea exactamente doce teclas ordenadas", () => {
    const profile = createProfile("Prueba");
    expect(profile.name).toBe("Prueba");
    expect(profile.keys).toHaveLength(12);
    expect(profile.keys.map((key) => key.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("crea acciones inertes por defecto", () => {
    expect(createKey(4).actions).toEqual([{ kind: "none" }]);
    expect(createKey(4).text).toBe("");
    expect(createKey(4).color).toBe("#000000");
  });

  it("incluye un perfil demostrativo de OBS y Twitch configurable", () => {
    const profile = createProfile("Demo");
    expect(profile.keys.filter((key) => key.actions[0].kind === "obs")).toHaveLength(10);
    expect(profile.keys.filter((key) => key.actions[0].kind === "native")).toHaveLength(2);
    expect(profile.keys.every((key) => key.iconPath?.startsWith("nexora-preset-"))).toBe(true);
    expect(NEXORA_PRESET_FILES).toHaveLength(12);
    expect(localBootstrap.assets).toHaveLength(12);
  });
});

