// Rotina: agrupa os treinos de um aluno e guarda metadados (objetivo, nível, orientações, período, visibilidade).
// NÃO é agenda: início e fim são só datas do período da rotina (texto AAAA-MM-DD), sem horários nem reservas.
// A prescrição publicada continua imutável; a rotina só decide COMO os treinos aparecem para o aluno.
// Objetivos e níveis são PROPOSTAS (listas curtas); ajuste aqui.
export const GOALS = ["Hipertrofia", "Força", "Treinamento híbrido", "Redução de gordura", "Prevenção e retorno", "Saúde e bem-estar"] as const;
export const LEVELS = ["Iniciante", "Intermediário", "Avançado"] as const;
export type Goal = (typeof GOALS)[number];
export type Level = (typeof LEVELS)[number];

export type RoutineStatus = "active" | "archived" | "deleted";
export type Visibility = "always" | "from_start";
export const VISIBILITY_LABEL: Record<Visibility, string> = { always: "Sempre", from_start: "Só a partir da data de início" };

export interface RoutineRule { status: RoutineStatus; startsOn: string | null; endsOn: string | null; visibility: Visibility; autoArchive: boolean }

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const isDateKey = (s: unknown): s is string => typeof s === "string" && DATE.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z")) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;

/** Mensagem de erro (pt-BR) ou nulo. O fim não pode ser antes do início; "só a partir do início" exige data de início. */
export function validateRoutine(r: { startsOn: string | null; endsOn: string | null; visibility: Visibility; autoArchive: boolean }): string | null {
  if (r.startsOn && !isDateKey(r.startsOn)) return "Data de início inválida";
  if (r.endsOn && !isDateKey(r.endsOn)) return "Data de fim inválida";
  if (r.startsOn && r.endsOn && r.endsOn < r.startsOn) return "O fim não pode ser antes do início";
  if (r.visibility === "from_start" && !r.startsOn) return "Para mostrar só a partir do início, informe a data de início";
  if (r.autoArchive && !r.endsOn) return "Para arquivar ao vencer, informe a data de fim";
  return null;
}

/** Estado efetivo: uma rotina ativa que venceu e tem "arquivar ao vencer" já conta como arquivada (sem tarefa agendada). */
export function effectiveStatus(r: RoutineRule, today: string): RoutineStatus {
  if (r.status === "active" && r.autoArchive && r.endsOn && r.endsOn < today) return "archived";
  return r.status;
}

export type HiddenReason = "archived" | "deleted" | "not_started" | null;
/** Por que o aluno NÃO vê a rotina agora (nulo = vê). */
export function hiddenReason(r: RoutineRule, today: string): HiddenReason {
  const st = effectiveStatus(r, today);
  if (st === "deleted") return "deleted";
  if (st === "archived") return "archived";
  if (r.visibility === "from_start" && r.startsOn && r.startsOn > today) return "not_started";
  return null;
}
export const visibleToStudent = (r: RoutineRule, today: string) => hiddenReason(r, today) === null;

export const HIDDEN_TEXT: Record<Exclude<HiddenReason, null>, string> = {
  archived: "O aluno não vê (arquivada)", deleted: "O aluno não vê (excluída)", not_started: "O aluno ainda não vê (começa em breve)",
};

const br = (k: string) => { const [y, m, d] = k.split("-"); return `${d}/${m}/${y}`; };
/** "03/06/2026 a 03/07/2026", "a partir de 03/06/2026", "até 03/07/2026" ou "Sem período". */
export function periodText(startsOn: string | null, endsOn: string | null): string {
  if (startsOn && endsOn) return `${br(startsOn)} a ${br(endsOn)}`;
  if (startsOn) return `a partir de ${br(startsOn)}`;
  if (endsOn) return `até ${br(endsOn)}`;
  return "Sem período";
}

/** "Hipertrofia · Intermediário" (só o que existir). */
export const subtitle = (goal: string | null, level: string | null) => [goal, level].filter(Boolean).join(" · ");
