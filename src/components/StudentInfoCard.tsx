"use client";
// "Dados do aluno" (personal): idade, nascimento, WhatsApp e gênero. Dado pessoal: só o personal da consultoria vê e edita.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/client";
import { GENDERS } from "../lib/studentProfile";
import Icon from "./Icon";

interface Profile { birthDate: string | null; age: number | null; phone: string | null; phoneText: string | null; whatsappUrl: string | null; gender: string | null; genderText: string | null }
const dmy = (k: string) => k.split("-").reverse().join("/");

function EditDialog({ studentId, p, onSaved, onClose }: { studentId: string; p: Profile; onSaved: () => void; onClose: () => void }) {
  const [f, setF] = useState({ birthDate: p.birthDate ?? "", phone: p.phoneText ?? "", gender: p.gender ?? "" });
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null); const opener = useRef<Element | null>(null);
  useEffect(() => {
    opener.current = document.activeElement; ref.current?.querySelector<HTMLElement>("input")?.focus();
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; if (opener.current instanceof HTMLElement) opener.current.focus(); };
  }, []);
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
    if (e.key !== "Tab") return;
    const els = [...(ref.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input, select") ?? [])].filter((x) => x.offsetParent !== null);
    if (!els.length) return;
    const first = els[0], last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(""); setBusy(true);
    const r = await api(`/students/${studentId}/profile`, "PUT", { birthDate: f.birthDate || null, phone: f.phone || null, gender: f.gender || null });
    setBusy(false);
    if (!r.ok) return setError(r.data?.issues?.[0]?.message ?? r.data?.error ?? "Não foi possível salvar.");
    onSaved();
  }
  return createPortal(
    <div className="pk-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pk-dialog fin-dialog" role="dialog" aria-modal="true" aria-labelledby="si-t" ref={ref} onKeyDown={onKey}>
        <header className="pk-head"><h2 id="si-t" className="pk-title">Editar dados do aluno</h2><button type="button" className="btn ghost small" onClick={onClose}>Fechar</button></header>
        <form className="pk-body" onSubmit={submit}>
          <label htmlFor="si-b">Data de nascimento</label>
          <input id="si-b" type="date" value={f.birthDate} onChange={(e) => setF({ ...f, birthDate: e.target.value })} />
          <label htmlFor="si-p">WhatsApp</label>
          <input id="si-p" type="tel" inputMode="tel" autoComplete="off" placeholder="(11) 91234-5678" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          <label htmlFor="si-g">Gênero</label>
          <select id="si-g" value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}>
            <option value="">Não informar</option>{GENDERS.map((g) => <option key={g.v} value={g.v}>{g.l}</option>)}
          </select>
          <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>Dados pessoais: visíveis só para você e para o aluno. Deixe em branco para remover.</p>
          {error && <p className="err" role="alert">{error}</p>}
          <div className="row" style={{ marginTop: 12 }}><button className="btn" disabled={busy}>Salvar</button><button type="button" className="btn ghost" onClick={onClose}>Cancelar</button></div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

export default function StudentInfoCard({ studentId }: { studentId: string }) {
  const [p, setP] = useState<Profile | null>(null);
  const [edit, setEdit] = useState(false); const [msg, setMsg] = useState("");
  const load = () => api(`/students/${studentId}/profile`).then((r) => r.ok && setP(r.data));
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [studentId]);
  if (!p) return null;
  const empty = !p.birthDate && !p.phone && !p.gender;
  return (
    <section className="card" aria-labelledby="si-h" data-testid="student-info">
      <div className="row between">
        <h2 id="si-h" style={{ margin: 0 }}>Dados do aluno</h2>
        <button type="button" className="btn ghost small" onClick={() => setEdit(true)}>Editar</button>
      </div>
      {empty ? <p className="muted" style={{ margin: "8px 0 0" }}>Nenhum dado cadastral informado (nascimento, WhatsApp, gênero).</p> : (
        <dl className="eng-stats">
          <div><dt>Nascimento</dt><dd>{p.birthDate ? `${dmy(p.birthDate)} (${p.age} anos)` : "—"}</dd></div>
          <div><dt>Gênero</dt><dd>{p.genderText ?? "—"}</dd></div>
          <div><dt>WhatsApp</dt><dd>{p.phoneText && p.whatsappUrl ? <a href={p.whatsappUrl} target="_blank" rel="noopener noreferrer" aria-label={`Abrir conversa no WhatsApp com ${p.phoneText}`}><Icon name="chat" />{p.phoneText}</a> : "—"}</dd></div>
        </dl>
      )}
      {msg && <p className="okmsg" role="status">{msg}</p>}
      {edit && <EditDialog studentId={studentId} p={p} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); setMsg("Dados salvos."); load(); }} />}
    </section>
  );
}
