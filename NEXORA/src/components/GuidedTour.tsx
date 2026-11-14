import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  Compass,
  FolderTree,
  ImagePlus,
  LayoutGrid,
  Layers3,
  Lightbulb,
  MoreHorizontal,
  PlugZap,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";
import { TOUR_TEXT, detectLang, saveLang, type Lang, type StepId } from "../lib/tourText";
import "./GuidedTour.css";

export type TourSection = "displaypad" | "library" | "integrations" | "plugins";
type Placement = "bottom" | "top" | "left" | "right";
type Box = { left: number; top: number; width: number; height: number };

type StepDef = {
  id: StepId;
  section: TourSection;
  /** Valor del atributo data-tour del elemento a resaltar. Sin target = tarjeta centrada. */
  target?: string;
  placement?: Placement[];
  icon: LucideIcon;
};

const STEPS: StepDef[] = [
  { id: "welcome", section: "displaypad", icon: Sparkles },
  { id: "keys", section: "displaypad", target: "keygrid", placement: ["bottom", "top", "right", "left"], icon: LayoutGrid },
  { id: "folders", section: "displaypad", target: "folders", placement: ["bottom", "top"], icon: FolderTree },
  { id: "profile", section: "displaypad", target: "profile", placement: ["bottom", "left"], icon: Layers3 },
  { id: "actions", section: "displaypad", target: "actions", placement: ["left", "top", "bottom"], icon: Workflow },
  { id: "inspector", section: "displaypad", target: "inspector", placement: ["top", "left", "right"], icon: SlidersHorizontal },
  { id: "library", section: "library", target: "library-toolbar", placement: ["bottom", "top"], icon: ImagePlus },
  { id: "integrations", section: "integrations", target: "integrations", placement: ["bottom", "left", "top"], icon: PlugZap },
  { id: "plugins", section: "plugins", target: "plugins", placement: ["bottom", "top"], icon: Boxes },
  { id: "more", section: "displaypad", target: "more", placement: ["bottom", "left"], icon: MoreHorizontal },
  { id: "settings", section: "displaypad", target: "settings", placement: ["bottom", "left"], icon: Settings },
  { id: "help", section: "displaypad", target: "help", placement: ["bottom", "left"], icon: Compass },
  { id: "finish", section: "displaypad", icon: Sparkles },
];

const SPOT_PADDING = 8;
const EDGE = 16;
const GAP = 18;
const BANNER_SRC = `${import.meta.env.BASE_URL}assets/noxorabanner.png`;
const LOGO_SRC = `${import.meta.env.BASE_URL}assets/noxoralogo.png`;

const sameBox = (a: Box | null, b: Box | null) =>
  a === b || (!!a && !!b && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height);

function placeCard(spot: Box | null, card: { w: number; h: number }, prefs: Placement[], vw: number, vh: number) {
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, Math.max(min, max)));
  if (!spot) return { left: Math.round((vw - card.w) / 2), top: Math.round((vh - card.h) / 2) };

  const right = spot.left + spot.width;
  const bottom = spot.top + spot.height;
  const options: Record<Placement, { left: number; top: number; room: number }> = {
    bottom: { left: spot.left + spot.width / 2 - card.w / 2, top: bottom + GAP, room: vh - EDGE - (bottom + GAP + card.h) },
    top: { left: spot.left + spot.width / 2 - card.w / 2, top: spot.top - GAP - card.h, room: spot.top - GAP - card.h - EDGE },
    right: { left: right + GAP, top: spot.top + spot.height / 2 - card.h / 2, room: vw - EDGE - (right + GAP + card.w) },
    left: { left: spot.left - GAP - card.w, top: spot.top + spot.height / 2 - card.h / 2, room: spot.left - GAP - card.w - EDGE },
  };

  const order = [...prefs, ...(["bottom", "top", "right", "left"] as Placement[]).filter((p) => !prefs.includes(p))];
  const spotCenterY = spot.top + spot.height / 2;
  const chosen = order.find((side) => options[side].room >= 0)
    ?? (spotCenterY > vh * 0.6 ? "top" : "bottom");
  const pick = options[chosen];
  return {
    left: Math.round(clamp(pick.left, EDGE, vw - card.w - EDGE)),
    top: Math.round(clamp(pick.top, EDGE, vh - card.h - EDGE)),
  };
}

