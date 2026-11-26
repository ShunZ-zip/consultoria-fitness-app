// IA assistiva (opção B) POR REGRAS DETERMINÍSTICAS, sem provedor externo (decisão pendente com o usuário).
// Princípios: nunca inventar (sem dados suficientes, diz o que falta); toda sugestão traz evidências e justificativa;
// a prescrição só muda quando o personal aprova (a aprovação cria um RASCUNHO, nunca altera versão publicada).
// Aviso fixo: evolução de carga isolada não mede hipertrofia.
//
// PONTO DE EXTENSÃO: `analyze(input)` recebe só dados agregados (sem nome, e-mail ou texto livre do aluno). Um provedor de IA
// externo, se um dia for escolhido, poderia receber exatamente este `AnalysisInput` e devolver `SuggestionDraft[]`; a decisão
// continua sendo do personal. Hoje nada sai do servidor.
import { estimate1RM } from "./evolution";
import type { MuscleVolume } from "./volume";

export const MIN_SESSIONS = 3;           // sessões concluídas na versão atual para qualquer sugestão
export const LOAD_STEP_KG = 2.5;         // passo proposto de aumento de carga
export const DISCLAIMER = "Sugestão automática por regras: você decide. Evolução de carga isolada não representa necessariamente hipertrofia.";

export type SuggestionKind = "load_review" | "volume_review" | "never_logged" | "off_prescription" | "volume_imbalance";
export const KIND_LABEL: Record<SuggestionKind, string> = {
  load_review: "Revisar carga", volume_review: "Revisar volume", never_logged: "Exercício nunca registrado",
  off_prescription: "Realizado fora da prescrição", volume_imbalance: "Volume desbalanceado",
};

export interface SetObs {
  reps: number | null; loadKg: number | null; rir: number | null;
  targetReps: number | null; targetRepsMax: number | null; targetRir: number | null; targetLoadKg: number | null;
}
export interface SessionObs { logId: string; date: string; sets: SetObs[] }
export interface ExerciseObs { exerciseId: string; name: string; prescribedWorkSets: number; sessions: SessionObs[] } // sessões em ordem cronológica
export interface CheckinObs { date: string; flags: { id: string; level: string; reason: string }[] }
export interface AnalysisInput { finishedSessions: number; exercises: ExerciseObs[]; checkins: CheckinObs[]; muscles: MuscleVolume[] }

export type Proposal =
  | { type: "increase_load"; exerciseId: string; exerciseName: string; deltaKg: number }
  | { type: "remove_work_set"; exerciseId: string; exerciseName: string };
export interface Evidence { headers: string[]; rows: string[][]; notes?: string[] }
export interface SuggestionDraft { kind: SuggestionKind; dedupeKey: string; exerciseId: string | null; title: string; rationale: string; evidence: Evidence; proposal: Proposal | null }
export interface AnalysisResult { suggestions: SuggestionDraft[]; insufficient: { have: number; need: number; message: string } | null; disclaimer: string }

