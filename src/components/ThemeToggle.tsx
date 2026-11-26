"use client";
import { useEffect, useState } from "react";
import Icon from "./Icon";

export type Theme = "light" | "dark";
export const THEME_KEY = "cf-theme";

/** Alterna entre o tema claro (padrão) e o escuro. A escolha fica salva neste aparelho. */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => { setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light"); }, []);
  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch { /* sem armazenamento */ }
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next === "dark" ? "#0E1B2B" : "#E6EAED");
  }
  const toDark = theme !== "dark";
  return (
    <button type="button" className="btn ghost small theme-toggle" onClick={toggle} aria-label={toDark ? "Mudar para o tema escuro" : "Mudar para o tema claro"} title={toDark ? "Tema escuro" : "Tema claro"}>
      <Icon name={toDark ? "moon" : "sun"} /><span className="tt-label">{toDark ? "Escuro" : "Claro"}</span>
    </button>
  );
}
