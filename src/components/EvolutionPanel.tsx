"use client";
import { useEffect, useMemo, useState } from "react";
import type { ExerciseEvolution } from "../lib/evolution";
import { AnalyticsLineChart, DEFAULT_GRADIENT, EASE_OUT, type AnalyticsDataPoint, type AnalyticsGradientStop } from "./AnalyticsChart";
import Icon, { type IconName } from "./Icon";

export interface EvolutionData {
  exercises: ExerciseEvolution[];
  summary: { sessionsCompleted: number; sessionsPlanned: number | null; adherencePct: number | null; completionPct: number | null; records: number; note: string };
}

type Metric = "bestE1rm" | "topLoad" | "volumeLoad";
// Mesma estrutura da demonstração (abas com título, subtítulo, dados e unidade), com as métricas da evolução.
const METRIC_SETS: Record<Metric, { title: string; sub: string; valueLabel: string; gradient?: AnalyticsGradientStop[] }> = {
  bestE1rm: { title: "1RM estimada", sub: "Estimativa de Epley (até 12 repetições), só séries de trabalho", valueLabel: "kg" },
  topLoad: { title: "Carga máxima", sub: "Maior carga usada em cada sessão", valueLabel: "kg" },
  volumeLoad: { title: "Volume de carga", sub: "Soma de repetições × carga em cada sessão", valueLabel: "kg" },
};
const TAB_ICON: Record<Metric, IconName> = { bestE1rm: "trophy", topLoad: "dumbbell", volumeLoad: "chart" };
const RECORD_COLOR = "#2AC38B"; // verde = ponto de validação (recorde pessoal)
const kg = (n: number | null | undefined) => (n == null ? "—" : `${n.toLocaleString("pt-BR")} kg`);

