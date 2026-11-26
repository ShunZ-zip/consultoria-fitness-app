// Organização do personal (quadro kanban). NÃO é agenda: o prazo é só uma data opcional em texto (AAAA-MM-DD).
export const TASK_STATUSES = ["todo", "in-progress", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const STATUS_LABEL: Record<TaskStatus, string> = { todo: "A fazer", "in-progress": "Em andamento", done: "Concluído" };
export const TASK_TAGS = ["Treino", "Avaliação", "Check-in", "Financeiro", "Conversa", "Outro"] as const;
export type TaskTag = (typeof TASK_TAGS)[number];

export interface Task { id: string; title: string; tag: TaskTag; status: TaskStatus; studentId: string | null; studentName: string | null; dueDate: string | null; position: number }

/** Move um cartão para uma coluna/posição e devolve as posições de TODAS as colunas afetadas (0, 1, 2…). */
export function planMove(tasks: Pick<Task, "id" | "status" | "position">[], id: string, to: TaskStatus, index: number): { id: string; status: TaskStatus; position: number }[] {
  const moving = tasks.find((t) => t.id === id);
  if (!moving) return [];
  const column = (s: TaskStatus) => tasks.filter((t) => t.status === s && t.id !== id).sort((a, b) => a.position - b.position).map((t) => t.id);
  const out: { id: string; status: TaskStatus; position: number }[] = [];
  const dest = column(to);
  dest.splice(Math.max(0, Math.min(index, dest.length)), 0, id);
  dest.forEach((tid, i) => out.push({ id: tid, status: to, position: i }));
  if (moving.status !== to) column(moving.status).forEach((tid, i) => out.push({ id: tid, status: moving.status, position: i }));
  return out;
}

/** Coluna vizinha (← →) ou null nas pontas. */
export function neighbor(status: TaskStatus, dir: -1 | 1): TaskStatus | null {
  const i = TASK_STATUSES.indexOf(status) + dir;
  return i < 0 || i >= TASK_STATUSES.length ? null : TASK_STATUSES[i];
}

export interface Suggestion { key: string; title: string; tag: TaskTag; studentId: string | null; studentName: string | null; reason: string }
