import { describe, expect, it } from "vitest";
import { createKey, createProfile } from "../src/lib/defaults";

describe("perfil inicial", () => {
  it("crea exactamente doce teclas ordenadas", () => {
    const profile = createProfile("Prueba");
    expect(profile.name).toBe("Prueba");
    expect(profile.keys).toHaveLength(12);
    expect(profile.keys.map((key) => key.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("crea acciones inertes por defecto", () => {
    expect(createKey(4).actions).toEqual([{ kind: "none" }]);
  });
});

