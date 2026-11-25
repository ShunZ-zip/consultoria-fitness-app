"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Answers, Field } from "../lib/assessment";
import { api } from "../lib/client";
import FieldsForm from "./FieldsForm";

interface Tpl { id: string; name: string; fields: Field[] }
interface Ass { id: string; templateName: string; status: "pending" | "done"; filledBy: string | null; createdAt: string }
interface Check { id: string; createdAt: string; answers: Answers; flags: { id: string; level: "attention" | "alert"; reason: string }[] }
interface CheckData { checkins: Check[]; questions: Field[]; config: { frequencyDays: number; questionIds: string[]; scope: string } }
const ALL = [["sono", "Sono"], ["fadiga", "Fadiga"], ["estresse", "Estresse"], ["motivacao", "Motivação"], ["dor", "Dor ou desconforto"], ["observacoes", "Observações"]];

/** Avaliações e check-ins de um aluno (visão do personal). */
export default function StudentFollowUp({ studentId }: { studentId: string }) {
  const [templates, setTemplates] = useState<Tpl[]>([]);
  const [list, setList] = useState<Ass[]>([]);
  const [tpl, setTpl] = useState("");
  const [filling, setFilling] = useState(false);
  const [answers, setAnswers] = useState<Answers>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [ck, setCk] = useState<CheckData | null>(null);
  const [freq, setFreq] = useState(7);
  const [qs, setQs] = useState<string[]>([]);
  const [error, setError] = useState(""); const [info, setInfo] = useState("");

  const load = useCallback(async () => {
    const [t, a, c] = await Promise.all([api("/assessment-templates"), api(`/students/${studentId}/assessments`), api(`/students/${studentId}/checkins`)]);
    if (t.ok) setTemplates(t.data.templates);
    if (a.ok) setList(a.data);
    if (c.ok) { setCk(c.data); setFreq(c.data.config.frequencyDays); setQs(c.data.config.questionIds); }
  }, [studentId]);
  useEffect(() => { load(); }, [load]);

  const current = templates.find((t) => t.id === tpl);
  async function request(withAnswers: boolean) {
    setError(""); setInfo(""); setErrors({});
    const r = await api(`/students/${studentId}/assessments`, "POST", withAnswers ? { templateId: tpl, answers } : { templateId: tpl });
    if (r.status === 400 && r.data?.errors) { setErrors(r.data.errors); return setError("Revise os campos destacados."); }
    if (!r.ok) return setError(r.data?.error ?? "Não foi possível salvar");
    setInfo(withAnswers ? "Avaliação registrada." : "Avaliação enviada ao aluno."); setFilling(false); setAnswers({}); load();
  }
  async function saveConfig() {
    setError(""); setInfo("");
    const r = await api(`/students/${studentId}/checkin-config`, "PUT", { frequencyDays: freq, questionIds: qs });
    if (!r.ok) return setError(r.data?.error ?? "Não foi possível salvar");
    setInfo("Configuração do check-in salva."); load();
  }

  return (
    <>
      <h2>Avaliações</h2>
      <div className="card">
        {templates.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>Nenhum modelo ainda. <Link href="/personal/avaliacoes">Adicione modelos de avaliação</Link>.</p>
        ) : (
          <>
            <div className="row">
              <select style={{ maxWidth: 320 }} value={tpl} onChange={(e) => { setTpl(e.target.value); setFilling(false); setAnswers({}); }} aria-label="Modelo de avaliação">
                <option value="">Escolher modelo…</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button className="btn ghost small" disabled={!tpl} onClick={() => request(false)}>Enviar ao aluno</button>
              <button className="btn small" disabled={!tpl} onClick={() => setFilling((v) => !v)}>{filling ? "Cancelar" : "Registrar agora"}</button>
              <Link className="btn ghost small" href="/personal/avaliacoes">Modelos</Link>
            </div>
            {filling && current && (
              <div style={{ marginTop: 14 }}>
                <FieldsForm fields={current.fields} value={answers} onChange={setAnswers} errors={errors} idPrefix="reg" />
                <button className="btn" onClick={() => request(true)}>Salvar avaliação</button>
              </div>
            )}
          </>
        )}
        {list.length > 0 && (
          <table style={{ marginTop: 12 }}><tbody>
            {list.map((a) => (
              <tr key={a.id}>
                <td><Link href={`/personal/avaliacoes/${a.id}`}>{a.templateName}</Link></td>
                <td className="muted">{new Date(a.createdAt).toLocaleDateString("pt-BR")}</td>
                <td className="num"><span className={`tag ${a.status === "pending" ? "pub" : ""}`}>{a.status === "pending" ? "Aguardando aluno" : a.filledBy === "student" ? "Respondida" : "Registrada"}</span></td>
              </tr>
            ))}
          </tbody></table>
        )}
      </div>

      <h2>Check-ins</h2>
      <div className="card" data-testid="checkins">
        {ck && ck.checkins.length === 0 && <p className="muted" style={{ marginTop: 0 }}>Nenhum check-in respondido ainda.</p>}
        {ck?.checkins.slice(0, 6).map((c) => (
          <div key={c.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
            <div className="row between"><b>{new Date(c.createdAt).toLocaleDateString("pt-BR")}</b>
              <span className="row">{c.flags.length === 0 && <span className="muted">sem sinais</span>}{c.flags.map((f) => <span key={f.id} className={`tag ${f.level === "alert" ? "pub" : ""}`} title={f.reason}>{f.reason}</span>)}</span></div>
            <div className="muted">{ck.questions.filter((q) => q.type === "scale").map((q) => `${q.label}: ${c.answers[q.id] ?? "—"}/10`).join(" · ")}{c.answers.dor ? ` · Dor: ${c.answers.dor}` : ""}{c.answers.observacoes ? ` · “${c.answers.observacoes}”` : ""}</div>
          </div>
        ))}
        <label>Configuração (só para este aluno)</label>
        <div className="row">
          <select style={{ maxWidth: 200 }} value={freq} onChange={(e) => setFreq(Number(e.target.value))} aria-label="Frequência">
            {[1, 3, 7, 14, 30].map((d) => <option key={d} value={d}>A cada {d} dia(s)</option>)}
          </select>
          {ALL.map(([id, label]) => (
            <label key={id} style={{ display: "flex", gap: 6, alignItems: "center", margin: 0, color: "var(--g)", cursor: "pointer" }}>
              <input type="checkbox" style={{ width: 16, height: 16, accentColor: "#2AC38B" }} checked={qs.includes(id)} onChange={() => setQs(qs.includes(id) ? qs.filter((x) => x !== id) : [...qs, id])} /> {label}
            </label>
          ))}
          <button className="btn small" disabled={qs.length === 0} onClick={saveConfig}>Salvar</button>
        </div>
        <p className="muted" style={{ marginBottom: 0 }}>Sinais são ilustrativos, sem finalidade diagnóstica: servem para orientar a sua revisão.</p>
      </div>
      {error && <p className="err">{error}</p>}{info && <p className="okmsg">{info}</p>}
    </>
  );
}
