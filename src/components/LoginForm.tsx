"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, clearOfflineCache } from "../lib/client";
import PasswordInput from "./PasswordInput";
import SmoothInput from "./SmoothInput";

/** Formulário de entrada (usado na página /login e no painel expansível da tela inicial). */
export default function LoginForm({ notice, idPrefix = "lf", autoFocus = false }: { notice?: string; idPrefix?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const r = await api("/auth/login", "POST", { email, password });
    if (!r.ok) { setError(r.data?.error ?? "Falha ao entrar"); setBusy(false); return; }
    await clearOfflineCache();
    router.replace("/");
  }

  return (
    <form className="card" onSubmit={submit}>
      {notice && <p className="okmsg" role="status" style={{ marginTop: 0 }}>{notice}</p>}
      <label htmlFor={`${idPrefix}-email`}>E-mail</label>
      <SmoothInput id={`${idPrefix}-email`} type="text" inputMode="email" required autoComplete="username" autoCapitalize="none" spellCheck={false}
        autoFocus={autoFocus} value={email} onChange={(e) => setEmail(e.target.value)} />
      <label htmlFor={`${idPrefix}-pw`}>Senha</label>
      <PasswordInput id={`${idPrefix}-pw`} value={password} onChange={setPassword} autoComplete="current-password" />
      <p style={{ margin: "8px 0 0", fontSize: 13 }}><Link href="/esqueci-senha">Esqueci a senha</Link></p>
      {error && <p className="err" role="alert">{error}</p>}
      <div style={{ marginTop: 14 }}><button className="btn" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button></div>
    </form>
  );
}
