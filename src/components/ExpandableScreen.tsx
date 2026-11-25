"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

// Botão que EXPANDE para tela cheia: o painel nasce do próprio botão (recorte animado do tamanho do botão até a tela),
// fecha com Esc ou pelo botão "Fechar" voltando ao botão, trava a rolagem da página e devolve o foco.
// Sem dependências; com "reduzir movimento" abre e fecha sem animar. Mesma API do exemplo enviado.
const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";

interface Ctx {
  open: boolean; show: () => void; hide: () => void;
  triggerRef: React.MutableRefObject<HTMLButtonElement | null>; triggerRadius: string; contentRadius: string;
}
const ScreenCtx = createContext<Ctx | null>(null);
const useScreen = () => { const c = useContext(ScreenCtx); if (!c) throw new Error("Use dentro de <ExpandableScreen>"); return c; };

export function ExpandableScreen({ children, triggerRadius = "100px", contentRadius = "24px" }: { children: ReactNode; triggerRadius?: string; contentRadius?: string }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const show = useCallback(() => setOpen(true), []);
  const hide = useCallback(() => setOpen(false), []);
  return <ScreenCtx.Provider value={{ open, show, hide, triggerRef, triggerRadius, contentRadius }}>{children}</ScreenCtx.Provider>;
}

export function ExpandableScreenTrigger({ children, className = "" }: { children: ReactNode; className?: string }) {
  const { show, open, triggerRef } = useScreen();
  return (
    <button ref={triggerRef} type="button" className={`exs-trigger ${className}`.trim()} onClick={show} aria-haspopup="dialog" aria-expanded={open}>
      {children}
    </button>
  );
}

/** Retângulo do botão como recorte (inset) da tela, com o raio do botão. */
function clipFromRect(r: DOMRect, radius: string) {
  const vw = window.innerWidth, vh = window.innerHeight;
  return `inset(${Math.max(0, r.top)}px ${Math.max(0, vw - r.right)}px ${Math.max(0, vh - r.bottom)}px ${Math.max(0, r.left)}px round ${radius})`;
}

export function ExpandableScreenContent({ children, className = "", label = "Painel" }: { children: ReactNode; className?: string; label?: string }) {
  const { open, hide, triggerRef, triggerRadius, contentRadius } = useScreen();
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);       // conteúdo interno visível (aparece depois da expansão)
  const panel = useRef<HTMLDivElement>(null);
  const closing = useRef(false);

  const reduce = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fullClip = () => `inset(0px round 0px)`;

  // abrir
  useEffect(() => { if (open) { closing.current = false; setMounted(true); } }, [open]);
  useEffect(() => {
    if (!mounted || !open || !panel.current) return;
    const el = panel.current, trig = triggerRef.current;
    const from = trig ? clipFromRect(trig.getBoundingClientRect(), triggerRadius) : `inset(50% 50% 50% 50% round ${triggerRadius})`;
    document.body.style.overflow = "hidden";
    if (reduce()) { el.style.clipPath = fullClip(); setShown(true); }
    else {
      const a = el.animate([{ clipPath: from }, { clipPath: fullClip() }], { duration: 560, easing: EASE, fill: "forwards" });
      setTimeout(() => setShown(true), 140); // o conteúdo entra enquanto o painel termina de abrir
      a.finished.catch(() => undefined);
    }
    el.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
  }, [mounted, open, triggerRef, triggerRadius]);

  // fechar: volta ao botão
  const close = useCallback(() => {
    const el = panel.current;
    if (!el || closing.current) return;
    closing.current = true; setShown(false);
    let finished = false;
    const done = () => {
      if (finished) return; finished = true;
      document.body.style.overflow = ""; setMounted(false); hide(); triggerRef.current?.focus({ preventScroll: true });
    };
    const trig = triggerRef.current;
    if (reduce() || !trig) return done();
    const a = el.animate([{ clipPath: fullClip() }, { clipPath: clipFromRect(trig.getBoundingClientRect(), triggerRadius) }], { duration: 420, easing: EASE, fill: "forwards" });
    a.finished.then(done, done);
    window.setTimeout(done, 900); // segurança: se a animação não reportar o fim (aba em segundo plano), fecha mesmo assim
  }, [hide, triggerRef, triggerRadius]);

  // Esc e "prender" o foco dentro do painel
  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key !== "Tab" || !panel.current) return;
      const f = [...panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mounted, close]);
  useEffect(() => () => { document.body.style.overflow = ""; }, []);

  // fecha quando o pai pede (open=false) sem passar por close()
  useEffect(() => { if (!open && mounted && !closing.current) close(); }, [open, mounted, close]);

  if (!mounted) return null;
  return (
    <div ref={panel} role="dialog" aria-modal="true" aria-label={label} className={`exs-panel ${className}`.trim()}
      style={{ clipPath: clipFromRect(triggerRef.current?.getBoundingClientRect() ?? new DOMRect(0, 0, 0, 0), triggerRadius), ["--exs-radius" as string]: contentRadius }}>
      <button type="button" className="exs-close btn ghost small" onClick={close} data-autofocus aria-label="Fechar">✕ <span>Fechar</span></button>
      <div className={`exs-inner${shown ? " exs-in" : ""}`}>{children}</div>
    </div>
  );
}
