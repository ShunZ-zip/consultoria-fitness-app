// Check-ins periódicos (PROPOSTO): perguntas configuráveis pelo personal; respostas organizadas num painel
// para orientar a revisão profissional. Os sinais abaixo são ILUSTRATIVOS e sem finalidade diagnóstica.
import type { Answers, Field } from "./assessment";

export const CHECKIN_QUESTIONS: Field[] = [
  { id: "sono", label: "Qualidade do sono", type: "scale", min: 0, max: 10, required: true },
  { id: "fadiga", label: "Fadiga acumulada", type: "scale", min: 0, max: 10, required: true },
  { id: "estresse", label: "Nível de estresse", type: "scale", min: 0, max: 10, required: true },
  { id: "motivacao", label: "Motivação para treinar", type: "scale", min: 0, max: 10, required: true },
  { id: "dor", label: "Sentiu alguma dor ou desconforto durante os treinos?", type: "choice", options: ["Não", "Sim, desconforto leve", "Sim, desconforto significativo"], required: true },
  { id: "observacoes", label: "Algo mais que o seu personal deva saber?", type: "text" },
];
export const DEFAULT_QUESTION_IDS = CHECKIN_QUESTIONS.map((q) => q.id);
export const DEFAULT_FREQUENCY_DAYS = 7;

export function questionsFor(ids: string[] | null): Field[] {
  const set = new Set(ids ?? DEFAULT_QUESTION_IDS);
  return CHECKIN_QUESTIONS.filter((q) => set.has(q.id));
}

export interface Flag { id: string; level: "attention" | "alert"; reason: string }

export function computeFlags(a: Answers): Flag[] {
  const flags: Flag[] = [];
  const n = (k: string) => (typeof a[k] === "number" ? (a[k] as number) : null);
  if (a.dor === "Sim, desconforto significativo") flags.push({ id: "dor", level: "alert", reason: "Relatou desconforto significativo nos treinos" });
  else if (a.dor === "Sim, desconforto leve") flags.push({ id: "dor", level: "attention", reason: "Relatou desconforto leve nos treinos" });
  if (n("fadiga") != null && n("fadiga")! >= 8) flags.push({ id: "fadiga", level: "attention", reason: `Fadiga alta (${n("fadiga")}/10)` });
  if (n("estresse") != null && n("estresse")! >= 8) flags.push({ id: "estresse", level: "attention", reason: `Estresse alto (${n("estresse")}/10)` });
  if (n("sono") != null && n("sono")! <= 3) flags.push({ id: "sono", level: "attention", reason: `Sono ruim (${n("sono")}/10)` });
  if (n("motivacao") != null && n("motivacao")! <= 3) flags.push({ id: "motivacao", level: "attention", reason: `Motivação baixa (${n("motivacao")}/10)` });
  return flags;
}

/** Ordem do painel: alertas primeiro, depois atenção, depois o mais recente. */
export function priority(flags: Flag[]): number {
  return flags.some((f) => f.level === "alert") ? 2 : flags.length ? 1 : 0;
}

/** Check-in devolvido ao aluno: está em dia ou quando vence? */
export function dueStatus(lastAt: string | null, frequencyDays: number, now: Date): { due: boolean; nextAt: string | null } {
  if (!lastAt) return { due: true, nextAt: null };
  const next = new Date(new Date(lastAt).getTime() + frequencyDays * 86400000);
  return { due: now >= next, nextAt: next.toISOString() };
}
