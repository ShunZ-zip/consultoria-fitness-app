"use client";
import { createElement, useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";

interface ScrollFXApi { init(el: Element): void; destroy(el: Element): void; refresh(): void }
declare global { interface Window { ScrollFX?: ScrollFXApi } }

// useLayoutEffect antes da pintura: o estado inicial do efeito entra sem "piscar". No servidor usa useEffect.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export interface FxProps {
  /** Módulo do ScrollFX. */
  fx?: "trigger" | "linked" | "parallax";
  as?: string;
  className?: string; style?: CSSProperties; children?: ReactNode;
  // trigger
  animation?: "fade" | "fade-up" | "fade-down" | "fade-left" | "fade-right" | "zoom-in" | "zoom-out" | "blur" | "mask-up";
  stagger?: number; delay?: number; duration?: number; distance?: number | string; once?: boolean; offset?: string;
  // linked
  effect?: string; target?: string; start?: string; end?: string;
  // parallax
  speed?: number;
}

/** Elemento com um efeito do ScrollFX. Inicia ao montar e desfaz ao desmontar (compatível com React). */
export default function Fx({ fx = "trigger", as = "div", className, style, children, animation, stagger, delay, duration, distance, once, offset, effect, target, start, end, speed }: FxProps) {
  const ref = useRef<HTMLElement | null>(null);
  useIsoLayoutEffect(() => {
    const el = ref.current; const api = typeof window !== "undefined" ? window.ScrollFX : undefined;
    if (!el) return;
    if (!api) { el.removeAttribute("data-sfx"); return; } // sem a biblioteca, nada fica escondido
    api.init(el);
    return () => api.destroy(el);
  }, []);
  const a: Record<string, string | number | undefined> = {
    "data-sfx": fx, "data-sfx-animation": animation, "data-sfx-stagger": stagger, "data-sfx-delay": delay, "data-sfx-duration": duration,
    "data-sfx-distance": distance, "data-sfx-once": once === undefined ? undefined : String(once), "data-sfx-offset": offset,
    "data-sfx-effect": effect, "data-sfx-target": target, "data-sfx-start": start, "data-sfx-end": end, "data-sfx-speed": speed,
  };
  return createElement(as, { ref, className, style, ...a }, children);
}
