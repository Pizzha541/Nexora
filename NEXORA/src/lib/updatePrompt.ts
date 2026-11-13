import type { UpdateStatus } from "../types";

const promptPhases = new Set<UpdateStatus["phase"]>(["available", "downloading", "downloaded", "installing"]);

export const shouldShowUpdatePrompt = (status: UpdateStatus | null, dismissedVersion: string | null) => Boolean(
  status?.availableVersion
  && status.availableVersion !== dismissedVersion
  && promptPhases.has(status.phase),
);
