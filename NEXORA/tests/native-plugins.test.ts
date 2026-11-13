import { describe, expect, it } from "vitest";
import { findNativeAction, NATIVE_PLUGINS } from "../src/lib/nativePlugins";

describe("native NEXORA plugins", () => {
  it("ships the first-party integrations with safe actions", () => {
    expect(NATIVE_PLUGINS.map((plugin) => plugin.id)).toEqual(["obs", "voxora", "spotify", "discord", "twitch", "camo"]);
    for (const plugin of NATIVE_PLUGINS) {
      expect(plugin.actions.length).toBeGreaterThan(0);
      expect(new Set(plugin.actions.map((action) => action.id)).size).toBe(plugin.actions.length);
      expect(plugin.actions.every((action) => !["plugin", "none"].includes(action.kind))).toBe(true);
    }
  });

  it("exposes the real VOXORA queue, controls and switchable voice presets", () => {
    const voxora = NATIVE_PLUGINS.find((plugin) => plugin.id === "voxora");
    expect(voxora?.actions.map((action) => action.value)).toEqual(expect.arrayContaining([
      "voxora.speak", "voxora.speakClipboard", "voxora.pause", "voxora.resume", "voxora.stop", "voxora.skip", "voxora.clearQueue", "voxora.settings",
    ]));
    expect(voxora?.actions.find((action) => action.value === "voxora.settings")?.fields?.some((field) => field.source === "voxoraVoices")).toBe(true);
  });

  it("covers the complete configurable OBS control surface", () => {
    const obs = NATIVE_PLUGINS.find((plugin) => plugin.id === "obs");
    expect(obs?.actions.length).toBeGreaterThanOrEqual(25);
    expect(obs?.actions.map((action) => action.value)).toEqual(expect.arrayContaining([
      "recordToggle", "recordChapter", "virtualCameraToggle", "scene", "profile", "sceneCollection",
      "inputMuteToggle", "inputVolume", "streamToggle", "studioModeToggle", "sourceVisibilityToggle",
      "filterToggle", "replayBufferToggle", "replayBufferSave", "mediaAction", "transition",
      "sceneTransitionOverride", "screenshot", "hotkey",
    ]));
    expect(obs?.actions.filter((action) => action.fields?.length).length).toBeGreaterThanOrEqual(12);
  });

  it("resolves variants that share the same OBS request", () => {
    expect(findNativeAction("obs", "mediaAction", { mediaAction: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_NEXT" })?.id).toBe("media-next");
  });
});