export default function EvolutionPanel({ data }: { data: EvolutionData }) {
  const [sel, setSel] = useState("");
  const [tab, setTab] = useState<Metric>("bestE1rm");
  const [epoch, setEpoch] = useState(0); // refaz a animação ao trocar de aba ou de exercício
  useEffect(() => { if (!sel && data.exercises[0]) setSel(data.exercises[0].exerciseId); }, [data, sel]);
  const ex = data.exercises.find((e) => e.exerciseId === sel) ?? data.exercises[0];
  const s = data.summary;
  const metric = METRIC_SETS[tab];

  const chart = useMemo(() => {
    if (!ex) return { points: [] as AnalyticsDataPoint[], pinned: [] as number[], colors: {} as Record<number, string> };
    const sessions = ex.points.filter((p) => p[tab] != null);
    const pinned: number[] = []; const colors: Record<number, number | string> = {};
    sessions.forEach((p, i) => { if (p.isRecord) { pinned.push(i); colors[i] = RECORD_COLOR; } });
    return {
      points: sessions.map((p) => ({ date: p.date, label: p.isRecord ? "recorde pessoal" : `${p.sets} séries`, value: p[tab] as number })),
      pinned, colors: colors as Record<number, string>,
    };
  }, [ex, tab]);

  const stat = (label: string, value: string, hint?: string) => (
    <div><div className="muted">{label}</div><div style={{ fontSize: 24, fontWeight: 800 }}>{value}</div>{hint && <div className="muted">{hint}</div>}</div>
  );
  const pick = (k: Metric) => { setTab(k); setEpoch((e) => e + 1); };

  return (
    <div data-testid="evolution">
      <div className="card" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16 }}>
        {stat("Sessões concluídas", s.sessionsPlanned != null ? `${s.sessionsCompleted}/${s.sessionsPlanned}` : String(s.sessionsCompleted), s.sessionsPlanned == null ? "defina a frequência semanal para ver a aderência" : undefined)}
        {stat("Aderência ao treino", s.adherencePct != null ? `${s.adherencePct}%` : "—", "sessões concluídas / previstas")}
        {stat("Séries da prescrição feitas", s.completionPct != null ? `${s.completionPct}%` : "—")}
        {stat("Recordes pessoais", String(s.records), "melhor 1RM estimada por sessão")}
      </div>

      {data.exercises.length === 0 ? <p className="muted">Ainda não há séries de trabalho registradas.</p> : ex && (
        <>
          <select aria-label="Exercício" style={{ maxWidth: 340, marginBottom: 12 }} value={ex.exerciseId} onChange={(e) => { setSel(e.target.value); setEpoch((n) => n + 1); }}>
            {data.exercises.map((e) => <option key={e.exerciseId} value={e.exerciseId}>{e.name} ({e.points.length} sessões)</option>)}
          </select>

          {/* Abas */}
          <div role="tablist" aria-label="Métrica" style={{ display: "flex", gap: 2, padding: 4, marginBottom: 12, background: "var(--panel)", borderRadius: 8, border: "1px solid var(--line)" }}>
            {(Object.entries(METRIC_SETS) as [Metric, (typeof METRIC_SETS)[Metric]][]).map(([k, v]) => {
              const on = tab === k;
              return (
                <button key={k} type="button" role="tab" aria-selected={on} data-slot="analytics-chart-tab" onClick={() => pick(k)}
                  onMouseDown={(e) => { if (!on) e.currentTarget.style.transform = "scale(0.97)"; }}
                  onMouseUp={(e) => { e.currentTarget.style.transform = ""; }} onMouseLeave={(e) => { e.currentTarget.style.transform = ""; }}
                  style={{
                    flex: 1, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, padding: "8px 14px", borderRadius: 6, fontFamily: "inherit",
                    background: on ? "var(--v)" : "transparent", color: on ? "var(--ink)" : "var(--muted)", transition: `all 200ms ${EASE_OUT}`,
                  }}>
                  <Icon name={TAB_ICON[k]} />{v.title}
                </button>
              );
            })}
          </div>

          {/* Cartão */}
          <div className="card" style={{ padding: "20px 24px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 14, color: "var(--g)", textTransform: "none", letterSpacing: 0, fontStyle: "normal", fontFamily: "inherit" }}>{ex.name} · {metric.title}</h2>
                <p style={{ margin: "1px 0 0", fontSize: 11, fontWeight: 500, color: "var(--muted)" }}>{metric.sub}</p>
              </div>
              <span style={{ fontSize: 11, fontWeight: 500, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>{chart.points.length} sessões</span>
            </div>
            <AnalyticsLineChart key={`${ex.exerciseId}-${tab}-${epoch}`} data={chart.points} gradientStops={metric.gradient ?? DEFAULT_GRADIENT}
              dotColors={chart.colors} pinnedIndices={chart.pinned} valueLabel={metric.valueLabel} gridLines={4}
              ariaLabel={`${ex.name}, ${metric.title}: ${chart.points.length} sessões`} />
            <p style={{ textAlign: "center", fontSize: 11, color: "var(--muted)", margin: "4px 0 0", fontWeight: 500 }}>
              Passe o mouse ou toque nos pontos para ver os detalhes. <span aria-hidden="true" style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: RECORD_COLOR, border: "2px solid var(--ink)", verticalAlign: "-1px", marginRight: 4 }} />recorde pessoal (1RM estimada)
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16, margin: "12px 0" }}>
            {stat("Carga mais pesada", kg(ex.heaviest?.loadKg), ex.heaviest?.reps != null ? `${ex.heaviest.reps} repetições` : undefined)}
            {stat("Melhor 1RM estimada", kg(ex.bestE1rm?.value), "Epley, até 12 repetições")}
            {stat("Variação de carga", ex.change.loadKg == null ? "—" : `${ex.change.loadKg > 0 ? "+" : ""}${ex.change.loadKg} kg`, "do primeiro ao último treino")}
            {stat("Recordes neste exercício", String(ex.records))}
          </div>
        </>
      )}
      <p className="muted">{s.note} Só séries de trabalho entram; a 1RM é uma estimativa.</p>
    </div>
  );
}
