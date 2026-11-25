"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import SmoothInput from "../../components/SmoothInput";
import Stage from "../../components/Stage";
import Wordmark from "../../components/Wordmark";
import { api } from "../../lib/client";

export default function EsqueciSenha() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const r = await api("/auth/forgot", "POST", { email });
    setBusy(false);
    if (!r.ok) return setError(r.data?.error ?? "Não foi possível enviar agora. Tente novamente.");
    setSent(true);
    if (r.data?.devLink) setDevLink(r.data.devLink); // só aparece em desenvolvimento local
  }

  return (
    <Stage>
      <div style={{ marginBottom: 20 }}><Wordmark /></div>
      <h1>Esqueci a senha</h1>
      {!sent ? (
        <form className="card" onSubmit={submit}>
          <p className="muted" style={{ marginTop: 0 }}>Informe o e-mail da sua conta. Se ele estiver cadastrado, enviaremos um link para criar uma nova senha.</p>
          <label htmlFor="email">E-mail</label>
          <SmoothInput id="email" type="text" inputMode="email" required autoComplete="username" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} />
          {error && <p className="err">{error}</p>}
          <div style={{ marginTop: 14 }}><button className="btn" disabled={busy}>Enviar link</button></div>
        </form>
      ) : (
        <div className="card" role="status">
          <p className="okmsg" style={{ marginTop: 0 }}>Se o e-mail estiver cadastrado, enviamos um link para redefinir a senha.</p>
          <p className="muted">O link vale por 60 minutos e só pode ser usado uma vez. Confira também a caixa de spam.</p>
          {devLink && (
            <div style={{ marginTop: 12 }}>
              <p className="muted">Ambiente de desenvolvimento (sem provedor de e-mail): use este link.</p>
              <div className="link" data-testid="dev-link"><a href={devLink}>{devLink}</a></div>
            </div>
          )}
        </div>
      )}
      <p className="muted"><Link href="/login">← Voltar para entrar</Link></p>
    </Stage>
  );
}
