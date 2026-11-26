// Frequência semanal e engajamento: o aluno vê o próprio; o personal vê o de qualquer aluno da SUA consultoria (outra = 404).
import { buildWeek, computeEngagement, DEFAULT_TZ_OFFSET_MIN } from "../lib/engagement";
import type { Db } from "./db";
import { assertStudent } from "./handlers";
import { json, notFound, requireActor, route } from "./http";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fuso do navegador (minutos a leste do UTC) vindo de ?tz=; só valores plausíveis, senão Brasília. */
function tzFrom(url: URL): number {
  const n = Number(url.searchParams.get("tz"));
  return Number.isInteger(n) && n >= -720 && n <= 840 ? n : DEFAULT_TZ_OFFSET_MIN;
}

async function payload(db: Db, consultancyId: string, studentId: string, tz: number) {
  const logs = (await db.query<{ finished_at: string }>(
    `select l.finished_at from workout_logs l
       join program_versions v on v.id = l.version_id join programs p on p.id = v.program_id
      where l.student_id = $1 and p.consultancy_id = $2 and l.finished_at is not null
      order by l.finished_at desc limit 400`, [studentId, consultancyId])).rows.map((r) => r.finished_at);
  const planned = (await db.query<{ weekly_frequency: number | null }>(
    `select p.weekly_frequency from programs p join program_versions v on v.program_id = p.id
      where p.student_id = $1 and p.consultancy_id = $2 and v.status = 'published'
      order by v.published_at desc limit 1`, [studentId, consultancyId])).rows[0]?.weekly_frequency ?? null;
  const now = new Date();
  return { week: buildWeek(logs, now, tz), ...computeEngagement(logs, now, planned, tz) };
}

export const myEngagement = route(async (ctx) => {
  const a = await requireActor(ctx, "student");
  return json(await payload(ctx.db, a.consultancyId, a.userId, tzFrom(ctx.url)));
});

export const studentEngagement = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  if (!UUID.test(ctx.params.id)) notFound();   // id malformado = inexistente (sem chegar ao banco)
  await assertStudent(ctx.db, a, ctx.params.id);
  return json(await payload(ctx.db, a.consultancyId, ctx.params.id, tzFrom(ctx.url)));
});
