"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import FieldsForm from "../../../components/FieldsForm";
import Shell from "../../../components/Shell";
import type { Answers, Field } from "../../../lib/assessment";
import { api, useMe } from "../../../lib/client";

interface Data { questions: Field[]; frequencyDays: number; due: boolean; nextAt: string | null; last: { id: string; createdAt: string } | null; disclaimer: string }

export default function Checkin() {
  const { me, logout } = useMe("student");
  const [data, setData] = useState<Data | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rid] = useState(() => (typeof crypto !== "undefined" ? crypto.randomUUID() : ""));

  const load = useCallback(async () => { const r = await api("/me/checkin"); if (r.ok) setData(r.data); }, []);
  useEffect(() => { if (me) load(); }, [me, load]);

  async function submit() {
    setBusy(true); setError(""); setErrors({});
    const r = await api("/me/checkin", "POST", { id: rid, answers });
    setBusy(false);
    if (r.status === 400) { setErrors(r.data?.errors ?? {}); return setError("Responda as perguntas obrigatórias (*) antes de enviar."); }
    if (!r.ok) return setError(r.data?.error ?? "Não foi possível enviar.");
    setDone(true); load();
  }

  return (
    <Shell me={me} logout={logout}>
      <p><Link href="/aluno">← Meus treinos</Link></p>
      <h1>Check-in semanal</h1>
      {data && (
        <>
          {done ? (
            <div className="card"><p className="okmsg" style={{ margin: 0 }}>Check-in enviado. Seu personal vai acompanhar as respostas.</p></div>
          ) : !data.due && data.last ? (
            <div className="card">
              <p style={{ marginTop: 0 }}>Você está em dia. Último check-in em {new Date(data.last.createdAt).toLocaleDateString("pt-BR")}.</p>
              <p className="muted" style={{ marginBottom: 0 }}>Próximo: {data.nextAt ? new Date(data.nextAt).toLocaleDateString("pt-BR") : "—"} (a cada {data.frequencyDays} dias).</p>
            </div>
          ) : (
            <div className="card">
              <p className="muted" style={{ marginTop: 0 }}>Como foi sua semana de treinamento?</p>
              <FieldsForm fields={data.questions} value={answers} onChange={setAnswers} errors={errors} idPrefix="ck" />
              {error && <p className="err">{error}</p>}
              <button className="btn" disabled={busy} onClick={submit}>Enviar check-in</button>
              <p className="muted" style={{ marginBottom: 0 }}>{data.disclaimer}</p>
            </div>
          )}
        </>
      )}
    </Shell>
  );
}
