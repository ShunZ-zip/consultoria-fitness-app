"use client";
// Frequência da semana (S T Q Q S S D) e engajamento. Aluno vê o próprio; personal vê o do aluno aberto.
// Só lê datas de sessões concluídas; nada aqui altera prescrição nem registro.
import { useEffect, useState } from "react";
import { api } from "../lib/client";
import { sinceText, weekSummaryText, type Engagement, type WeekDay } from "../lib/engagement";
import Icon from "./Icon";

type Data = Engagement & { week: WeekDay[] };

const dm = (iso: string) => { const [, m, d] = iso.split("-"); return `${d}/${m}`; };

export function WeekStrip({ week }: { week: WeekDay[] }) {
  return (
    <ul className="wk-strip" aria-label="Frequência de treinos desta semana">
      {week.map((d) => {
        const state = d.trained ? `treinou${d.sessions > 1 ? ` (${d.sessions} sessões)` : ""}` : d.future ? "ainda não chegou" : d.today ? "hoje, sem treino registrado ainda" : "sem treino";
        return (
          <li key={d.date} aria-label={`${d.name}, ${dm(d.date)}: ${state}`} className={`wk-day${d.trained ? " done" : ""}${d.today ? " today" : ""}${d.future ? " future" : ""}`}>
            <span className="wk-dot" aria-hidden="true">{d.trained ? <Icon name="check" /> : null}</span>
            <span className="wk-lb" aria-hidden="true">{d.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

export default function EngagementPanel({ path, who }: { path: string; who: "aluno" | "personal" }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    const tz = -new Date().getTimezoneOffset();   // minutos a leste do UTC
    api(`${path}?tz=${tz}`).then((r) => { if (!live) return; if (r.ok) setData(r.data); else setError(true); }).catch(() => live && setError(true));
    return () => { live = false; };
  }, [path]);

  if (error) return <p className="muted">Não foi possível carregar a frequência agora.</p>;
  if (!data) return <div className="card" aria-busy="true"><p className="muted" style={{ margin: 0 }}>Carregando frequência…</p></div>;
  const perWeek = data.avgPerWeek == null ? "—" : `${String(data.avgPerWeek).replace(".", ",")}× por semana`;
  return (
    <section className="card" aria-labelledby="eng-h" data-testid="engagement">
      <div className="row between">
        <h2 id="eng-h" style={{ margin: 0 }}>Frequência de treinos</h2>
        {who === "personal" && <span className={`tag eng-${data.status}`}>{data.statusLabel}</span>}
      </div>
      <WeekStrip week={data.week} />
      <p style={{ margin: "10px 0 0", fontWeight: 600 }}>{weekSummaryText(data.daysTrainedThisWeek)}{data.plannedPerWeek ? ` (meta: ${data.plannedPerWeek}×)` : ""}.</p>
      <dl className="eng-stats">
        <div><dt>Último treino</dt><dd>{data.totalSessions ? sinceText(data.daysSinceLast) : "ainda não treinou"}</dd></div>
        <div><dt>Frequência média</dt><dd>{perWeek}</dd></div>
        {who === "personal" && <div><dt>Sessões concluídas</dt><dd>{data.totalSessions}</dd></div>}
      </dl>
      <p className="muted" style={{ margin: "8px 0 0", fontSize: 12 }}>A média considera os últimos 28 dias. {who === "personal" ? "Engajado: último treino há até 4 dias; atenção: de 5 a 9; parado: 10 ou mais." : "Conta só os treinos que você concluiu."}</p>
    </section>
  );
}
