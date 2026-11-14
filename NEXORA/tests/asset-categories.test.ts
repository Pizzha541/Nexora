import { describe, expect, it } from "vitest";
import { assetCategory, categoryCounts } from "../src/lib/assetCategories";
import type { VisualAsset } from "../src/types";

const asset = (name: string, source: VisualAsset["source"], animated = false, category?: string): VisualAsset => ({
  id: name, name, source, animated, mimeType: animated ? "image/gif" : "image/svg+xml",
  fileName: name, sizeBytes: 1, importedAt: new Date(0).toISOString(), category,
});

describe("asset categories", () => {
  it("organizes bundled icons by function", () => {
    expect(assetCategory(asset("record.svg", "nexora"))).toBe("obs");
    expect(assetCategory(asset("chat.svg", "nexora"))).toBe("twitch");
  });

  it("prioritizes animation and source folders", () => {
    const values = [asset("loop.gif", "user", true), asset("mountain.png", "basecamp"), asset("mine.png", "user")];
    expect(values.map(assetCategory)).toEqual(["animated", "basecamp", "user"]);
    expect(categoryCounts(values)).toMatchObject({ all: 3, animated: 1, basecamp: 1, user: 1 });
  });

  it("maps Base Camp folders into useful categories", () => {
    expect(assetCategory(asset("record.png", "basecamp", false, "obs-profile"))).toBe("obs");
    expect(assetCategory(asset("play.png", "basecamp", false, "spotify"))).toBe("spotify");
    expect(assetCategory(asset("premiere.png", "basecamp", false, "premiere-profile"))).toBe("creative");
    expect(assetCategory(asset("clock.png", "basecamp", false, "PC_Info-Clock"))).toBe("system");
    expect(assetCategory(asset("keyboard.png", "basecamp", false, "DKD"))).toBe("hardware");
  });
});
