"use client";
// Seção "Rotinas" do perfil do aluno (personal): lista por estado, criar, editar, arquivar, excluir (ocultar) e restaurar.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/client";
import { periodText, subtitle, type RoutineStatus } from "../lib/routine";
import RoutineDialog, { type RoutineData } from "./RoutineDialog";

export interface RoutineItem extends RoutineData {
  studentId: string; status: RoutineStatus; storedStatus: RoutineStatus; workouts: number; hiddenReason: string | null; hiddenText: string | null;
}
const TABS: { k: RoutineStatus; l: string }[] = [{ k: "active", l: "Ativas" }, { k: "archived", l: "Arquivadas" }, { k: "deleted", l: "Excluídas" }];

export default function RoutinesSection({ studentId, onChanged }: { studentId: string; onChanged?: () => void }) {
  const [list, setList] = useState<RoutineItem[] | null>(null);
  const [tab, setTab] = useState<RoutineStatus>("active");
  const [dialog, setDialog] = useState<RoutineItem | "new" | null>(null);
  const [info, setInfo] = useState(""); const [error, setError] = useState("");

  const load = useCallback(async () => {
    const r = await api(`/students/${studentId}/routines`);
    if (r.ok) setList(r.data); else { setList([]); setError("Não foi possível carregar as rotinas."); }
  }, [studentId]);
  useEffect(() => { load(); }, [load]);

  async function setStatus(it: RoutineItem, status: RoutineStatus, msg: string) {
    setError(""); setInfo("");
    const r = await api(`/routines/${it.id}/status`, "POST", { status });
    if (!r.ok) return setError("Não foi possível atualizar a rotina.");
    setInfo(r.data.autoArchiveTurnedOff ? `${msg} O arquivamento automático foi desligado, porque a rotina já venceu.` : msg); await load(); onChanged?.();
  }
  const shown = (list ?? []).filter((r) => r.status === tab);
  const count = (k: RoutineStatus) => (list ?? []).filter((r) => r.status === k).length;

  return (
    <section aria-labelledby="rt-h">
      <div className="row between" style={{ marginTop: 24 }}>
        <h2 id="rt-h" style={{ margin: 0 }}>Rotinas</h2>
        <button type="button" className="btn small" onClick={() => setDialog("new")}>+ Criar rotina</button>
      </div>
      <p className="muted">Uma rotina reúne os treinos de um período e leva as orientações gerais. O aluno só vê rotinas ativas e dentro da regra de visibilidade. Excluir apenas oculta: treinos e registros ficam guardados.</p>
      {error && <p className="err" role="alert">{error}</p>}{info && <p className="okmsg" role="status">{info}</p>}
      <div role="tablist" aria-label="Estado das rotinas" className="pk-tabs">
        {TABS.map((t) => (
          <button key={t.k} type="button" role="tab" aria-selected={tab === t.k} className={`pk-tab${tab === t.k ? " on" : ""}`} onClick={() => setTab(t.k)}>{t.l} <span className="pk-n">{count(t.k)}</span></button>
        ))}
      </div>
      {list === null ? <p className="muted">Carregando…</p> : shown.length === 0 ? (
        <p className="muted">{tab === "active" ? "Nenhuma rotina ativa. Treinos sem rotina continuam visíveis para o aluno." : tab === "archived" ? "Nenhuma rotina arquivada." : "Nenhuma rotina excluída."}</p>
      ) : (
        <ul className="fb-list">
          {shown.map((r) => (
            <li key={r.id} className="card rt-card">
              <div className="row between">
                <b className="fb-name">{r.name}</b>
                <span className="tag">{r.workouts} {r.workouts === 1 ? "treino" : "treinos"}</span>
              </div>
              {subtitle(r.goal, r.level) && <div className="muted">{subtitle(r.goal, r.level)}</div>}
              <div className="muted">{periodText(r.startsOn, r.endsOn)}{r.hiddenText ? ` · ${r.hiddenText}` : ""}</div>
              {r.notes && <details className="rt-notes"><summary>Orientações gerais</summary><p>{r.notes}</p></details>}
              <div className="row" style={{ marginTop: 10 }}>
                {tab !== "deleted" && <Link className="btn small" href={`/personal/treinos/novo?aluno=${studentId}&rotina=${r.id}`}>+ Treino</Link>}
                <button type="button" className="btn ghost small" onClick={() => setDialog(r)}>Editar</button>
                {tab === "active" && <button type="button" className="btn ghost small" onClick={() => setStatus(r, "archived", `Rotina “${r.name}” arquivada; o aluno deixou de vê-la.`)}>Arquivar</button>}
                {tab !== "active" && <button type="button" className="btn ghost small" onClick={() => setStatus(r, "active", `Rotina “${r.name}” restaurada.`)}>Restaurar</button>}
                {tab !== "deleted" && <button type="button" className="btn ghost small" onClick={() => setStatus(r, "deleted", `Rotina “${r.name}” excluída (oculta). Os treinos e registros continuam guardados.`)}>Excluir</button>}
              </div>
              {r.status === "archived" && r.storedStatus === "active" && <p className="muted" style={{ margin: "8px 0 0", fontSize: 12 }}>Arquivada automaticamente pelo vencimento. Restaurar desliga o arquivamento automático desta rotina; para só estender o período, use Editar e mude a data de fim.</p>}
            </li>
          ))}
        </ul>
      )}
      {dialog && (
        <RoutineDialog studentId={studentId} routine={dialog === "new" ? null : dialog}
          onSaved={() => { setInfo(dialog === "new" ? "Rotina criada." : "Rotina salva."); setDialog(null); load(); onChanged?.(); }} onClose={() => setDialog(null)} />
      )}
    </section>
  );
}
