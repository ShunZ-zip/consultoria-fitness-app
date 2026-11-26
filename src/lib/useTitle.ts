"use client";
import { useEffect } from "react";

/** Mantém o título da aba igual ao h1 da tela (ajuda a se localizar e a leitores de tela), mesmo quando o h1 aparece depois de carregar dados. */
export function useTitleFromH1(suffix = "FisIQ") {
  useEffect(() => {
    const apply = () => {
      const h = document.querySelector("main h1")?.textContent?.trim();
      const t = h ? `${h} · ${suffix}` : suffix;
      if (document.title !== t) document.title = t;
    };
    apply();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const mo = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(apply, 120); });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => { mo.disconnect(); clearTimeout(timer); };
  }, [suffix]);
}
