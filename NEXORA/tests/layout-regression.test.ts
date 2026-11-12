import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("regresiones de layout", () => {
  it("mantiene visible el área principal cuando el editor oculta la barra lateral", () => {
    const stylesheet = readFileSync(path.join(process.cwd(), "src", "styles.css"), "utf8");

    expect(stylesheet).toMatch(/\.app-shell\.editor-mode\s*\{\s*grid-template-columns:\s*1fr;/);
    expect(stylesheet).not.toMatch(/\.app-shell\.editor-mode\s*\{[^}]*grid-template-columns:\s*0\s+1fr;/);
  });
});
