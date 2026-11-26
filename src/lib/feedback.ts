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

/** Cronômetro da sessão em andamento: "7:05" ou "1:02:09". Nulo se faltar o início, se for do futuro ou passar de 24 h (provável esquecimento). */
export function elapsedText(startedAt: string | Date | null | undefined, nowMs: number): string | null {
  if (!startedAt) return null;
  const sec = Math.floor((nowMs - new Date(startedAt).getTime()) / 1000);
  if (!Number.isFinite(sec) || sec < 0 || sec > 24 * 3600) return null;
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), r = sec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

/** Janela em que a tela ainda mostra "Parabéns, treino concluído" depois de concluir; passada ela, volta ao modo visualização. */
export const FRESH_FINISH_MS = 6 * 3600 * 1000;
export function isFreshFinish(finishedAt: string | Date | null | undefined, nowMs: number): boolean {
  if (!finishedAt) return false;
  const age = nowMs - new Date(finishedAt).getTime();
  return Number.isFinite(age) && age >= -60_000 && age <= FRESH_FINISH_MS;
}
