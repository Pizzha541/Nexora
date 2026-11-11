import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { error as logError } from "@tauri-apps/plugin-log";
import App from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import "./styles.css";

const reportFrontendError = (value: unknown) => {
  const message = value instanceof Error
    ? `${value.name}: ${value.message}\n${value.stack ?? ""}`
    : String(value);
  void logError(message).catch(() => undefined);
};

window.addEventListener("error", (event) => reportFrontendError(event.error ?? event.message));
window.addEventListener("unhandledrejection", (event) => reportFrontendError(event.reason));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

document.documentElement.dataset.nexoraReady = "true";

