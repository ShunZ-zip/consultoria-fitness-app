"use client";
// Formulário de rotina (criar e editar) em diálogo. Datas são do período da rotina, NÃO são agenda.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/client";
import { GOALS, LEVELS, validateRoutine, type Visibility } from "../lib/routine";

export interface RoutineData {
  id: string; name: string; goal: string | null; level: string | null; notes: string | null;
  startsOn: string | null; endsOn: string | null; visibility: Visibility; autoArchive: boolean; showTime: boolean;
}

export default function RoutineDialog({ studentId, routine, onSaved, onClose }: {
  studentId: string; routine: RoutineData | null; onSaved: () => void; onClose: () => void;
}) {
  const [f, setF] = useState({
    name: routine?.name ?? "", goal: routine?.goal ?? "", level: routine?.level ?? "", notes: routine?.notes ?? "",
    startsOn: routine?.startsOn ?? "", endsOn: routine?.endsOn ?? "", visibility: (routine?.visibility ?? "always") as Visibility,
    autoArchive: routine?.autoArchive ?? false, showTime: routine?.showTime ?? true,
  });
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
    const els = [...(ref.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input, select, textarea") ?? [])].filter((x) => x.offsetParent !== null);
    if (!els.length) return;
    const first = els[0], last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault(); setError("");
    const payload = {
      name: f.name, goal: f.goal || null, level: f.level || null, notes: f.notes.trim() || null,
      startsOn: f.startsOn || null, endsOn: f.endsOn || null, visibility: f.visibility, autoArchive: f.autoArchive, showTime: f.showTime,
    };
    const msg = validateRoutine({ startsOn: payload.startsOn, endsOn: payload.endsOn, visibility: payload.visibility, autoArchive: payload.autoArchive });
    if (msg) return setError(msg);
    setBusy(true);
    const r = routine ? await api(`/routines/${routine.id}`, "PUT", payload) : await api(`/students/${studentId}/routines`, "POST", payload);
    setBusy(false);
    if (!r.ok) return setError(r.data?.error ?? "Não foi possível salvar a rotina.");
    onSaved();
  }

  return createPortal(
    <div className="pk-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pk-dialog" role="dialog" aria-modal="true" aria-labelledby="rt-title" ref={ref} onKeyDown={onKey}>
        <header className="pk-head">
          <h2 id="rt-title" className="pk-title">{routine ? "Editar rotina" : "Criar rotina"}</h2>
          <button type="button" className="btn ghost small" onClick={onClose}>Fechar</button>
        </header>
        <form className="pk-body" onSubmit={submit}>
          <label htmlFor="rt-n">Nome da rotina</label>
          <input id="rt-n" required maxLength={80} value={f.name} onChange={(e) => set("name", e.target.value)} />
          <div className="row" style={{ marginTop: 0 }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label htmlFor="rt-g">Objetivo</label>
              <select id="rt-g" value={f.goal} onChange={(e) => set("goal", e.target.value)}><option value="">Selecione</option>{GOALS.map((g) => <option key={g}>{g}</option>)}</select>
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label htmlFor="rt-l">Nível</label>
              <select id="rt-l" value={f.level} onChange={(e) => set("level", e.target.value)}><option value="">Selecione</option>{LEVELS.map((g) => <option key={g}>{g}</option>)}</select>
            </div>
          </div>
          <label htmlFor="rt-o">Orientações gerais (o aluno lê)</label>
          <textarea id="rt-o" rows={4} maxLength={2000} placeholder="Ex.: aquecer 10 minutos, hidratação, como ajustar a carga" value={f.notes} onChange={(e) => set("notes", e.target.value)} />
          <div className="row">
            <div style={{ flex: 1, minWidth: 160 }}>
              <label htmlFor="rt-s">Começa em</label>
              <input id="rt-s" type="date" value={f.startsOn} onChange={(e) => set("startsOn", e.target.value)} />
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label htmlFor="rt-e">Termina em</label>
              <input id="rt-e" type="date" value={f.endsOn} onChange={(e) => set("endsOn", e.target.value)} />
            </div>
          </div>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 12 }}>Só o período da rotina. Não é agenda: não há horários nem reservas.</p>
          <fieldset className="rt-fs">
            <legend>Mostrar para o aluno</legend>
            <label className="pk-check"><input type="radio" name="vis" checked={f.visibility === "always"} onChange={() => set("visibility", "always")} /> Sempre</label>
            <label className="pk-check"><input type="radio" name="vis" checked={f.visibility === "from_start"} onChange={() => set("visibility", "from_start")} /> Só a partir da data de início</label>
          </fieldset>
          <label className="pk-check"><input type="checkbox" checked={f.autoArchive} onChange={(e) => set("autoArchive", e.target.checked)} /> Arquivar a rotina quando ela vencer (o aluno deixa de vê-la)</label>
          <label className="pk-check"><input type="checkbox" checked={f.showTime} onChange={(e) => set("showTime", e.target.checked)} /> Mostrar o tempo do treino para o aluno</label>
          {error && <p className="err" role="alert">{error}</p>}
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" disabled={busy || !f.name.trim()}>{routine ? "Salvar" : "Criar rotina"}</button>
            <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
