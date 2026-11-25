// Entrega 3: evolução, aderência e "último treino".
import { z } from "zod";
import { computeAdherence, computeEvolution, type PerformedSet } from "../lib/evolution";
import type { Db } from "./db";
import { assertStudent, loadVersion, requirePerm, versionDetail } from "./handlers";
import { json, notFound, requireActor, route } from "./http";

interface Row { log_id: string; at: Date; finished_at: Date | null; exercise_id: string; exercise_name: string; reps: number | null; load_kg: number | null; rir: number | null }
type Performed = PerformedSet & { rir: number | null };

/** Séries de TRABALHO realizadas pelo aluno: prescritas, extras de exercício prescrito e de exercício extra.
 *  O exercício considerado é o efetivamente executado (substituição vale). */
async function performedSets(db: Db, studentId: string): Promise<Performed[]> {
  const cols = "l.id as log_id, l.started_at as at, l.finished_at, e.id as exercise_id, e.name as exercise_name, ls.reps, ls.load_kg, ls.rir";
  const { rows } = await db.query<Row>(
    `select ${cols} from logged_sets ls
       join workout_logs l on l.id = ls.log_id
       join version_sets vs on vs.id = ls.version_set_id
       join version_exercises ve on ve.id = vs.version_exercise_id
       left join log_substitutions sub on sub.log_id = l.id and sub.version_exercise_id = ve.id
       join exercises e on e.id = coalesce(sub.exercise_id, ve.exercise_id)
      where l.student_id = $1 and vs.set_type = 'work'
     union all
     select ${cols} from logged_sets ls
       join workout_logs l on l.id = ls.log_id
       join version_exercises ve on ve.id = ls.version_exercise_id
       left join log_substitutions sub on sub.log_id = l.id and sub.version_exercise_id = ve.id
       join exercises e on e.id = coalesce(sub.exercise_id, ve.exercise_id)
      where l.student_id = $1 and ls.version_set_id is null and ls.extra_exercise_id is null
     union all
     select ${cols} from logged_sets ls
       join workout_logs l on l.id = ls.log_id
       join log_extra_exercises x on x.id = ls.extra_exercise_id
       join exercises e on e.id = x.exercise_id
      where l.student_id = $1`,
    [studentId],
  );
  return rows.map((r) => ({
    logId: r.log_id, at: new Date(r.at).toISOString(), finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : null,
    exerciseId: r.exercise_id, exerciseName: r.exercise_name, reps: r.reps, loadKg: r.load_kg, rir: r.rir,
  }));
}

async function buildEvolution(db: Db, studentId: string) {
  const sets = await performedSets(db, studentId);
  const exercises = computeEvolution(sets);

  const fin = await db.query<{ n: number; with_freq: number }>(
    `select count(*)::int as n,
            (count(*) filter (where p.weekly_frequency is not null))::int as with_freq
       from workout_logs l
       join program_versions pv on pv.id = l.version_id
       join programs p on p.id = pv.program_id
      where l.student_id = $1 and l.finished_at is not null`, [studentId]);
  const comp = await db.query<{ done: number; total: number }>(
    `select coalesce(sum((select count(*) from logged_sets ls where ls.log_id = l.id and ls.version_set_id is not null)), 0)::int as done,
            coalesce(sum((select count(*) from version_sets vs join version_exercises ve on ve.id = vs.version_exercise_id
                           where ve.version_id = l.version_id)), 0)::int as total
       from workout_logs l where l.student_id = $1 and l.finished_at is not null`, [studentId]);
  const progs = await db.query<{ weekly_frequency: number | null; since: Date }>(
    `select p.weekly_frequency, min(pv.published_at) as since
       from programs p join program_versions pv on pv.program_id = p.id
      where p.student_id = $1 and pv.status = 'published' group by p.id, p.weekly_frequency`, [studentId]);

  const adh = computeAdherence({
    finishedSessions: fin.rows[0].with_freq, prescribedDone: comp.rows[0].done, prescribedTotal: comp.rows[0].total,
    programs: progs.rows.map((p) => ({ weeklyFrequency: p.weekly_frequency, since: new Date(p.since).toISOString() })), now: new Date(),
  });
  return {
    exercises,
    summary: {
      ...adh,
      sessionsCompleted: fin.rows[0].n, // todas as sessões concluídas; a aderência usa só as de programas com frequência
      records: exercises.reduce((n, e) => n + e.records, 0),
      note: "Evolução de carga isolada não representa necessariamente hipertrofia.",
    },
  };
}

export const getStudentEvolution = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  if (!z.string().uuid().safeParse(ctx.params.id).success) notFound();
  await assertStudent(ctx.db, a, ctx.params.id);
  return json(await buildEvolution(ctx.db, ctx.params.id));
});

/** O aluno vê a própria evolução se o personal liberou "Consultar treinos anteriores". */
export const getMyEvolution = route(async (ctx) => {
  const a = await requireActor(ctx, "student");
  await requirePerm(ctx.db, a, "viewHistory");
  return json(await buildEvolution(ctx.db, a.userId));
});

/** Último desempenho do aluno em cada exercício deste treino (sessões concluídas), exibido durante o registro. */
export const getLastTraining = route(async (ctx) => {
  const a = await requireActor(ctx, "student");
  const v = await loadVersion(ctx.db, a, ctx.params.id);
  const detail = await versionDetail(ctx.db, v);
  const sets = (await performedSets(ctx.db, a.userId)).filter((s) => s.finishedAt);
  const out: Record<string, { date: string; sets: { reps: number | null; loadKg: number | null; rir: number | null }[]; best: { reps: number | null; loadKg: number | null } | null }> = {};
  for (const e of detail.exercises) {
    const mine = sets.filter((s) => s.exerciseId === e.exerciseId);
    if (mine.length === 0) continue;
    const lastLog = mine.reduce((m, s) => (s.at > m.at ? s : m)).logId;
    const group = mine.filter((s) => s.logId === lastLog);
    const best = group.reduce<(typeof group)[number] | null>((m, s) => (s.loadKg != null && (!m || (m.loadKg ?? 0) < s.loadKg) ? s : m), null);
    out[e.id] = {
      date: group[0].at,
      sets: group.map((s) => ({ reps: s.reps, loadKg: s.loadKg, rir: s.rir })),
      best: best ? { reps: best.reps, loadKg: best.loadKg } : null,
    };
  }
  return json(out);
});
