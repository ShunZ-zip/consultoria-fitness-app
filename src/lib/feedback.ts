// Caixa de feedbacks do personal: regras puras (testáveis) sobre uma sessão concluída pelo aluno.
// Esforço percebido da sessão: escala de 8 níveis escolhida pelo aluno ao concluir (opcional), do mais leve à exaustão.
export const EFFORT_MAX = 8;
export const EFFORT_LABELS: Record<number, string> = {
  1: "Muito leve", 2: "Leve", 3: "Moderada", 4: "Pouco intensa", 5: "Intensa", 6: "Muito intensa", 7: "Muito, muito intensa", 8: "Exaustão máxima",
};
export const effortLabel = (e: number | null | undefined) => (e == null ? null : EFFORT_LABELS[e] ?? null);

/** Duração em minutos inteiros; nula se faltar uma ponta, se a ordem for inválida ou se passar de 24 h (provável esquecimento de concluir). */
export function durationMinutes(startedAt: string | Date | null, finishedAt: string | Date | null): number | null {
  if (!startedAt || !finishedAt) return null;
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0 || ms > 24 * 3600 * 1000) return null;
  return Math.round(ms / 60000);
}

/** "50 min", "1 h 05 min". */
export function formatDuration(min: number | null): string {
  if (min == null) return "—";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")} min`;
}

/** Percentual de séries registradas em relação às prescritas (limitado a 100; sem prescrição = nulo). */
export function completionPct(done: number, prescribed: number): number | null {
  if (!prescribed || prescribed <= 0) return null;
  return Math.min(100, Math.round((Math.max(0, done) / prescribed) * 100));
}

export interface FeedbackItem {
  id: string; studentId: string; studentName: string; versionId: string; workoutName: string;
  startedAt: string; finishedAt: string; durationMin: number | null; effort: number | null; effortLabel: string | null;
  note: string | null; setsDone: number; setsPrescribed: number; completionPct: number | null; avgRir: number | null;
  resolved: boolean; resolvedAt: string | null;
}

/** Filtro de busca por aluno ou treino, sem acento e sem diferenciar maiúsculas. */
export function matchesQuery(it: Pick<FeedbackItem, "studentName" | "workoutName">, q: string): boolean {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const t = norm(q.trim());
  return !t || norm(`${it.studentName} ${it.workoutName}`).includes(t);
}