export function GuidedTour({ onFinish, onNavigate }: { onFinish: () => void; onNavigate: (section: TourSection) => void }) {
  const [index, setIndex] = useState(0);
  const [lang, setLang] = useState<Lang>(detectLang);
  const [spot, setSpot] = useState<Box | null>(null);
  const [card, setCard] = useState({ w: 420, h: 260 });
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [ready, setReady] = useState(false);

  const cardRef = useRef<HTMLElement | null>(null);
  const primaryRef = useRef<HTMLButtonElement | null>(null);
  const navigateRef = useRef(onNavigate);
  navigateRef.current = onNavigate;

  const step = STEPS[index];
  const text = TOUR_TEXT[lang];
  const copy = text.steps[step.id];
  const isFirst = index === 0;
  const isLast = index === STEPS.length - 1;
  const centered = !step.target;
  const Icon = step.icon;

  const changeLang = (next: Lang) => { setLang(next); saveLang(next); };
  const goNext = useCallback(() => setIndex((value) => (value >= STEPS.length - 1 ? value : value + 1)), []);
  const goBack = useCallback(() => setIndex((value) => Math.max(0, value - 1)), []);

  // Cambia de sección de la app cuando el paso lo necesita.
  useEffect(() => { navigateRef.current(step.section); }, [step.section]);

  // Sigue al elemento objetivo cuadro a cuadro: cubre animaciones, scroll y cambios de tamaño.
  useEffect(() => {
    if (!step.target) { setSpot(null); return; }
    let frame = 0;
    let stopped = false;
    let scrolled = false;
    let missingSince = 0;
    const selector = `[data-tour="${step.target}"]`;

    const tick = (now: number) => {
      if (stopped) return;
      const element = document.querySelector<HTMLElement>(selector);
      const rect = element?.getBoundingClientRect();
      if (element && rect && rect.width > 0 && rect.height > 0) {
        missingSince = 0;
        if (!scrolled) {
          scrolled = true;
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          const outside = centerY < 60 || centerY > window.innerHeight - 20 || centerX < 0 || centerX > window.innerWidth;
          if (outside) element.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
        }
        const next: Box = {
          left: Math.round(rect.left - SPOT_PADDING),
          top: Math.round(rect.top - SPOT_PADDING),
          width: Math.round(rect.width + SPOT_PADDING * 2),
          height: Math.round(rect.height + SPOT_PADDING * 2),
        };
        setSpot((previous) => (sameBox(previous, next) ? previous : next));
        setReady(true);
      } else {
        // Margen de gracia mientras la sección nueva termina de montarse.
        if (!missingSince) missingSince = now;
        if (now - missingSince > 900) setSpot((previous) => (previous === null ? previous : null));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { stopped = true; cancelAnimationFrame(frame); };
  }, [step.target]);

  // Mide la tarjeta para colocarla sin salirse de la ventana.
  useLayoutEffect(() => {
    const element = cardRef.current;
    if (!element) return;
    const w = element.offsetWidth;
    const h = element.offsetHeight;
    setCard((previous) => (previous.w === w && previous.h === h ? previous : { w, h }));
  });

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Teclado: flechas, Enter y Esc.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") { event.preventDefault(); if (isLast) onFinish(); else goNext(); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); goBack(); }
      else if (event.key === "Escape") { event.preventDefault(); onFinish(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [goBack, goNext, isLast, onFinish]);

  useEffect(() => { primaryRef.current?.focus({ preventScroll: true }); }, [index]);

  const position = useMemo(
    () => placeCard(centered ? null : spot, card, step.placement ?? ["bottom", "top"], viewport.w, viewport.h),
    [centered, spot, card, step.placement, viewport],
  );

  const progress = ((index + 1) / STEPS.length) * 100;
  const hasSpot = !centered && spot !== null;
  const cardStyle: CSSProperties = { left: position.left, top: position.top };

  return (
    <div className="gt-root" role="dialog" aria-modal="true" aria-label={text.ui.aria}>
      <div className="gt-blocker" />
      {hasSpot
        ? <div className={`gt-spot ${ready ? "is-ready" : ""}`} style={{ left: spot.left, top: spot.top, width: spot.width, height: spot.height }}><i /></div>
        : <div className="gt-dim" />}

      <section ref={cardRef} className={`gt-card ${centered ? "is-centered" : ""} kind-${step.id}`} style={cardStyle} key={step.id}>
        {step.id === "welcome" && (
          <div className="gt-banner"><img src={BANNER_SRC} alt="NEXORA" /><span className="gt-shine" /></div>
        )}
        {step.id === "finish" && (
          <div className="gt-finish-art">
            <div className="gt-orbit"><img src={LOGO_SRC} alt="" /></div>
            <div className="gt-tray"><img src={LOGO_SRC} alt="" /><span>NEXORA</span><i /></div>
            {Array.from({ length: 14 }, (_, n) => <b key={n} style={{ "--i": n } as CSSProperties} />)}
          </div>
        )}

        <header className="gt-head">
          <span className="gt-badge"><Icon size={17} /></span>
          <span className="gt-eyebrow">{copy.eyebrow ?? text.ui.step(index + 1, STEPS.length)}</span>
          <div className="gt-lang" role="group" aria-label={text.ui.language}>
            <button type="button" className={lang === "es" ? "active" : ""} aria-pressed={lang === "es"} onClick={() => changeLang("es")}>ES</button>
            <button type="button" className={lang === "en" ? "active" : ""} aria-pressed={lang === "en"} onClick={() => changeLang("en")}>EN</button>
          </div>
          <button type="button" className="gt-close" aria-label={text.ui.close} title={text.ui.close} onClick={onFinish}><X size={15} /></button>
        </header>

        <h2>{copy.title}</h2>
        <p>{copy.body}</p>
        {copy.tip && <div className="gt-tip"><Lightbulb size={15} /><span><strong>{text.ui.tip}:</strong> {copy.tip}</span></div>}

        <div className="gt-progress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
        <div className="gt-dots">
          {STEPS.map((item, n) => (
            <button type="button" key={item.id} className={n === index ? "active" : n < index ? "done" : ""} aria-label={`${text.ui.step(n + 1, STEPS.length)}`} onClick={() => setIndex(n)} />
          ))}
        </div>

        <footer className="gt-foot">
          {isLast ? <span /> : <button type="button" className="gt-skip" onClick={onFinish}>{text.ui.skip}</button>}
          <div className="gt-actions">
            {!isFirst && <button type="button" className="gt-btn ghost" onClick={goBack}><ArrowLeft size={15} /> {text.ui.back}</button>}
            <button type="button" ref={primaryRef} className="gt-btn primary" onClick={isLast ? onFinish : goNext}>
              {isFirst ? text.ui.start : isLast ? text.ui.finish : text.ui.next}
              {!isLast && <ArrowRight size={15} />}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
