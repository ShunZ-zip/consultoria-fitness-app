"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import PasswordInput from "../../../components/PasswordInput";
import SmoothInput from "../../../components/SmoothInput";
import Stage from "../../../components/Stage";
import Wordmark from "../../../components/Wordmark";
import { api } from "../../../lib/client";

export default function RedefinirSenha() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [valid, setValid] = useState<boolean | undefined>(undefined);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { api(`/auth/reset/${token}`).then((r) => setValid(r.ok)); }, [token]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) return setError("As senhas não conferem.");
    setBusy(true);
    const r = await api("/auth/reset", "POST", { token, password });
    if (!r.ok) {
      setBusy(false);
      if (r.status === 404) return setValid(false);
      return setError(r.data?.issues?.[0]?.message ?? r.data?.error ?? "Não foi possível redefinir a senha.");
    }
    router.replace("/login?senha=redefinida");
  }

  return (
    <Stage>
      <div style={{ marginBottom: 20 }}><Wordmark /></div>
      {valid === undefined && <p className="muted">Verificando o link…</p>}
      {valid === false && (
        <>
          <h1>Link inválido</h1>
          <p className="muted">Este link expirou ou já foi usado. <Link href="/esqueci-senha">Peça um novo link</Link>.</p>
        </>
      )}
      {valid && (
        <>
          <h1>Nova senha</h1>
          <form className="card" onSubmit={submit}>
            <label htmlFor="pw">Nova senha (mín. 8 caracteres)</label>
            <PasswordInput id="pw" value={password} onChange={setPassword} autoComplete="new-password" minLength={8} />
            <label htmlFor="pw2">Repita a nova senha</label>
            <PasswordInput id="pw2" value={confirm} onChange={setConfirm} autoComplete="new-password" minLength={8} />
            {error && <p className="err">{error}</p>}
            <p className="muted">Ao redefinir, você será desconectado dos outros dispositivos.</p>
            <div style={{ marginTop: 14 }}><button className="btn" disabled={busy}>Redefinir senha</button></div>
          </form>
        </>
      )}
    </Stage>
  );
}
