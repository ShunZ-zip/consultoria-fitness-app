"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import SmoothInput from "../../../components/SmoothInput";
import Stage from "../../../components/Stage";
import Wordmark from "../../../components/Wordmark";
import { api } from "../../../lib/client";

export default function Convite() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [info, setInfo] = useState<{ studentName: string; consultancyName: string } | null | undefined>(undefined);
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/invites/${token}`).then((r) => {
      setInfo(r.ok ? r.data : null);
      if (r.ok) setF((p) => ({ ...p, name: r.data.studentName }));
    });
  }, [token]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const r = await api(`/invites/${token}/accept`, "POST", f);
    if (!r.ok) { setError(r.data?.error ?? "Falha ao aceitar"); setBusy(false); return; }
    router.replace("/");
  }

  if (info === undefined) return <Stage><p className="muted">Carregando…</p></Stage>;
  if (info === null) return (
    <Stage>
      <h1>Convite inválido</h1>
      <p className="muted">Este convite expirou ou já foi usado. Peça um novo link ao seu personal.</p>
    </Stage>
  );
  return (
    <Stage>
      <div style={{ marginBottom: 20 }}><Wordmark /></div>
      <h1>Você foi convidado</h1>
      <p className="muted">Acompanhamento: <b style={{ color: "var(--text)" }}>{info.consultancyName}</b>. Crie seu acesso para ver seus treinos.</p>
      <form className="card" onSubmit={submit}>
        <label htmlFor="n">Nome</label>
        <SmoothInput id="n" required autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <label htmlFor="e">E-mail</label>
        <SmoothInput id="e" type="text" inputMode="email" required autoComplete="username" autoCapitalize="none" spellCheck={false} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <label htmlFor="p">Senha (mín. 8 caracteres)</label>
        <input id="p" type="password" minLength={8} required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        {error && <p className="err">{error}</p>}
        <div style={{ marginTop: 14 }}><button className="btn" disabled={busy}>Criar meu acesso</button></div>
      </form>
    </Stage>
  );
}
