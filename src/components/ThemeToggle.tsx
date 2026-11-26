"use client";
import { useEffect, useState } from "react";
import Icon from "./Icon";

export type Theme = "light" | "dark";
export const THEME_KEY = "cf-theme";

/** Alterna entre o tema claro (padrão) e o escuro. A escolha fica salva neste aparelho. */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => { setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light"); }, []);
  function apply(next: Theme) {
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch { /* sem armazenamento */ }
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next === "dark" ? "#0E1B2B" : "#E6EAED");
  }
  /** Troca de tema com animação: uma onda circular que cresce a partir do botão (View Transitions). Sem suporte: troca suave das cores.
   *  Com "reduzir movimento" ativado, troca na hora. */
  function toggle(e: React.MouseEvent<HTMLButtonElement>) {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> } };
    if (reduce) { apply(next); return; }
    if (doc.startViewTransition) {
      const r = e.currentTarget.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      const t = doc.startViewTransition(() => apply(next));
      t.ready.then(() => {
        document.documentElement.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { duration: 650, easing: "cubic-bezier(0.23, 1, 0.32, 1)", pseudoElement: "::view-transition-new(root)" });
      }).catch(() => undefined);
      return;
    }
    const root = document.documentElement;
    root.classList.add("theme-anim"); apply(next);
    window.setTimeout(() => root.classList.remove("theme-anim"), 500);
  }
  const toDark = theme !== "dark";
  return (
    <button type="button" className="btn ghost small theme-toggle" onClick={toggle} aria-label={toDark ? "Mudar para o tema escuro" : "Mudar para o tema claro"} title={toDark ? "Tema escuro" : "Tema claro"}>
      <Icon name={toDark ? "moon" : "sun"} /><span className="tt-label">{toDark ? "Escuro" : "Claro"}</span>
    </button>
  );
}
