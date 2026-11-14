import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuidedTour } from "../src/components/GuidedTour";
import { TOUR_TEXT, type StepId } from "../src/lib/tourText";

const STEP_IDS: StepId[] = ["welcome", "keys", "folders", "profile", "actions", "inspector", "library", "integrations", "plugins", "more", "settings", "help", "finish"];

describe("textos del recorrido guiado", () => {
  it("ES y EN tienen todos los pasos con título y descripción", () => {
    for (const lang of ["es", "en"] as const) {
      for (const id of STEP_IDS) {
        expect(TOUR_TEXT[lang].steps[id].title.length, `${lang}/${id} título`).toBeGreaterThan(0);
        expect(TOUR_TEXT[lang].steps[id].body.length, `${lang}/${id} cuerpo`).toBeGreaterThan(0);
      }
    }
  });
});

describe("GuidedTour", () => {
  beforeEach(() => localStorage.setItem("nexora.tourLanguage", "es"));
  afterEach(() => { cleanup(); localStorage.clear(); });

  it("navega entre pasos, cambia de idioma y recuerda la elección", () => {
    const onFinish = vi.fn();
    const onNavigate = vi.fn();
    render(<GuidedTour onFinish={onFinish} onNavigate={onNavigate} />);

    expect(screen.getByRole("heading", { name: "Tu DisplayPad, listo para ti" })).toBeInTheDocument();
    expect(onNavigate).toHaveBeenCalledWith("displaypad");

    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(screen.getByRole("heading", { name: "Your DisplayPad, ready to go" })).toBeInTheDocument();
    expect(localStorage.getItem("nexora.tourLanguage")).toBe("en");

    fireEvent.click(screen.getByRole("button", { name: /Start tour/ }));
    expect(screen.getByRole("heading", { name: "Your 12 keys" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(screen.getByRole("heading", { name: "Your DisplayPad, ready to go" })).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it("pide cambiar de sección en los pasos de Biblioteca, Integraciones y Plugins", () => {
    const onNavigate = vi.fn();
    render(<GuidedTour onFinish={() => undefined} onNavigate={onNavigate} />);
    // La tarjeta se vuelve a montar en cada paso, así que se consultan los puntos de nuevo.
    const clickDot = (n: number) => fireEvent.click(screen.getAllByRole("button", { name: /PASO \d+ DE 13/ })[n]);
    clickDot(6);
    clickDot(7);
    clickDot(8);
    expect(onNavigate).toHaveBeenCalledWith("library");
    expect(onNavigate).toHaveBeenCalledWith("integrations");
    expect(onNavigate).toHaveBeenCalledWith("plugins");
  });

  it("termina con el último paso, con Omitir y con Escape", () => {
    const onFinish = vi.fn();
    render(<GuidedTour onFinish={onFinish} onNavigate={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Omitir recorrido" }));
    expect(onFinish).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onFinish).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getAllByRole("button", { name: /PASO \d+ DE 13/ })[12]);
    fireEvent.click(screen.getByRole("button", { name: /Empezar a usar NEXORA/i }));
    expect(onFinish).toHaveBeenCalledTimes(3);
  });
});
