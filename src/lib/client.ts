"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export interface Me { id: string; name: string; email: string; role: "trainer" | "student"; consultancyName: string }

/** Apaga o cache offline de dados (ao entrar e ao sair). A fila de envios pendentes NÃO é apagada. */
export async function clearOfflineCache() {
  try { if ("caches" in window) await caches.delete("cf-v1"); } catch { /* sem suporte */ }
}

/** GET com reserva offline: sem rede, usa a última resposta guardada para este usuário. */
export async function apiCached<T = any>(path: string, userId: string): Promise<{ ok: boolean; status: number; data: T; offline?: boolean }> {
  const key = `cache:${userId}:${path}`;
  try {
    const r = await api<T>(path);
    if (r.ok) { try { localStorage.setItem(key, JSON.stringify(r.data)); } catch { /* cheio */ } }
    return r;
  } catch {
    const raw = localStorage.getItem(key);
    if (raw) return { ok: true, status: 200, data: JSON.parse(raw) as T, offline: true };
    return { ok: false, status: 0, data: null as T, offline: true };
  }
}

export async function api<T = any>(path: string, method = "GET", body?: unknown): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: method === "GET" ? undefined : { "content-type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* sem corpo */ }
  return { ok: res.ok, status: res.status, data };
}

/** Carrega o usuário; redireciona para /login sem sessão e para a área certa se o papel não bate. */
export function useMe(role?: "trainer" | "student") {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    api<Me>("/me").then((r) => {
      if (!r.ok) return router.replace("/login");
      if (role && r.data.role !== role) return router.replace(r.data.role === "trainer" ? "/personal" : "/aluno");
      setMe(r.data);
    });
  }, [role, router]);
  const logout = useCallback(async () => { await api("/auth/logout", "POST"); await clearOfflineCache(); router.replace("/login"); }, [router]);
  return { me, logout };
}

export const fmt = (n: number | null | undefined, unit = "") => (n == null ? "—" : `${n}${unit}`);
export const fmtDiff = (n: number | null | undefined) => (n == null ? "—" : n > 0 ? `+${n}` : `${n}`);
export const diffClass = (n: number | null | undefined) => (n == null || n === 0 ? "zero" : n > 0 ? "pos" : "neg");
