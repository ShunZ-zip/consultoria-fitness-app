"use client";
import { useId, useMemo, useState } from "react";

// Gráfico de linha de análise (SVG, sem dependências). API: data, gradientStops, dotColors, gridLines,
// pinnedIndices, valueLabel. Passar o mouse, tocar ou focar (teclado) num ponto mostra os detalhes;
// os pontos "fixados" mantêm o rótulo visível (aqui: recordes pessoais).
export const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";

export interface AnalyticsDataPoint { date: string; label?: string; value: number }
export interface AnalyticsGradientStop { offset: string; color: string; opacity?: number }

// Paleta da marca: o início da linha (treinos antigos) é mais suave e o fim, o azul vivo.
export const DEFAULT_GRADIENT: AnalyticsGradientStop[] = [
  { offset: "0%", color: "#1A73E9", opacity: 0.45 },
  { offset: "100%", color: "#1A73E9", opacity: 1 },
];
export const DEFAULT_DATA: AnalyticsDataPoint[] = [
  { date: "2026-10-01", label: "exemplo", value: 60 }, { date: "2026-10-08", label: "exemplo", value: 63 },
  { date: "2026-10-15", label: "exemplo", value: 66 }, { date: "2026-10-22", label: "exemplo", value: 70 },
];

const W = 600, H = 260, L = 52, R = 18, T = 20, B = 36;
const fmtNum = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const fmtDateLong = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

/** Curva suave que não ultrapassa os dados (interpolação monotônica), em coordenadas já projetadas. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
  const n = pts.length;
  const dx: number[] = [], m: number[] = [], t: number[] = new Array(n);
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1].x - pts[i].x; m[i] = (pts[i + 1].y - pts[i].y) / dx[i]; }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const c1x = pts[i].x + dx[i] / 3, c1y = pts[i].y + (t[i] * dx[i]) / 3;
    const c2x = pts[i + 1].x - dx[i] / 3, c2y = pts[i + 1].y - (t[i + 1] * dx[i]) / 3;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${pts[i + 1].x.toFixed(1)},${pts[i + 1].y.toFixed(1)}`;
  }
  return d;
}

export interface AnalyticsLineChartProps {
  data: AnalyticsDataPoint[];
  gradientStops?: AnalyticsGradientStop[];
  /** Cor de pontos específicos, por índice. */
  dotColors?: Record<number, string>;
  gridLines?: number;
  /** Índices cujo rótulo fica sempre visível. */
  pinnedIndices?: number[];
  valueLabel?: string;
  ariaLabel?: string;
}

