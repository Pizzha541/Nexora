import { describe, expect, it } from "vitest";
import { shouldShowUpdatePrompt } from "../src/lib/updatePrompt";
import type { UpdateStatus } from "../src/types";

const status = (phase: UpdateStatus["phase"], availableVersion: string | null = "0.4.0"): UpdateStatus => ({
  phase,
  currentVersion: "0.3.1",
  availableVersion,
  progress: 0,
  message: "Estado",
  configured: true,
});

describe("aviso emergente de actualización", () => {
  it("aparece para una versión nueva y durante su instalación", () => {
    expect(shouldShowUpdatePrompt(status("available"), null)).toBe(true);
    expect(shouldShowUpdatePrompt(status("downloading"), null)).toBe(true);
    expect(shouldShowUpdatePrompt(status("downloaded"), null)).toBe(true);
  });

  it("respeta Más tarde y no aparece cuando ya está al día", () => {
    expect(shouldShowUpdatePrompt(status("available"), "0.4.0")).toBe(false);
    expect(shouldShowUpdatePrompt(status("current", null), null)).toBe(false);
  });
});
