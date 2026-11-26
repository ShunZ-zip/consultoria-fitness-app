"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/client";
import { KIND_LABEL, type Evidence, type Proposal, type SuggestionKind } from "../lib/suggestions";
import Icon from "./Icon";

interface Sug { id: string; kind: SuggestionKind; status: "pending" | "approved" | "rejected"; title: string; rationale: string; evidence: Evidence; proposal: Proposal | null; resultVersionId: string | null }
interface Gen { created: number; noPublishedWorkout: boolean; versions: { versionId: string; programName: string; insufficient: { have: number; need: number; message: string } | null }[] }
const STATUS: Record<Sug["status"], string> = { pending: "Pendente", approved: "Aprovada", rejected: "Recusada" };
const proposalText = (p: Proposal) => (p.type === "increase_load" ? `Criar rascunho com +${String(p.deltaKg).replace(".", ",")} kg nas séries de trabalho de ${p.exerciseName}` : `Criar rascunho sem a última série de trabalho de ${p.exerciseName}`);

/** Sugestões assistivas por regras (visão do personal). Aprovar cria um RASCUNHO; nada muda sem a decisão do personal. */
export default function StudentSuggestions({ studentId }: { studentId: string }) {
  const [list, setList] = useState<Sug[]>([]);
  const [gen, setGen] = useState<Gen | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [info, setInfo] = useState<{ text: string; draft?: string }>({ text: "" });

  const load = useCallback(async () => { const r = await api(`/students/${studentId}/suggestions`); if (r.ok) setList(r.data); }, [studentId]);
  useEffect(() => { load(); }, [load]);

  async function generate() {
    setBusy(true); setError(""); setInfo({ text: "" });
    const r = await api(`/students/${studentId}/suggestions/generate`, "POST");
    setBusy(false);
    if (!r.ok) return setError(r.data?.error ?? "Não foi possível analisar.");
    setGen(r.data);
    setInfo({ text: r.data.created ? `${r.data.created} nova(s) sugestão(ões).` : "Análise concluída: nenhuma sugestão nova." });
    load();
  }
  async function decide(s: Sug, action: "approve" | "reject") {
    setError(""); setInfo({ text: "" });
    const r = await api(`/suggestions/${s.id}/${action}`, "POST");
    if (!r.ok) setError(r.data?.error ?? "Não foi possível registrar a decisão.");
    else if (action === "reject") setInfo({ text: "Sugestão recusada." });
    else setInfo(r.data.draftVersionId ? { text: "Rascunho criado. Revise e publique quando quiser; o treino atual do aluno não mudou.", draft: r.data.draftVersionId } : { text: "Sugestão marcada como vista." });
    load();
  }
  const pending = list.filter((s) => s.status === "pending"), decided = list.filter((s) => s.status !== "pending");

  return (
    <section aria-labelledby="sug-title">
      <h2 id="sug-title">Sugestões</h2>
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}><span className="tag">Por regras</span> Sugestão automática por regras: você decide. A prescrição só muda se você aprovar, e a aprovação cria apenas um rascunho. Evolução de carga isolada não representa necessariamente hipertrofia. Nenhum dado sai do servidor.</p>
        <button className="btn small" onClick={generate} disabled={busy}><Icon name="sparkle" />{busy ? "Analisando…" : "Analisar registros"}</button>
        {error && <p className="err" role="alert">{error}</p>}
        {info.text && <p className="okmsg" role="status">{info.text} {info.draft && <Link href={`/personal/treinos/${info.draft}`}>Abrir rascunho</Link>}</p>}
        {gen?.noPublishedWorkout && <p className="muted">Este aluno ainda não tem treino publicado: não há o que analisar.</p>}
        {gen?.versions.filter((v) => v.insufficient).map((v) => <p key={v.versionId} className="muted" role="status"><b>{v.programName}:</b> {v.insufficient!.message}</p>)}
      </div>

      {pending.length === 0 && gen && !gen.versions.some((v) => v.insufficient) && !gen.noPublishedWorkout && <p className="muted">Nenhuma sugestão pendente.</p>}
      {pending.map((s) => (
        <article key={s.id} className="card" aria-label={s.title}>
          <div className="row between"><strong>{s.title}</strong><span className="tag">{KIND_LABEL[s.kind]}</span></div>
          <p>{s.rationale}</p>
          <table>
            <caption className="muted" style={{ textAlign: "left" }}>Evidências</caption>
            <thead><tr>{s.evidence.headers.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
            <tbody>{s.evidence.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
          </table>
          {s.evidence.notes?.map((n) => <p key={n} className="muted" style={{ margin: "6px 0 0" }}>{n}</p>)}
          {s.proposal && <p style={{ marginBottom: 0 }}><b>Proposta:</b> {proposalText(s.proposal)}.</p>}
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn small" onClick={() => decide(s, "approve")} aria-label={`${s.proposal ? "Aprovar e criar rascunho" : "Marcar como vista"}: ${s.title}`}>{s.proposal ? "Aprovar (criar rascunho)" : "Marcar como vista"}</button>
            <button className="btn ghost small" onClick={() => decide(s, "reject")} aria-label={`Recusar: ${s.title}`}>Recusar</button>
          </div>
        </article>
      ))}
      {decided.length > 0 && (
        <details className="card">
          <summary>Histórico de decisões ({decided.length})</summary>
          <ul style={{ margin: "10px 0 0", paddingLeft: 18 }}>
            {decided.map((s) => <li key={s.id}>{s.title} · <b>{STATUS[s.status]}</b>{s.resultVersionId && <> · <Link href={`/personal/treinos/${s.resultVersionId}`}>ver rascunho</Link></>}</li>)}
          </ul>
        </details>
      )}
    </section>
  );
}
