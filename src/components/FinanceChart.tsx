"use client";
import { useEffect, useMemo, useState } from "react";
import { brl } from "../lib/billing";
import { api } from "../lib/client";
import { AnalyticsLineChart, DEFAULT_GRADIENT, EASE_OUT, type AnalyticsDataPoint } from "./AnalyticsChart";
import Icon, { type IconName } from "./Icon";

interface Point { month: string; receivedCents: number; netReceivedCents: number; expensesCents: number; resultCents: number; billedCents: number }
type Metric = "receivedCents" | "expensesCents" | "resultCents" | "billedCents";
const METRICS: Record<Metric, { tab: string; title: string; sub: string; icon: IconName }> = {
  receivedCents: { tab: "Recebido", title: "Recebido por mês", sub: "Cobranças pagas, pelo mês do pagamento", icon: "card" },
  expensesCents: { tab: "Despesas", title: "Despesas por mês", sub: "Despesas registradas, pelo mês da data", icon: "clipboard" },
  resultCents: { tab: "Resultado", title: "Resultado por mês", sub: "Líquido recebido (sem taxas do intermediador) menos despesas", icon: "chart" },
  billedCents: { tab: "Faturado", title: "Faturado por mês", sub: "Cobranças com vencimento no mês, sem as canceladas e estornadas", icon: "plus" },
};
const MONTHS = 6;
const tick = (cents: number) => (cents / 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

/** Evolução financeira dos últimos meses (mesmo gráfico da evolução de carga). Valores em R$; resultado negativo aparece com sinal. */
export default function FinanceChart({ endMonth, refreshKey = 0 }: { endMonth: string; refreshKey?: number }) {
  const [series, setSeries] = useState<Point[] | null>(null);
  const [tab, setTab] = useState<Metric>("receivedCents");
  const [epoch, setEpoch] = useState(0); // refaz a animação ao trocar de aba ou de mês

  useEffect(() => {
    let alive = true;
    api(`/billing/series?end=${endMonth}&months=${MONTHS}`).then((r) => { if (alive && r.ok) { setSeries(r.data); setEpoch((e) => e + 1); } });
    return () => { alive = false; };
  }, [endMonth, refreshKey]);

  const m = METRICS[tab];
  const points = useMemo<AnalyticsDataPoint[]>(() => (series ?? []).map((p) => ({ date: `${p.month}-01`, value: p[tab] / 100, label: p.month === endMonth ? "mês selecionado" : undefined })), [series, tab, endMonth]);
  const last = points.length - 1;

  return (
    <section aria-labelledby="fin-chart-h" data-testid="finance-chart" style={{ margin: "16px 0" }}>
      <div role="tablist" aria-label="Métrica do gráfico" style={{ display: "flex", gap: 2, padding: 4, marginBottom: 12, background: "var(--panel)", borderRadius: 8, border: "1px solid var(--line)" }}>
        {(Object.keys(METRICS) as Metric[]).map((k) => {
          const on = tab === k;
          return (
            <button key={k} type="button" role="tab" aria-selected={on} onClick={() => { setTab(k); setEpoch((e) => e + 1); }}
              style={{ flex: 1, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, padding: "8px 10px", borderRadius: 6, fontFamily: "inherit", minHeight: 40,
                background: on ? "var(--v)" : "transparent", color: on ? "var(--n)" : "var(--muted)", transition: `all 200ms ${EASE_OUT}` }}>
              <Icon name={METRICS[k].icon} />{METRICS[k].tab}
            </button>
          );
        })}
      </div>
      <div className="card" style={{ padding: "14px 14px 8px" }}>
        <div className="row between" style={{ marginBottom: 6 }}>
          <div>
            <h2 id="fin-chart-h" style={{ margin: 0, fontSize: 14, color: "var(--g)", textTransform: "none", letterSpacing: 0, fontStyle: "normal", fontFamily: "inherit" }}>{m.title}</h2>
            <p style={{ margin: "1px 0 0", fontSize: 11, fontWeight: 500, color: "var(--muted)" }}>{m.sub}</p>
          </div>
          <span style={{ fontSize: 11, fontWeight: 500, color: "var(--muted)" }}>últimos {MONTHS} meses</span>
        </div>
        {series === null ? <p className="muted" role="status">Carregando o gráfico…</p> : (
          <AnalyticsLineChart key={`${tab}-${epoch}`} data={points} gradientStops={DEFAULT_GRADIENT} monthly floorZero pinnedIndices={last >= 0 ? [last] : []}
            formatValue={(n) => brl(Math.round(n * 100))} formatTick={(n) => tick(n * 100)} gridLines={4}
            ariaLabel={`${m.title}: ${points.map((p) => `${new Date(p.date).toLocaleDateString("pt-BR", { month: "long", timeZone: "UTC" })} ${brl(Math.round(p.value * 100))}`).join("; ")}`} />
        )}
        <p style={{ textAlign: "center", fontSize: 11, color: "var(--muted)", margin: "4px 0 0", fontWeight: 500 }}>Passe o mouse ou toque nos pontos para ver os valores em R$. O ponto fixo é o mês selecionado.</p>
      </div>
    </section>
  );
}
