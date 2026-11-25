"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import SmoothInput from "../../components/SmoothInput";
import Stage from "../../components/Stage";
import Wordmark from "../../components/Wordmark";
import { api } from "../../lib/client";

export default function Register() {
  const router = useRouter();
  const [f, setF] = useState({ name: "", consultancyName: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const r = await api("/auth/register", "POST", f);
    if (!r.ok) { setError(r.data?.error ?? "Falha ao cadastrar"); setBusy(false); return; }
    router.replace("/");
  }

  return (
    <Stage>
      <div style={{ marginBottom: 20 }}><Wordmark /></div>
      <h1>Criar consultoria</h1>
      <form className="card" onSubmit={submit}>
        <label htmlFor="n">Seu nome</label>
        <SmoothInput id="n" required autoComplete="name" value={f.name} onChange={set("name")} />
        <label htmlFor="c">Nome da consultoria</label>
        <SmoothInput id="c" required value={f.consultancyName} onChange={set("consultancyName")} />
        <label htmlFor="e">E-mail</label>
        <SmoothInput id="e" type="text" inputMode="email" required autoComplete="username" autoCapitalize="none" spellCheck={false} value={f.email} onChange={set("email")} />
        <label htmlFor="p">Senha (mín. 8 caracteres)</label>
        <input id="p" type="password" minLength={8} required value={f.password} onChange={set("password")} />
        {error && <p className="err">{error}</p>}
        <div style={{ marginTop: 14 }}><button className="btn" disabled={busy}>Criar</button></div>
      </form>
      <p className="muted"><Link href="/login">Já tenho conta</Link></p>
    </Stage>
  );
}
