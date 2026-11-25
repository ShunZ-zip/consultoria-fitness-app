"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import PasswordInput from "../../components/PasswordInput";
import SmoothInput from "../../components/SmoothInput";
import Stage from "../../components/Stage";
import Wordmark from "../../components/Wordmark";
import { api, clearOfflineCache } from "../../lib/client";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  useEffect(() => { setResetDone(new URLSearchParams(window.location.search).get("senha") === "redefinida"); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const r = await api("/auth/login", "POST", { email, password });
    if (!r.ok) { setError(r.data?.error ?? "Falha ao entrar"); setBusy(false); return; }
    await clearOfflineCache();
    router.replace("/");
  }

  return (
    <Stage>
      <div style={{ marginBottom: 20 }}><Wordmark /></div>
      <h1>Entrar</h1>
      {resetDone && <p className="okmsg" role="status">Senha redefinida. Entre com a nova senha.</p>}
      <form className="card" onSubmit={submit}>
        <label htmlFor="email">E-mail</label>
        <SmoothInput id="email" type="text" inputMode="email" required autoComplete="username" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="pw">Senha</label>
        <PasswordInput id="pw" value={password} onChange={setPassword} autoComplete="current-password" />
        <p style={{ margin: "8px 0 0", fontSize: 13 }}><Link href="/esqueci-senha">Esqueci a senha</Link></p>
        {error && <p className="err">{error}</p>}
        <div style={{ marginTop: 14 }}><button className="btn" disabled={busy}>Entrar</button></div>
      </form>
      <p className="muted">Personal novo? <Link href="/register">Criar consultoria</Link>. Alunos entram apenas por convite.</p>
    </Stage>
  );
}
