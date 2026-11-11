/// <reference types="vite/client" />

interface Window {
  nexoraDesktop?: {
    invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
    ready(): void;
    onEvent(listener: (value: unknown) => void): () => void;
  };
}

