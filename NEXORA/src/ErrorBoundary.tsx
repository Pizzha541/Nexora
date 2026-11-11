import { Component, type ErrorInfo, type ReactNode } from "react";
import { error as logError } from "@tauri-apps/plugin-log";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const detail = `${error.name}: ${error.message}\n${error.stack ?? ""}\n${info.componentStack ?? ""}`;
    void logError(detail).catch(() => undefined);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="recovery-screen">
        <div className="recovery-card">
          <span>NEXORA · RECUPERACIÓN</span>
          <h1>La interfaz encontró un error</h1>
          <p>Tus perfiles no se borraron. El fallo quedó registrado para poder corregirlo.</p>
          <pre>{this.state.error.message}</pre>
          <button type="button" className="primary-button" onClick={() => window.location.reload()}>
            Reiniciar interfaz
          </button>
        </div>
      </main>
    );
  }
}
