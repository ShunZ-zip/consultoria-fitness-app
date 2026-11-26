"use client";
// Perfil da própria conta (personal e aluno): nome, nome do espaço (só personal) e troca de senha.
import { useState, type FormEvent } from "react";
import { api, type Me } from "../lib/client";
import PasswordInput from "./PasswordInput";

export default function ProfileForm({ me }: { me: Me }) {
  const trainer = me.role === "trainer";
  const [name, setName] = useState(me.name);
  const [space, setSpace] = useState(me.consultancyName);
  const [pMsg, setPMsg] = useState(""); const [pErr, setPErr] = useState(""); const [pBusy, setPBusy] = useState(false);
  const [cur, setCur] = useState(""); const [next, setNext] = useState(""); const [again, setAgain] = useState("");
  const [sMsg, setSMsg] = useState(""); const [sErr, setSErr] = useState(""); const [sBusy, setSBusy] = useState(false);

  async function saveProfile(e: FormEvent) {
    e.preventDefault(); setPMsg(""); setPErr(""); setPBusy(true);
    const r = await api("/me/profile", "PUT", { name, ...(trainer ? { consultancyName: space } : {}) });
    setPBusy(false);
    if (!r.ok) return setPErr(r.data?.issues?.[0]?.message ?? r.data?.error ?? "Não foi possível salvar.");
    setPMsg("Dados salvos."); window.dispatchEvent(new Event("cf-me-changed"));
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault(); setSMsg(""); setSErr("");
    if (next !== again) return setSErr("A confirmação não confere com a nova senha.");
    setSBusy(true);
    const r = await api("/me/password", "POST", { currentPassword: cur, newPassword: next });
    setSBusy(false);
    if (!r.ok) return setSErr(r.data?.issues?.[0]?.message ?? r.data?.error ?? "Não foi possível trocar a senha.");
    setCur(""); setNext(""); setAgain("");
    setSMsg("Senha alterada. Os outros aparelhos em que você estava conectado foram desconectados.");
  }

  return (
    <>
      <form className="card" onSubmit={saveProfile} aria-labelledby="pf-h1">
        <h2 id="pf-h1" style={{ marginTop: 0 }}>Seus dados</h2>
        <label htmlFor="pf-n">Nome</label>
        <input id="pf-n" required maxLength={120} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        {trainer && (
          <>
            <label htmlFor="pf-s">Nome do seu espaço</label>
            <input id="pf-s" required maxLength={120} value={space} onChange={(e) => setSpace(e.target.value)} />
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 12 }}>É o nome que os seus alunos veem.</p>
          </>
        )}
        <label htmlFor="pf-e">E-mail (login)</label>
        <input id="pf-e" value={me.email} readOnly aria-describedby="pf-e-h" />
        <p id="pf-e-h" className="muted" style={{ margin: "4px 0 0", fontSize: 12 }}>O e-mail é o seu acesso e ainda não pode ser alterado aqui.</p>
        {pErr && <p className="err" role="alert">{pErr}</p>}{pMsg && <p className="okmsg" role="status">{pMsg}</p>}
        <div style={{ marginTop: 12 }}><button className="btn" disabled={pBusy || !name.trim() || (trainer && !space.trim())}>Salvar</button></div>
      </form>

      <form className="card" onSubmit={savePassword} aria-labelledby="pf-h2">
        <h2 id="pf-h2" style={{ marginTop: 0 }}>Trocar senha</h2>
        <label htmlFor="pw-cur">Senha atual</label>
        <PasswordInput id="pw-cur" value={cur} onChange={setCur} autoComplete="current-password" />
        <label htmlFor="pw-new">Nova senha (mín. 8 caracteres)</label>
        <PasswordInput id="pw-new" value={next} onChange={setNext} autoComplete="new-password" minLength={8} />
        <label htmlFor="pw-again">Repita a nova senha</label>
        <PasswordInput id="pw-again" value={again} onChange={setAgain} autoComplete="new-password" minLength={8} />
        {sErr && <p className="err" role="alert">{sErr}</p>}{sMsg && <p className="okmsg" role="status">{sMsg}</p>}
        <div style={{ marginTop: 12 }}><button className="btn" disabled={sBusy || !cur || next.length < 8 || !again}>Trocar senha</button></div>
      </form>
    </>
  );
}
