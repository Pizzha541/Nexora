import { describe, expect, it } from "vitest";
import { assetCategory, categoryCounts } from "../src/lib/assetCategories";
import type { VisualAsset } from "../src/types";

const asset = (name: string, source: VisualAsset["source"], animated = false): VisualAsset => ({
  id: name, name, source, animated, mimeType: animated ? "image/gif" : "image/svg+xml",
  fileName: name, sizeBytes: 1, importedAt: new Date(0).toISOString(),
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
});
