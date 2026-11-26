// Rotinas (agrupam treinos do aluno, com metadados). Personal: só da própria consultoria e dos próprios alunos (outra = 404).
// Aluno: só lê as rotinas que pode ver agora. "Excluir" apenas oculta; treinos, versões e registros ficam intactos.
import { z } from "zod";
import { dayKey } from "../lib/engagement";
import { GOALS, hiddenReason, HIDDEN_TEXT, effectiveStatus, LEVELS, validateRoutine, visibleToStudent, type RoutineRule } from "../lib/routine";
import { uid } from "./auth";
import type { Actor } from "./auth";
import type { Db } from "./db";
import { assertRoutineFor, assertStudent, audit, loadVersion } from "./handlers";
import { body, HttpError, json, notFound, requireActor, route } from "./http";

const uuid = z.string().uuid();

const routineInput = z.object({
  name: z.string().trim().min(1, "Informe o nome da rotina").max(80),
  goal: z.enum(GOALS).nullish(),
  level: z.enum(LEVELS).nullish(),
  notes: z.string().trim().max(2000).nullish(),
  startsOn: z.string().nullish(), endsOn: z.string().nullish(),
  visibility: z.enum(["always", "from_start"]).default("always"),
  autoArchive: z.boolean().default(false),
  showTime: z.boolean().default(true),
});

interface Row {
  id: string; student_id: string; name: string; goal: string | null; level: string | null; notes: string | null;
  starts_on: string | null; ends_on: string | null; visibility: "always" | "from_start"; auto_archive: boolean; show_time: boolean;
  status: "active" | "archived" | "deleted"; created_at: string; workouts?: number;
}
const COLS = "r.id, r.student_id, r.name, r.goal, r.level, r.notes, r.starts_on, r.ends_on, r.visibility, r.auto_archive, r.show_time, r.status, r.created_at";
const rule = (r: Row): RoutineRule => ({ status: r.status, startsOn: r.starts_on, endsOn: r.ends_on, visibility: r.visibility, autoArchive: r.auto_archive });
const today = () => dayKey(new Date());

function out(r: Row) {
  const t = today(); const why = hiddenReason(rule(r), t);
  return {
    id: r.id, studentId: r.student_id, name: r.name, goal: r.goal, level: r.level, notes: r.notes,
    startsOn: r.starts_on, endsOn: r.ends_on, visibility: r.visibility, autoArchive: r.auto_archive, showTime: r.show_time,
    status: effectiveStatus(rule(r), t), storedStatus: r.status, workouts: r.workouts ?? 0,
    hiddenReason: why, hiddenText: why ? HIDDEN_TEXT[why] : null,
  };
}

function checkRules(input: z.infer<typeof routineInput>) {
  const msg = validateRoutine({ startsOn: input.startsOn ?? null, endsOn: input.endsOn ?? null, visibility: input.visibility, autoArchive: input.autoArchive });
  if (msg) throw new HttpError(400, msg);
}

async function ownRoutine(db: Db, a: Actor, id: string): Promise<Row> {
  if (!uuid.safeParse(id).success) notFound();
  const r = (await db.query<Row>(`select ${COLS} from routines r where r.id = $1 and r.consultancy_id = $2`, [id, a.consultancyId])).rows[0];
  if (!r) notFound();
  return r;
}

export const listRoutines = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  if (!uuid.safeParse(ctx.params.id).success) notFound();
  await assertStudent(ctx.db, a, ctx.params.id);
  const { rows } = await ctx.db.query<Row>(
    `select ${COLS}, (select count(*)::int from programs p where p.routine_id = r.id) as workouts
       from routines r where r.consultancy_id = $1 and r.student_id = $2 order by r.created_at desc`, [a.consultancyId, ctx.params.id]);
  return json(rows.map(out));
});

