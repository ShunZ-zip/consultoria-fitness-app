// Evolução do aluno (regras puras, usadas no servidor e testáveis sem banco).
// Convenções PROPOSTAS (o documento deixa os critérios para validação):
//  - só séries de TRABALHO entram (aquecimento e preparação ficam de fora);
//  - 1RM estimada pela fórmula de Epley: carga × (1 + reps/30), válida de 1 a 12 repetições;
//  - recorde pessoal = série que supera a melhor 1RM estimada anterior do exercício;
//  - evolução de carga isolada NÃO mede hipertrofia.
export interface PerformedSet {
  logId: string; at: string; finishedAt: string | null;
  exerciseId: string; exerciseName: string;
  reps: number | null; loadKg: number | null;
}

export const MAX_E1RM_REPS = 12;

export function estimate1RM(loadKg: number | null, reps: number | null): number | null {
  if (loadKg == null || reps == null || loadKg <= 0 || reps < 1 || reps > MAX_E1RM_REPS) return null;
  const v = reps === 1 ? loadKg : loadKg * (1 + reps / 30);
  return Math.round(v * 10) / 10;
}

export interface EvolutionPoint { date: string; logId: string; topLoad: number | null; bestE1rm: number | null; volumeLoad: number; sets: number; isRecord: boolean }
export interface ExerciseEvolution {
  exerciseId: string; name: string; points: EvolutionPoint[];
  heaviest: { loadKg: number; reps: number | null; date: string } | null;
  bestE1rm: { value: number; date: string } | null;
  records: number;
  change: { loadKg: number | null; e1rm: number | null }; // último ponto − primeiro ponto
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function computeEvolution(sets: PerformedSet[]): ExerciseEvolution[] {
  const byEx = new Map<string, PerformedSet[]>();
  for (const s of sets) {
    if (s.reps == null && s.loadKg == null) continue;
    const arr = byEx.get(s.exerciseId) ?? [];
    arr.push(s); byEx.set(s.exerciseId, arr);
  }
  const out: ExerciseEvolution[] = [];
  for (const [exerciseId, list] of byEx) {
    const byLog = new Map<string, PerformedSet[]>();
    for (const s of list) (byLog.get(s.logId) ?? byLog.set(s.logId, []).get(s.logId)!).push(s);
    const logs = [...byLog.values()].sort((a, b) => a[0].at.localeCompare(b[0].at));

    let bestSoFar = 0; let records = 0;
    let heaviest: ExerciseEvolution["heaviest"] = null;
    let bestE1rm: ExerciseEvolution["bestE1rm"] = null;
    const points: EvolutionPoint[] = [];
    for (const group of logs) {
      let top: number | null = null; let best: number | null = null; let volume = 0;
      let sessionBest = 0;
      for (const s of group) {
        if (s.loadKg != null && (top == null || s.loadKg > top)) top = s.loadKg;
        if (s.loadKg != null && s.reps != null) volume += s.loadKg * s.reps;
        const e = estimate1RM(s.loadKg, s.reps);
        if (e != null && (best == null || e > best)) best = e;
        if (e != null && e > sessionBest) sessionBest = e;
        if (s.loadKg != null && s.loadKg > 0 && (!heaviest || s.loadKg > heaviest.loadKg)) heaviest = { loadKg: s.loadKg, reps: s.reps, date: s.at };
        if (e != null && (!bestE1rm || e > bestE1rm.value)) bestE1rm = { value: e, date: s.at };
      }
      // Um recorde por sessão (a melhor série da sessão supera o melhor anterior).
      let isRecord = false;
      if (sessionBest > bestSoFar) { if (bestSoFar > 0) { records += 1; isRecord = true; } bestSoFar = sessionBest; }
      points.push({ date: group[0].at, logId: group[0].logId, topLoad: top, bestE1rm: best, volumeLoad: Math.round(volume), sets: group.length, isRecord });
    }
    const first = points[0], last = points.at(-1)!;
    out.push({
      exerciseId, name: list[0].exerciseName, points, heaviest, bestE1rm, records,
      change: {
        loadKg: first.topLoad != null && last.topLoad != null ? round1(last.topLoad - first.topLoad) : null,
        e1rm: first.bestE1rm != null && last.bestE1rm != null ? round1(last.bestE1rm - first.bestE1rm) : null,
      },
    });
  }
  return out.sort((a, b) => b.points.length - a.points.length || a.name.localeCompare(b.name, "pt-BR"));
}

export interface AdherenceInput {
  finishedSessions: number;
  /** Séries prescritas concluídas e prescritas nas sessões concluídas. */
  prescribedDone: number; prescribedTotal: number;
  /** Programas com frequência semanal definida: sessões previstas = frequência × semanas ativas. */
  programs: { weeklyFrequency: number | null; since: string }[];
  now: Date;
}
export interface Adherence {
  sessionsCompleted: number; sessionsPlanned: number | null; adherencePct: number | null; completionPct: number | null;
}

export function computeAdherence(i: AdherenceInput): Adherence {
  let planned = 0; let any = false;
  for (const p of i.programs) {
    if (!p.weeklyFrequency) continue;
    any = true;
    const weeks = Math.max(1, Math.ceil((i.now.getTime() - new Date(p.since).getTime()) / (7 * 86400000)));
    planned += p.weeklyFrequency * weeks;
  }
  return {
    sessionsCompleted: i.finishedSessions,
    sessionsPlanned: any ? planned : null,
    adherencePct: any && planned > 0 ? Math.min(100, Math.round((i.finishedSessions / planned) * 100)) : null,
    completionPct: i.prescribedTotal > 0 ? Math.round((i.prescribedDone / i.prescribedTotal) * 100) : null,
  };
}
