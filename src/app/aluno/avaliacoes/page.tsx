"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import FieldsForm, { answerText } from "../../../components/FieldsForm";
import Shell from "../../../components/Shell";
import type { Answers, Field } from "../../../lib/assessment";
import { api, useMe } from "../../../lib/client";

interface Item { id: string; templateName: string; status: "pending" | "done"; filledBy: string | null; createdAt: string; submittedAt: string | null }
interface Detail { id: string; templateName: string; fields: Field[]; answers: Record<string, any> | null; status: string }

export default function MinhasAvaliacoes() {
  const { me, logout } = useMe("student");
  const [list, setList] = useState<Item[]>([]);
  const [open, setOpen] = useState<Detail | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const load = useCallback(async () => { const r = await api("/me/assessments"); if (r.ok) setList(r.data); }, []);
  useEffect(() => { if (me) load(); }, [me, load]);

  async function openItem(id: string) {
    setError(""); setErrors({}); setAnswers({});
    const r = await api(`/assessments/${id}`);
    if (r.ok) setOpen(r.data);
  }
  async function submit() {
    if (!open) return;
    setError(""); setErrors({});
    const r = await api(`/assessments/${open.id}/submit`, "POST", { answers });
    if (r.status === 400) { setErrors(r.data?.errors ?? {}); return setError("Revise as respostas destacadas."); }
    if (!r.ok) return setError(r.data?.error ?? "Não foi possível enviar.");
    setOpen(null); load();
  }

  return (
    <Shell me={me} logout={logout}>
      <p><Link href="/aluno">← Meus treinos</Link></p>
      <h1>Minhas avaliações</h1>
      <p className="muted">Suas respostas e medidas são dados de saúde: só você e o seu personal têm acesso.</p>
      {error && <p className="err">{error}</p>}

      {open ? (
        <div className="card">
          <div className="row between"><b>{open.templateName}</b><button className="btn ghost small" onClick={() => setOpen(null)}>Fechar</button></div>
          {open.status === "pending" ? (
            <>
              <FieldsForm fields={open.fields} value={answers} onChange={setAnswers} errors={errors} idPrefix="av" />
              <button className="btn" onClick={submit}>Enviar respostas</button>
            </>
          ) : (
            <table><tbody>{open.fields.map((f) => <tr key={f.id}><td>{f.label}</td><td className="num">{answerText(f, open.answers?.[f.id])}</td></tr>)}</tbody></table>
          )}
        </div>
      ) : (
        <>
          {list.length === 0 && <p className="muted">Nenhuma avaliação ainda.</p>}
          {list.map((a) => (
            <div className="card row between" key={a.id}>
              <span><b>{a.templateName}</b><div className="muted">{new Date(a.createdAt).toLocaleDateString("pt-BR")}</div></span>
              <span className="row">
                <span className={`tag ${a.status === "pending" ? "pub" : ""}`}>{a.status === "pending" ? "Para responder" : "Respondida"}</span>
                <button className="btn small" onClick={() => openItem(a.id)}>{a.status === "pending" ? "Responder" : "Ver"}</button>
              </span>
            </div>
          ))}
        </>
      )}
    </Shell>
  );
}