export const createRoutine = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  if (!uuid.safeParse(ctx.params.id).success) notFound();
  await assertStudent(ctx.db, a, ctx.params.id);
  const input = await body(ctx, routineInput);
  checkRules(input);
  const id = uid();
  await ctx.db.query(
    `insert into routines (id, consultancy_id, student_id, name, goal, level, notes, starts_on, ends_on, visibility, auto_archive, show_time, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [id, a.consultancyId, ctx.params.id, input.name, input.goal ?? null, input.level ?? null, input.notes || null, input.startsOn ?? null, input.endsOn ?? null,
      input.visibility, input.autoArchive, input.showTime, a.userId]);
  await audit(ctx.db, a, "routine.create", { routineId: id, studentId: ctx.params.id, name: input.name });
  return json({ id }, 201);
});

export const updateRoutine = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const cur = await ownRoutine(ctx.db, a, ctx.params.id);
  const input = await body(ctx, routineInput);
  checkRules(input);
  await ctx.db.query(
    `update routines set name = $2, goal = $3, level = $4, notes = $5, starts_on = $6, ends_on = $7, visibility = $8, auto_archive = $9, show_time = $10, updated_at = now() where id = $1`,
    [cur.id, input.name, input.goal ?? null, input.level ?? null, input.notes || null, input.startsOn ?? null, input.endsOn ?? null, input.visibility, input.autoArchive, input.showTime]);
  await audit(ctx.db, a, "routine.update", { routineId: cur.id });
  return json({ id: cur.id });
});

/** Arquivar, excluir (ocultar) ou restaurar. Nada é apagado. */
export const setRoutineStatus = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const cur = await ownRoutine(ctx.db, a, ctx.params.id);
  const input = await body(ctx, z.object({ status: z.enum(["active", "archived", "deleted"]) }));
  // Restaurar uma rotina que já venceu com "arquivar ao vencer" não adiantaria (arquivaria de novo): desliga a opção, por ação explícita.
  const expired = input.status === "active" && cur.auto_archive && !!cur.ends_on && cur.ends_on < today();
  await ctx.db.query("update routines set status = $2, auto_archive = case when $3 then false else auto_archive end, updated_at = now() where id = $1", [cur.id, input.status, expired]);
  await audit(ctx.db, a, `routine.${input.status === "active" ? "restore" : input.status === "archived" ? "archive" : "delete"}`, { routineId: cur.id, from: cur.status, autoArchiveTurnedOff: expired });
  return json({ id: cur.id, status: input.status, autoArchiveTurnedOff: expired });
});

/** Muda o treino (programa) de rotina, ou o tira de uma (routineId nulo). Só metadado: a prescrição não muda. */
export const moveWorkout = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const v = await loadVersion(ctx.db, a, ctx.params.id);
  const input = await body(ctx, z.object({ routineId: uuid.nullable() }));
  if (input.routineId) await assertRoutineFor(ctx.db, a, input.routineId, v.student_id);
  await ctx.db.query("update programs set routine_id = $2 where id = $1", [v.program_id, input.routineId]);
  await audit(ctx.db, a, "routine.move_workout", { programId: v.program_id, routineId: input.routineId });
  return json({ programId: v.program_id, routineId: input.routineId });
});

/** Aluno: as rotinas que ele pode ver agora (ativas, dentro da regra de visibilidade). */
export const myRoutines = route(async (ctx) => {
  const a = await requireActor(ctx, "student");
  const { rows } = await ctx.db.query<Row>(
    `select ${COLS} from routines r where r.consultancy_id = $1 and r.student_id = $2 and r.status = 'active' order by r.starts_on desc nulls last, r.created_at desc`,
    [a.consultancyId, a.userId]);
  const t = today();
  return json(rows.filter((r) => visibleToStudent(rule(r), t)).map((r) => ({
    id: r.id, name: r.name, goal: r.goal, level: r.level, notes: r.notes, startsOn: r.starts_on, endsOn: r.ends_on, showTime: r.show_time,
  })));
});
