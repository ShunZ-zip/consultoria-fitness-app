"use client";
import { useEffect } from "react";

/** Registra o service worker (somente em produção; em desenvolvimento o cache atrapalharia o hot reload). */
export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);
  return null;
}
