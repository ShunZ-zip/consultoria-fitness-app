// Frequência semanal e engajamento do aluno: regras puras sobre as datas de sessões CONCLUÍDAS.
// Dia = dia civil no fuso informado (padrão Brasília, -180 min). Semana = segunda a domingo.
// Os limites de engajamento abaixo são PROPOSTAS (o documento não os define) e ficam num só lugar para ajuste.
export const WEEK_LABELS = ["S", "T", "Q", "Q", "S", "S", "D"] as const;
export const WEEK_NAMES = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"] as const;
export const DEFAULT_TZ_OFFSET_MIN = -180;
export const ENGAGED_MAX_DAYS = 4;   // último treino há até 4 dias = Engajado
export const ATTENTION_MAX_DAYS = 9; // de 5 a 9 dias = Atenção; mais que isso = Parado
export const AVERAGE_WINDOW_DAYS = 28;

export type EngagementStatus = "none" | "engaged" | "attention" | "stalled";
export const STATUS_LABEL: Record<EngagementStatus, string> = { none: "Sem treinos", engaged: "Engajado", attention: "Atenção", stalled: "Parado" };

/** Chave AAAA-MM-DD do dia civil de um instante, no fuso dado (minutos a leste do UTC). */
export function dayKey(d: Date | string, tzOffsetMin = DEFAULT_TZ_OFFSET_MIN): string {
  const ms = new Date(d).getTime();
  return new Date(ms + tzOffsetMin * 60000).toISOString().slice(0, 10);
}
const dayNumber = (key: string) => Math.floor(Date.parse(key + "T00:00:00Z") / 86400000);
const fromDayNumber = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10);
/** 0 = segunda … 6 = domingo. */
const mondayIndex = (key: string) => (new Date(key + "T00:00:00Z").getUTCDay() + 6) % 7;

export interface WeekDay { label: string; name: string; date: string; trained: boolean; today: boolean; future: boolean; sessions: number }

/** Os 7 dias da semana de `now`, com quantas sessões concluídas cada um teve. */
export function buildWeek(finishedAts: (Date | string)[], now: Date, tz = DEFAULT_TZ_OFFSET_MIN): WeekDay[] {
  const today = dayKey(now, tz);
  const start = dayNumber(today) - mondayIndex(today);
  const per = new Map<string, number>();
  for (const f of finishedAts) { const k = dayKey(f, tz); per.set(k, (per.get(k) ?? 0) + 1); }
  return WEEK_LABELS.map((label, i) => {
    const date = fromDayNumber(start + i);
    const sessions = per.get(date) ?? 0;
    return { label, name: WEEK_NAMES[i], date, trained: sessions > 0, today: date === today, future: date > today, sessions };
  });
}

export interface Engagement {
  status: EngagementStatus; statusLabel: string;
  daysTrainedThisWeek: number; sessionsThisWeek: number;
  lastWorkoutAt: string | null; daysSinceLast: number | null;
  avgPerWeek: number | null;            // sessões por semana nos últimos 28 dias (uma casa decimal)
  plannedPerWeek: number | null;
  totalSessions: number;
}

export function computeEngagement(finishedAts: (Date | string)[], now: Date, plannedPerWeek: number | null = null, tz = DEFAULT_TZ_OFFSET_MIN): Engagement {
  const valid = finishedAts.map((f) => new Date(f)).filter((d) => Number.isFinite(d.getTime()) && d.getTime() <= now.getTime() + 60000);
  const week = buildWeek(valid, now, tz);
  const sessionsThisWeek = week.reduce((n, d) => n + d.sessions, 0);
  const daysTrainedThisWeek = week.filter((d) => d.trained).length;
  const last = valid.length ? new Date(Math.max(...valid.map((d) => d.getTime()))) : null;
  const daysSinceLast = last ? Math.max(0, dayNumber(dayKey(now, tz)) - dayNumber(dayKey(last, tz))) : null;
  const status: EngagementStatus = daysSinceLast == null ? "none" : daysSinceLast <= ENGAGED_MAX_DAYS ? "engaged" : daysSinceLast <= ATTENTION_MAX_DAYS ? "attention" : "stalled";
  const since = dayNumber(dayKey(now, tz)) - (AVERAGE_WINDOW_DAYS - 1);
  const inWindow = valid.filter((d) => dayNumber(dayKey(d, tz)) >= since).length;
  const avgPerWeek = valid.length ? Math.round((inWindow / (AVERAGE_WINDOW_DAYS / 7)) * 10) / 10 : null;
  return {
    status, statusLabel: STATUS_LABEL[status], daysTrainedThisWeek, sessionsThisWeek,
    lastWorkoutAt: last ? last.toISOString() : null, daysSinceLast, avgPerWeek, plannedPerWeek, totalSessions: valid.length,
  };
}

/** "hoje", "ontem", "há 3 dias". */
export function sinceText(days: number | null): string {
  if (days == null) return "—";
  return days === 0 ? "hoje" : days === 1 ? "ontem" : `há ${days} dias`;
}

/** "2 dias de treino nesta semana" / "Nenhum treino nesta semana ainda". */
export function weekSummaryText(daysTrained: number): string {
  return daysTrained === 0 ? "Nenhum treino nesta semana ainda" : `${daysTrained} ${daysTrained === 1 ? "dia" : "dias"} de treino nesta semana`;
}
