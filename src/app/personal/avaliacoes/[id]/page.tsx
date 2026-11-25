"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { answerText } from "../../../../components/FieldsForm";
import Shell from "../../../../components/Shell";
import type { Field } from "../../../../lib/assessment";
import { api, useMe } from "../../../../lib/client";

interface Detail { id: string; studentId: string; templateName: string; fields: Field[]; answers: Record<string, any> | null; status: string; filledBy: string | null; submittedAt: string | null; deltas: Record<string, number | null> | null }

export default function Avaliacao() {
  const { id } = useParams<{ id: string }>();
  const { me, logout } = useMe("trainer");
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { if (me) api(`/assessments/${id}`).then((r) => (r.ok ? setD(r.data) : setError("Avaliação não encontrada."))); }, [me, id]);
  return (
    <Shell me={me} logout={logout}>
      <p><Link href={d ? `/personal/alunos/${d.studentId}` : "/personal"}>← Aluno</Link></p>
      {error && <p className="err">{error}</p>}
      {d && (
        <>
          <h1>{d.templateName}</h1>
          {d.status === "pending" ? <p className="muted">Aguardando o aluno responder.</p> : (
            <div className="card" data-testid="assessment">
              <p className="muted" style={{ marginTop: 0 }}>Preenchida por {d.filledBy === "student" ? "o aluno" : "você"} em {d.submittedAt ? new Date(d.submittedAt).toLocaleString("pt-BR") : "—"}. Dado de saúde: o seu acesso a esta página foi registrado.</p>
              <table>
                <thead><tr><th>Campo</th><th className="num">Resposta</th><th className="num">Variação</th></tr></thead>
                <tbody>
                  {d.fields.map((f) => {
                    const dl = d.deltas?.[f.id];
                    return <tr key={f.id}><td>{f.label}</td><td className="num">{answerText(f, d.answers?.[f.id])}</td><td className="num muted">{dl == null ? "—" : `${dl > 0 ? "+" : ""}${dl}${f.unit ? ` ${f.unit}` : ""}`}</td></tr>;
                  })}
                </tbody>
              </table>
              <p className="muted" style={{ marginBottom: 0 }}>Variação em relação à avaliação anterior do mesmo modelo.</p>
            </div>
          )}
        </>
      )}
    </Shell>
  );
}
