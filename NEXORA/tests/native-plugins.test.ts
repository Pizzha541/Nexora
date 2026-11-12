import { describe, expect, it } from "vitest";
import { NATIVE_PLUGINS } from "../src/lib/nativePlugins";

describe("native NEXORA plugins", () => {
  it("ships the five first-party integrations with safe actions", () => {
    expect(NATIVE_PLUGINS.map((plugin) => plugin.id)).toEqual(["obs", "spotify", "discord", "twitch", "camo"]);
    for (const plugin of NATIVE_PLUGINS) {
      expect(plugin.actions.length).toBeGreaterThan(0);
      expect(new Set(plugin.actions.map((action) => action.id)).size).toBe(plugin.actions.length);
      expect(plugin.actions.every((action) => !["plugin", "none"].includes(action.kind))).toBe(true);
    }
  });
});
