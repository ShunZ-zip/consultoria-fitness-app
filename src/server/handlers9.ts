// Caixa de feedbacks do personal: sessões concluídas pelos alunos da consultoria, com triagem aberto/resolvido.
// Escopo SEMPRE pela consultoria do personal (programa da versão). Aluno não acessa (403); item de outra consultoria = 404.
// O estado "resolvido" é interno do personal (não aparece para o aluno em nenhuma rota).
import { z } from "zod";
import { completionPct, durationMinutes, effortLabel, type FeedbackItem } from "../lib/feedback";
import { audit } from "./handlers";
import { body, json, notFound, requireActor, route } from "./http";

const uuid = z.string().uuid();
const MAX_ITEMS = 200;

interface Row {
  id: string; student_id: string; student_name: string; version_id: string; workout_name: string;
  started_at: string; finished_at: string; effort: number | null; note: string | null; feedback_resolved_at: string | null;
  sets_done: number; sets_prescribed: number; avg_rir: number | null;
}

const toItem = (r: Row): FeedbackItem => ({
  id: r.id, studentId: r.student_id, studentName: r.student_name, versionId: r.version_id, workoutName: r.workout_name,
  startedAt: r.started_at, finishedAt: r.finished_at, durationMin: durationMinutes(r.started_at, r.finished_at),
  effort: r.effort, effortLabel: effortLabel(r.effort), note: r.note,
  setsDone: r.sets_done, setsPrescribed: r.sets_prescribed, completionPct: completionPct(r.sets_done, r.sets_prescribed),
  avgRir: r.avg_rir, resolved: r.feedback_resolved_at != null, resolvedAt: r.feedback_resolved_at,
});

export const listFeedbacks = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const status = ctx.url.searchParams.get("status") === "resolved" ? "resolved" : "open";
  const { rows } = await ctx.db.query<Row>(
    `select l.id, l.student_id, u.name as student_name, l.version_id, p.name as workout_name,
            l.started_at, l.finished_at, l.effort, l.note, l.feedback_resolved_at,
            (select count(*)::int from logged_sets ls where ls.log_id = l.id and ls.version_set_id is not null) as sets_done,
            (select count(*)::int from version_sets vs join version_exercises ve on ve.id = vs.version_exercise_id where ve.version_id = l.version_id) as sets_prescribed,
            (select round(avg(ls.rir)::numeric, 1)::float8 from logged_sets ls where ls.log_id = l.id and ls.rir is not null) as avg_rir
       from workout_logs l
       join program_versions v on v.id = l.version_id
       join programs p on p.id = v.program_id
       join users u on u.id = l.student_id
      where p.consultancy_id = $1 and l.finished_at is not null
        and (l.feedback_resolved_at is not null) = ($2 = 'resolved')
      order by l.finished_at desc limit ${MAX_ITEMS}`,
    [a.consultancyId, status]);
  return json({ items: rows.map(toItem), counts: await counts(ctx.db, a.consultancyId), limit: MAX_ITEMS });
});

async function counts(db: { query: <T = any>(sql: string, p?: unknown[]) => Promise<{ rows: T[] }> }, consultancyId: string) {
  const r = (await db.query<{ open: number; resolved: number }>(
    `select count(*) filter (where l.feedback_resolved_at is null)::int as open,
            count(*) filter (where l.feedback_resolved_at is not null)::int as resolved
       from workout_logs l join program_versions v on v.id = l.version_id join programs p on p.id = v.program_id
      where p.consultancy_id = $1 and l.finished_at is not null`, [consultancyId])).rows[0];
  return { open: r?.open ?? 0, resolved: r?.resolved ?? 0 };
}

/** Só o contador de abertos (selo da navegação). */
export const feedbackCount = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  return json({ open: (await counts(ctx.db, a.consultancyId)).open });
});

/** Resolve ou reabre UM feedback. */
export const resolveFeedback = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  if (!uuid.safeParse(ctx.params.id).success) notFound();
  const input = await body(ctx, z.object({ resolved: z.boolean() }));
  const r = await ctx.db.query(
    `update workout_logs l set feedback_resolved_at = case when $3 then now() else null end,
            feedback_resolved_by = case when $3 then $4::uuid else null end
      from program_versions v join programs p on p.id = v.program_id
      where l.id = $1 and l.version_id = v.id and p.consultancy_id = $2 and l.finished_at is not null returning l.id`,
    [ctx.params.id, a.consultancyId, input.resolved, a.userId]);
  if (!r.rows.length) notFound();
  await audit(ctx.db, a, input.resolved ? "feedback.resolve" : "feedback.reopen", { logId: ctx.params.id });
  return json({ id: ctx.params.id, resolved: input.resolved });
});

/** Resolve (ou reabre) vários de uma vez; só valem os ids da própria consultoria, os demais são ignorados. */
export const resolveFeedbacks = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const input = await body(ctx, z.object({ ids: z.array(uuid).min(1).max(MAX_ITEMS), resolved: z.boolean().default(true) }));
  const r = await ctx.db.query<{ id: string }>(
    `update workout_logs l set feedback_resolved_at = case when $3 then now() else null end,
            feedback_resolved_by = case when $3 then $4::uuid else null end
      from program_versions v join programs p on p.id = v.program_id
      where l.id = any($1::uuid[]) and l.version_id = v.id and p.consultancy_id = $2 and l.finished_at is not null
        and (l.feedback_resolved_at is not null) <> $3 returning l.id`,
    [input.ids, a.consultancyId, input.resolved, a.userId]);
  if (r.rows.length) await audit(ctx.db, a, input.resolved ? "feedback.resolve_many" : "feedback.reopen_many", { count: r.rows.length });
  return json({ changed: r.rows.length });
});