const fmtDate = (iso: string) => { const d = new Date(iso); return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
const n = (v: number | null) => (v == null ? "—" : String(v).replace(".", ","));
const top = (s: SetObs) => s.targetRepsMax ?? s.targetReps;

/** 1RM estimada (Epley) da melhor série da sessão; null se não houver série válida. */
export function sessionE1rm(s: SessionObs): number | null {
  const v = s.sets.map((x) => estimate1RM(x.loadKg, x.reps)).filter((x): x is number => x != null);
  return v.length ? Math.max(...v) : null;
}

/** Aplica a proposta a uma cópia dos itens do treino. Só mexe no exercício da proposta. */
export function applyProposal<T extends { exerciseId: string; sets: { setType?: string; loadKg?: number | null; loadPct?: number | null }[] }>(items: T[], p: Proposal): T[] {
  return items.map((it) => {
    if (it.exerciseId !== p.exerciseId) return it;
    if (p.type === "increase_load") {
      return { ...it, sets: it.sets.map((s) => ((s.setType ?? "work") === "work" && s.loadKg != null ? { ...s, loadKg: Math.round((s.loadKg + p.deltaKg) * 100) / 100 } : s)) };
    }
    const idx = it.sets.map((s, i) => ((s.setType ?? "work") === "work" ? i : -1)).filter((i) => i >= 0);
    if (idx.length < 2) return it; // nunca zera os exercícios
    return { ...it, sets: it.sets.filter((_, i) => i !== idx[idx.length - 1]) };
  });
}

export function analyze(input: AnalysisInput, minSessions = MIN_SESSIONS): AnalysisResult {
  if (input.finishedSessions < minSessions) {
    return {
      suggestions: [], disclaimer: DISCLAIMER,
      insufficient: {
        have: input.finishedSessions, need: minSessions,
        message: `Dados insuficientes: há ${input.finishedSessions} sessão(ões) concluída(s) na versão atual do treino e são necessárias ${minSessions} para sugerir ajustes. Nada foi inferido.`,
      },
    };
  }
  const out: SuggestionDraft[] = [];

  for (const ex of input.exercises) {
    const last = ex.sessions.slice(-minSessions);

    // 1) Revisar carga: todas as séries de trabalho no topo da faixa, com RIR registrado e >= meta, por N sessões seguidas.
    if (last.length === minSessions) {
      const ok = last.every((s) => s.sets.length > 0 && s.sets.every((x) => top(x) != null && x.reps != null && x.reps >= top(x)! && x.rir != null && x.targetRir != null && x.rir >= x.targetRir));
      if (ok) {
        const hasKg = last[last.length - 1].sets.some((x) => x.targetLoadKg != null);
        out.push({
          kind: "load_review", dedupeKey: ex.exerciseId, exerciseId: ex.exerciseId,
          title: `${ex.name}: avaliar aumento de carga`,
          rationale: `Nas últimas ${minSessions} sessões, todas as séries de trabalho de ${ex.name} chegaram ao topo da faixa de repetições com RIR igual ou acima da meta. Isso indica folga para progredir${hasKg ? `; a proposta é +${n(LOAD_STEP_KG)} kg nas séries de trabalho` : " (a carga está prescrita em %, então a mudança precisa ser feita manualmente)"}.`,
          evidence: {
            headers: ["Data", "Repetições", "Carga (kg)", "RIR", "Meta de reps", "Meta de RIR"],
            rows: last.map((s) => [fmtDate(s.date), s.sets.map((x) => n(x.reps)).join(" / "), s.sets.map((x) => n(x.loadKg)).join(" / "), s.sets.map((x) => n(x.rir)).join(" / "), s.sets.map((x) => n(top(x))).join(" / "), s.sets.map((x) => n(x.targetRir)).join(" / ")]),
          },
          proposal: hasKg ? { type: "increase_load", exerciseId: ex.exerciseId, exerciseName: ex.name, deltaKg: LOAD_STEP_KG } : null,
        });
      }
    }

    // 2) Revisar volume: 1RM estimada caindo por 3 sessões seguidas (2 quedas) + check-in recente com fadiga alta ou dor.
    if (last.length === minSessions) {
      const e = last.map(sessionE1rm);
      const falling = e.every((x) => x != null) && e[0]! > e[1]! && e[1]! > e[2]!;
      const signals = input.checkins.flatMap((c) => c.flags.filter((f) => f.id === "fadiga" || f.id === "dor").map((f) => ({ date: c.date, reason: f.reason })));
      if (falling && signals.length > 0) {
        const canRemove = ex.prescribedWorkSets >= 2;
        out.push({
          kind: "volume_review", dedupeKey: ex.exerciseId, exerciseId: ex.exerciseId,
          title: `${ex.name}: desempenho caindo com sinais de fadiga/dor`,
          rationale: `A 1RM estimada de ${ex.name} caiu em duas sessões seguidas (${e.map((x) => n(x)).join(" → ")} kg) e há check-in recente com fadiga alta ou dor. Vale rever o volume${canRemove ? "; a proposta é retirar a última série de trabalho deste exercício" : ""}. Queda isolada não é conclusão: considere sono, estresse e a própria técnica.`,
          evidence: {
            headers: ["Data", "1RM estimada (kg)"], rows: last.map((s, i) => [fmtDate(s.date), n(e[i])]),
            notes: signals.slice(0, 3).map((s) => `Check-in de ${fmtDate(s.date)}: ${s.reason}`),
          },
          proposal: canRemove ? { type: "remove_work_set", exerciseId: ex.exerciseId, exerciseName: ex.name } : null,
        });
      }
    }

    // 3) Prescrito nunca registrado (depois de N sessões concluídas no treino).
    if (ex.sessions.length === 0 && ex.prescribedWorkSets > 0) {
      out.push({
        kind: "never_logged", dedupeKey: ex.exerciseId, exerciseId: ex.exerciseId,
        title: `${ex.name}: prescrito, mas nunca registrado`,
        rationale: `${ex.name} está no treino atual, mas nenhuma de suas séries foi registrada em ${input.finishedSessions} sessões concluídas. Pode ser esquecimento, falta de equipamento ou um exercício que o aluno evita; vale conversar.`,
        evidence: { headers: ["Sessões concluídas na versão", "Séries registradas deste exercício"], rows: [[String(input.finishedSessions), "0"]] },
        proposal: null,
      });
    }

    // 4) Realizado muito abaixo da prescrição (reps < 70% da meta) por N sessões seguidas.
    if (last.length === minSessions) {
      const ratio = last.map((s) => { const r = s.sets.filter((x) => x.reps != null && x.targetReps != null && x.targetReps > 0).map((x) => x.reps! / x.targetReps!); return r.length ? r.reduce((a, b) => a + b, 0) / r.length : null; });
      if (ratio.every((r) => r != null && r < 0.7)) {
        out.push({
          kind: "off_prescription", dedupeKey: ex.exerciseId, exerciseId: ex.exerciseId,
          title: `${ex.name}: realizado bem abaixo do prescrito`,
          rationale: `Nas últimas ${minSessions} sessões, as repetições realizadas de ${ex.name} ficaram abaixo de 70% da meta. A carga pode estar alta demais ou a meta pode não estar clara para o aluno.`,
          evidence: { headers: ["Data", "Repetições", "Meta de reps", "Realizado / meta"], rows: last.map((s, i) => [fmtDate(s.date), s.sets.map((x) => n(x.reps)).join(" / "), s.sets.map((x) => n(x.targetReps)).join(" / "), `${Math.round(ratio[i]! * 100)}%`]) },
          proposal: null,
        });
      }
    }
  }

  // 5) Volume por músculo muito desbalanceado (monitoramento, não prescrição).
  const active = input.muscles.filter((m) => m.weighted > 0);
  if (active.length >= 3) {
    const max = active.reduce((a, b) => (b.weighted > a.weighted ? b : a)), min = active.reduce((a, b) => (b.weighted < a.weighted ? b : a));
    if (max.weighted / min.weighted >= 4) {
      out.push({
        kind: "volume_imbalance", dedupeKey: "global", exerciseId: null,
        title: `Volume desbalanceado: ${max.muscle} × ${min.muscle}`,
        rationale: `${max.muscle} tem ${n(max.weighted)} séries ponderadas e ${min.muscle} tem ${n(min.weighted)} (4× ou mais). Isso pode ser intencional; é só um sinal para conferir a distribuição do treino.`,
        evidence: { headers: ["Músculo", "Diretas", "Indiretas", "Ponderado"], rows: [max, min].map((m) => [m.muscle, n(m.direct), n(m.indirect), n(m.weighted)]) },
        proposal: null,
      });
    }
  }

  return { suggestions: out, insufficient: null, disclaimer: DISCLAIMER };
}