export function AnalyticsLineChart({ data, gradientStops = DEFAULT_GRADIENT, dotColors = {}, gridLines = 4, pinnedIndices = [], valueLabel = "", ariaLabel }: AnalyticsLineChartProps) {
  const uid = useId().replace(/:/g, "");
  const [active, setActive] = useState<number | null>(null);

  const geo = useMemo(() => {
    const ys = data.map((d) => d.value);
    let lo = Math.min(...ys), hi = Math.max(...ys);
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    if (lo === hi) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.18; lo -= pad; hi += pad;
    const X = (i: number) => (data.length === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (data.length - 1));
    const Y = (v: number) => T + ((hi - v) / (hi - lo)) * (H - T - B);
    const pts = data.map((d, i) => ({ x: X(i), y: Y(d.value) }));
    const ticks = Array.from({ length: gridLines }, (_, k) => lo + ((hi - lo) * k) / (gridLines - 1 || 1));
    const line = smoothPath(pts);
    const area = pts.length > 1 ? `${line} L${pts.at(-1)!.x.toFixed(1)},${H - B} L${pts[0].x.toFixed(1)},${H - B} Z` : "";
    return { pts, ticks, line, area, Y };
  }, [data, gridLines]);

  if (data.length === 0) return <p className="muted">Sem dados suficientes para este gráfico.</p>;

  const labelEvery = data.length > 9 ? Math.ceil(data.length / 9) : 1;
  const shown = new Set([...pinnedIndices, ...(active !== null ? [active] : [])]);
  const summary = ariaLabel ?? `Gráfico de linha com ${data.length} pontos: ${data.map((d) => `${fmtDate(d.date)} ${fmtNum(d.value)} ${valueLabel}`).join("; ")}`;
  const gid = `g${uid}`, ag = `a${uid}`;

  return (
    <div style={{ position: "relative" }} data-slot="analytics-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}
        onMouseLeave={() => setActive(null)}>
        <defs>
          <linearGradient id={gid} x1="0" x2="1" y1="0" y2="0">
            {gradientStops.map((s, i) => <stop key={i} offset={s.offset} stopColor={s.color} stopOpacity={s.opacity ?? 1} />)}
          </linearGradient>
          <linearGradient id={ag} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={gradientStops.at(-1)?.color ?? "#1A73E9"} stopOpacity={0.22} />
            <stop offset="100%" stopColor={gradientStops.at(-1)?.color ?? "#1A73E9"} stopOpacity={0} />
          </linearGradient>
        </defs>

        {geo.ticks.map((t, k) => (
          <g key={k}>
            <line x1={L} x2={W - R} y1={geo.Y(t)} y2={geo.Y(t)} stroke="rgba(230,234,237,.12)" />
            <text x={L - 8} y={geo.Y(t) + 4} textAnchor="end" fontSize="11" fill="rgba(230,234,237,.72)" style={{ fontVariantNumeric: "tabular-nums" }}>{fmtNum(Math.round(t * 10) / 10)}</text>
          </g>
        ))}

        {geo.area && <path className="cf-area" d={geo.area} fill={`url(#${ag})`} />}
        <path className="cf-line" pathLength={1} d={geo.line} fill="none" stroke={`url(#${gid})`} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />

        {data.map((d, i) => {
          const p = geo.pts[i];
          const color = dotColors[i] ?? "#1A73E9";
          const on = active === i || pinnedIndices.includes(i);
          return (
            <g key={i}>
              {(i % labelEvery === 0 || i === data.length - 1) && (
                <text x={p.x} y={H - 12} textAnchor="middle" fontSize="11" fill="rgba(230,234,237,.72)">{fmtDate(d.date)}</text>
              )}
              <circle className="cf-dot" cx={p.x} cy={p.y} r={on ? 7 : 4.5} fill="#0E1B2B" stroke={color} strokeWidth={2.5}
                tabIndex={0} role="img" aria-label={`${fmtDateLong(d.date)}: ${fmtNum(d.value)} ${valueLabel}`}
                onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onBlur={() => setActive(null)} onTouchStart={() => setActive(i)} />
              {/* área de toque maior, sem aparecer */}
              <circle cx={p.x} cy={p.y} r={16} fill="transparent" onMouseEnter={() => setActive(i)} onTouchStart={() => setActive(i)} />
            </g>
          );
        })}
      </svg>

      {[...shown].map((i) => {
        const p = geo.pts[i]; const d = data[i];
        if (!p || !d) return null;
        const left = Math.min(88, Math.max(12, (p.x / W) * 100));
        return (
          <div key={i} role="status" data-testid="chart-tooltip" style={{
            position: "absolute", left: `${left}%`, top: `${(p.y / H) * 100}%`, transform: "translate(-50%, calc(-100% - 14px))",
            pointerEvents: "none", background: "#0E1B2B", border: `1px solid ${dotColors[i] ?? "rgba(230,234,237,.3)"}`, borderRadius: 6,
            padding: "5px 9px", fontSize: 12, lineHeight: 1.25, whiteSpace: "nowrap", zIndex: active === i ? 3 : 2,
            transition: `opacity 160ms ${EASE_OUT}`,
          }}>
            <div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtNum(d.value)} {valueLabel}</div>
            <div style={{ color: "rgba(230,234,237,.72)" }}>{fmtDate(d.date)}{d.label ? ` · ${d.label}` : ""}</div>
          </div>
        );
      })}
    </div>
  );
}
