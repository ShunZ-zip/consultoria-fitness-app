import { z } from "zod";
import {
  clearCookie, createSession, hashPassword, newToken, sessionCookie, sha256, uid, verifyPassword,
} from "./auth";
import type { Actor } from "./auth";
import type { Db } from "./db";
import { body, HttpError, json, notFound, requireActor, route, type Ctx } from "./http";
import { sendMail } from "./mailer";
import { ALLOWED_WEIGHTS, computeVolume, DEFAULT_INDIRECT_WEIGHT, type SetType } from "../lib/volume";
import { mergePermissions, PERMISSION_KEYS, type PermKey, type Permissions } from "../lib/permissions";

const email = z.string().trim().toLowerCase().email().max(200);
const password = z.string().min(8, "Senha com no mínimo 8 caracteres").max(200);
const name = z.string().trim().min(1).max(120);
const uuid = z.string().uuid();

// ---------------------------------------------------------------- Autenticação

export const register = route(async (ctx) => {
  const input = await body(ctx, z.object({ name, email, password, consultancyName: name }));
  const hash = await hashPassword(input.password);
  const userId = uid();
  try {
    await ctx.db.transaction(async (tx) => {
      const cid = uid();
      await tx.query("insert into consultancies (id, name) values ($1, $2)", [cid, input.consultancyName]);
      await tx.query("insert into users (id, email, name, password_hash) values ($1,$2,$3,$4)", [
        userId, input.email, input.name, hash,
      ]);
      await tx.query("insert into memberships (user_id, consultancy_id, role) values ($1,$2,'trainer')", [userId, cid]);
    });
  } catch (e) {
    if (String(e).includes("duplicate key")) throw new HttpError(409, "E-mail já cadastrado");
    throw e;
  }
  const token = await createSession(ctx.db, userId);
  return json({ ok: true }, 201, { "set-cookie": sessionCookie(token) });
});

export const login = route(async (ctx) => {
  const input = await body(ctx, z.object({ email: z.string().trim().toLowerCase().min(1).max(200), password: z.string().min(1).max(200) }));
  const { rows } = await ctx.db.query<{ id: string; password_hash: string }>(
    "select id, password_hash from users where email = $1",
    [input.email],
  );
  const user = rows[0];
  // Mesma resposta para e-mail inexistente e senha errada.
  const ok = user ? await verifyPassword(input.password, user.password_hash) : false;
  if (!user || !ok) throw new HttpError(401, "E-mail ou senha incorretos");
  const token = await createSession(ctx.db, user.id);
  return json({ ok: true }, 200, { "set-cookie": sessionCookie(token) });
});

export const logout = route(async (ctx) => {
  const m = /(?:^|;\s*)sid=([^;]+)/.exec(ctx.req.headers.get("cookie") ?? "");
  if (m) await ctx.db.query("delete from sessions where token_hash = $1", [sha256(decodeURIComponent(m[1]))]);
  return json({ ok: true }, 200, { "set-cookie": clearCookie });
});

export const me = route(async (ctx) => {
  const a = await requireActor(ctx);
  const { rows } = await ctx.db.query<{ name: string }>("select name from consultancies where id = $1", [a.consultancyId]);
  return json({ id: a.userId, name: a.name, email: a.email, role: a.role, consultancyName: rows[0]?.name });
});

// -------------------------------------------------------------------- Convites

type InviteRow = { id: string; consultancy_id: string; student_name: string; consultancy_name: string };

async function findValidInvite(db: Db, token: string): Promise<InviteRow | null> {
  const { rows } = await db.query<InviteRow>(
    `select i.id, i.consultancy_id, i.student_name, c.name as consultancy_name
       from invites i join consultancies c on c.id = i.consultancy_id
      where i.token_hash = $1 and i.used_at is null and i.expires_at > now()`,
    [sha256(token)],
  );
  return rows[0] ?? null;
}

export const createInvite = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const input = await body(ctx, z.object({ studentName: name }));
  const token = newToken();
  await ctx.db.query(
    `insert into invites (id, consultancy_id, created_by, student_name, token_hash, expires_at)
     values ($1,$2,$3,$4,$5, now() + interval '7 days')`,
    [uid(), a.consultancyId, a.userId, input.studentName, sha256(token)],
  );
  // O token só existe aqui; no banco fica apenas o hash.
  return json({ token, path: `/convite/${token}`, expiresInDays: 7 }, 201);
});

export const listInvites = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const { rows } = await ctx.db.query(
    `select id, student_name as "studentName", expires_at as "expiresAt"
       from invites where consultancy_id = $1 and used_at is null and expires_at > now()
      order by created_at desc`,
    [a.consultancyId],
  );
  return json(rows);
});

export const getInvite = route(async (ctx) => {
  const inv = await findValidInvite(ctx.db, ctx.params.token ?? "");
  if (!inv) throw new HttpError(404, "Convite inválido ou expirado");
  return json({ studentName: inv.student_name, consultancyName: inv.consultancy_name });
});

export const acceptInvite = route(async (ctx) => {
  const input = await body(ctx, z.object({ name, email, password }));
  const hash = await hashPassword(input.password);
  const userId = uid();
  try {
    await ctx.db.transaction(async (tx) => {
      const found = await tx.query<{ id: string; consultancy_id: string }>(
        `select id, consultancy_id from invites
          where token_hash = $1 and used_at is null and expires_at > now()`,
        [sha256(ctx.params.token ?? "")],
      );
      const inv = found.rows[0];
      if (!inv) throw new HttpError(404, "Convite inválido ou expirado");
      // Marca como usado primeiro; uso único mesmo com requisições simultâneas.
      const used = await tx.query("update invites set used_at = now() where id = $1 and used_at is null returning id", [inv.id]);
      if (used.rows.length === 0) throw new HttpError(404, "Convite inválido ou expirado");
      await tx.query("insert into users (id, email, name, password_hash) values ($1,$2,$3,$4)", [
        userId, input.email, input.name, hash,
      ]);
      await tx.query("insert into memberships (user_id, consultancy_id, role) values ($1,$2,'student')", [
        userId, inv.consultancy_id,
      ]);
    });
  } catch (e) {
    if (String(e).includes("duplicate key")) throw new HttpError(409, "E-mail já cadastrado");
    throw e;
  }
  const token = await createSession(ctx.db, userId);
  return json({ ok: true }, 201, { "set-cookie": sessionCookie(token) });
});

// ---------------------------------------------------------------------- Alunos

export const listStudents = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const { rows } = await ctx.db.query(
    `select u.id, u.name, u.email from memberships m join users u on u.id = m.user_id
      where m.consultancy_id = $1 and m.role = 'student' order by u.name`,
    [a.consultancyId],
  );
  return json(rows);
});

export const listExercises = route(async (ctx) => {
  const a = await requireActor(ctx);
  const { rows } = await ctx.db.query(
    `select id, name, muscle, equipment, primary_muscles as "primaryMuscles", secondary_muscles as "secondaryMuscles", (consultancy_id is null) as official
       from exercises where consultancy_id is null or consultancy_id = $1 order by name`,
    [a.consultancyId],
  );
  return json(rows);
});

// ---------------------------------------------------------------------- Treinos

export interface VersionRow {
  id: string; name: string; status: "draft" | "published"; published_at: string | null;
  student_id: string; student_name: string; program_id: string; version: number; is_current: boolean; weekly_frequency: number | null;
}

/**
 * Política única de acesso a uma versão de treino.
 * Personal: só da própria consultoria. Aluno: só as publicadas e dele.
 * Qualquer outra situação responde 404, sem revelar que existe.
 */
export async function loadVersion(db: Db, actor: Actor, versionId: string): Promise<VersionRow> {
  if (!uuid.safeParse(versionId).success) notFound();
  const { rows } = await db.query<VersionRow>(
    `select pv.id, p.name, pv.status, pv.published_at, pv.version, pv.program_id, p.weekly_frequency,
            p.student_id, u.name as student_name,
            (pv.status = 'published' and pv.version = (
               select max(x.version) from program_versions x
                where x.program_id = pv.program_id and x.status = 'published')) as is_current
       from program_versions pv
       join programs p on p.id = pv.program_id
       join users u on u.id = p.student_id
      where pv.id = $1
        and ( ($2 = 'trainer' and p.consultancy_id = $3)
           or ($2 = 'student' and p.student_id = $4 and pv.status = 'published' and (
                 pv.version = (select max(x.version) from program_versions x
                                where x.program_id = pv.program_id and x.status = 'published')
                 or coalesce((select (sp.perms->>'viewHistory')::boolean from student_permissions sp where sp.student_id = $4), true)
                 or exists (select 1 from workout_logs wl where wl.version_id = pv.id and wl.student_id = $4))) )`,
    [versionId, actor.role, actor.consultancyId, actor.userId],
  );
  if (!rows[0]) notFound();
  return rows[0];
}

interface PrescribedSet {
  id: string; position: number; setType: SetType; reps: number | null; repsMax: number | null;
  loadKg: number | null; loadPct: number | null; rir: number | null; rpe: number | null;
  restS: number | null; tempo: string | null; note: string | null;
}
interface PrescribedExercise {
  id: string; position: number; exerciseId: string; name: string;
  primaryMuscles: string[]; secondaryMuscles: string[];
  alternativeIds: string[]; alternatives: { id: string; name: string }[]; sets: PrescribedSet[];
}

export async function versionDetail(db: Db, v: VersionRow) {
  const ex = await db.query<{ id: string; position: number; exercise_id: string; exercise_name: string; primary_muscles: string[]; secondary_muscles: string[]; alternative_ids: string[] }>(
    `select ve.id, ve.position, ve.exercise_id, ve.exercise_name, ve.alternative_ids, e.primary_muscles, e.secondary_muscles
       from version_exercises ve join exercises e on e.id = ve.exercise_id
      where ve.version_id = $1 order by ve.position`,
    [v.id],
  );
  const sets = await db.query<{
    id: string; version_exercise_id: string; position: number; set_type: SetType; reps: number | null; reps_max: number | null;
    load_kg: number | null; load_pct: number | null; rir: number | null; rpe: number | null; rest_s: number | null; tempo: string | null; note: string | null;
  }>(
    `select vs.id, vs.version_exercise_id, vs.position, vs.set_type, vs.reps, vs.reps_max, vs.load_kg, vs.load_pct,
            vs.rir, vs.rpe, vs.rest_s, vs.tempo, vs.note
       from version_sets vs join version_exercises ve on ve.id = vs.version_exercise_id
      where ve.version_id = $1 order by vs.position`,
    [v.id],
  );
  const altIds = [...new Set(ex.rows.flatMap((e) => e.alternative_ids))];
  const altNames = new Map(altIds.length === 0 ? [] : (await db.query<{ id: string; name: string }>(
    "select id, name from exercises where id = any($1::uuid[])", [altIds])).rows.map((r) => [r.id, r.name] as const));
  const exercises: PrescribedExercise[] = ex.rows.map((e) => ({
    id: e.id, position: e.position, exerciseId: e.exercise_id, name: e.exercise_name,
    primaryMuscles: e.primary_muscles, secondaryMuscles: e.secondary_muscles,
    alternativeIds: e.alternative_ids,
    alternatives: e.alternative_ids.map((id) => ({ id, name: altNames.get(id) ?? "?" })),
    sets: sets.rows.filter((s) => s.version_exercise_id === e.id).map((s) => ({
      id: s.id, position: s.position, setType: s.set_type, reps: s.reps, repsMax: s.reps_max,
      loadKg: s.load_kg, loadPct: s.load_pct, rir: s.rir, rpe: s.rpe, restS: s.rest_s, tempo: s.tempo, note: s.note,
    })),
  }));
  return {
    id: v.id, name: v.name, status: v.status, publishedAt: v.published_at,
    programId: v.program_id, version: v.version, isCurrent: v.is_current, weeklyFrequency: v.weekly_frequency,
    studentId: v.student_id, studentName: v.student_name, exercises,
  };
}

type Detail = Awaited<ReturnType<typeof versionDetail>>;

const setInput = z.object({
  setType: z.enum(["warmup", "prep", "work"]).default("work"),
  reps: z.number().int().min(1).max(100).nullish(),
  repsMax: z.number().int().min(1).max(100).nullish(),
  loadKg: z.number().min(0).max(1000).nullish(),
  loadPct: z.number().min(0).max(200).nullish(),
  rir: z.number().int().min(0).max(10).nullish(),
  rpe: z.number().min(0).max(10).multipleOf(0.5).nullish(),
  restS: z.number().int().min(0).max(900).nullish(),
  tempo: z.string().trim().max(20).nullish(),
  note: z.string().trim().max(300).nullish(),
})
  .refine((s) => s.repsMax == null || (s.reps != null && s.repsMax >= s.reps), { message: "Reps máximas devem ser maiores ou iguais às mínimas" })
  .refine((s) => !(s.loadKg != null && s.loadPct != null), { message: "Use carga em kg ou em % de 1RM, não os dois" })
  .refine((s) => !(s.rir != null && s.rpe != null), { message: "Use RIR ou RPE, não os dois" });

const exercisesInput = z.array(
  z.object({ exerciseId: uuid, alternativeIds: z.array(uuid).max(8).optional(), sets: z.array(setInput).min(1).max(30) })
    .refine((e) => !(e.alternativeIds ?? []).includes(e.exerciseId), { message: "A alternativa deve ser outro exercício" }),
).min(1).max(30);
export type ExercisesInput = z.infer<typeof exercisesInput>;

const weeklyFrequency = z.number().int().min(1).max(7).nullable().optional();
const createVersionInput = z.object({ studentId: uuid, name, publish: z.boolean().optional(), weeklyFrequency, exercises: exercisesInput });

type Q = Pick<Db, "query">;

export async function assertStudent(db: Db, a: Actor, studentId: string) {
  const stu = await db.query(
    "select 1 from memberships where user_id = $1 and consultancy_id = $2 and role = 'student'",
    [studentId, a.consultancyId],
  );
  if (stu.rows.length === 0) notFound(); // aluno de outra consultoria = inexistente
}

/** Valida que cada exercício é oficial ou da própria consultoria e devolve os nomes (cópia congelada). */
async function resolveNames(db: Db, a: Actor, items: ExercisesInput): Promise<Map<string, string>> {
  const ids = [...new Set(items.flatMap((e) => [e.exerciseId, ...(e.alternativeIds ?? [])]))];
  const cat = await db.query<{ id: string; name: string }>(
    "select id, name from exercises where id = any($1::uuid[]) and (consultancy_id is null or consultancy_id = $2)",
    [ids, a.consultancyId],
  );
  const names = new Map(cat.rows.map((r) => [r.id, r.name]));
  if (names.size !== ids.length) throw new HttpError(400, "Exercício inexistente");
  return names;
}

async function writeContent(tx: Q, versionId: string, items: ExercisesInput, names: Map<string, string>) {
  for (const [i, e] of items.entries()) {
    const veId = uid();
    await tx.query(
      "insert into version_exercises (id, version_id, position, exercise_id, exercise_name, alternative_ids) values ($1,$2,$3,$4,$5,$6::uuid[])",
      [veId, versionId, i + 1, e.exerciseId, names.get(e.exerciseId), [...new Set(e.alternativeIds ?? [])]],
    );
    for (const [j, s] of e.sets.entries()) {
      await tx.query(
        `insert into version_sets (id, version_exercise_id, position, set_type, reps, reps_max, load_kg, load_pct, rir, rpe, rest_s, tempo, note)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [uid(), veId, j + 1, s.setType, s.reps ?? null, s.repsMax ?? null, s.loadKg ?? null, s.loadPct ?? null,
          s.rir ?? null, s.rpe ?? null, s.restS ?? null, s.tempo || null, s.note || null],
      );
    }
  }
}

function detailToInput(d: Detail): { items: ExercisesInput; names: Map<string, string> } {
  const names = new Map(d.exercises.map((e) => [e.exerciseId, e.name]));
  const items: ExercisesInput = d.exercises.map((e) => ({
    exerciseId: e.exerciseId, alternativeIds: e.alternativeIds,
    sets: e.sets.map((s) => ({
      setType: s.setType, reps: s.reps, repsMax: s.repsMax, loadKg: s.loadKg, loadPct: s.loadPct,
      rir: s.rir, rpe: s.rpe, restS: s.restS, tempo: s.tempo, note: s.note,
    })),
  }));
  return { items, names };
}

export async function audit(db: Q, a: Actor, action: string, detail: Record<string, unknown>) {
  await db.query(
    "insert into audit_log (id, consultancy_id, actor_id, action, detail) values ($1,$2,$3,$4,$5::jsonb)",
    [uid(), a.consultancyId, a.userId, action, JSON.stringify(detail)],
  );
}

async function newProgram(tx: Q, a: Actor, studentId: string, programName: string, items: ExercisesInput, names: Map<string, string>, publish: boolean, freq: number | null = null) {
  const programId = uid();
  const versionId = uid();
  await tx.query(
    "insert into programs (id, consultancy_id, student_id, name, created_by, weekly_frequency) values ($1,$2,$3,$4,$5,$6)",
    [programId, a.consultancyId, studentId, programName, a.userId, freq],
  );
  await tx.query("insert into program_versions (id, program_id, version) values ($1,$2,1)", [versionId, programId]);
  await writeContent(tx, versionId, items, names);
  if (publish) {
    await tx.query("update program_versions set status = 'published', published_at = now() where id = $1", [versionId]);
    await audit(tx, a, "version.publish", { versionId, programId, version: 1 });
  }
  return versionId;
}

export const createVersion = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const input = await body(ctx, createVersionInput);
  await assertStudent(ctx.db, a, input.studentId);
  const names = await resolveNames(ctx.db, a, input.exercises);
  const versionId = await ctx.db.transaction((tx) =>
    newProgram(tx, a, input.studentId, input.name, input.exercises, names, !!input.publish, input.weeklyFrequency ?? null));
  return json({ id: versionId, status: input.publish ? "published" : "draft" }, 201);
});

/** Edita um RASCUNHO (substitui o conteúdo). Versões publicadas nunca são editadas. */
export const updateDraft = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const v = await loadVersion(ctx.db, a, ctx.params.id);
  if (v.status !== "draft") throw new HttpError(409, "Treino publicado não pode ser editado. Crie uma nova versão.");
  const input = await body(ctx, z.object({ name: name.optional(), weeklyFrequency, exercises: exercisesInput }));
  const names = await resolveNames(ctx.db, a, input.exercises);
  await ctx.db.transaction(async (tx) => {
    await tx.query("delete from version_sets where version_exercise_id in (select id from version_exercises where version_id = $1)", [v.id]);
    await tx.query("delete from version_exercises where version_id = $1", [v.id]);
    await writeContent(tx, v.id, input.exercises, names);
    if (input.name) await tx.query("update programs set name = $2 where id = $1", [v.program_id, input.name]);
    if (input.weeklyFrequency !== undefined) await tx.query("update programs set weekly_frequency = $2 where id = $1", [v.program_id, input.weeklyFrequency]);
  });
  return json({ id: v.id, status: "draft" });
});

export const publishVersion = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const v = await loadVersion(ctx.db, a, ctx.params.id);
  if (v.status === "published") throw new HttpError(409, "Treino já publicado");
  await ctx.db.transaction(async (tx) => {
    await tx.query("update program_versions set status = 'published', published_at = now() where id = $1", [v.id]);
    await audit(tx, a, "version.publish", { versionId: v.id, programId: v.program_id, version: v.version });
  });
  return json({ id: v.id, status: "published", version: v.version });
});

/** Nova versão (rascunho) a partir da versão atual publicada; a anterior fica preservada. */
/** Cria o RASCUNHO da próxima versão a partir de uma versão publicada e atual (opcionalmente transformando o conteúdo).
 *  Nunca altera a versão publicada. Devolve o rascunho existente, se houver. */
export async function createDraftFromVersion(db: Db, a: Actor, v: VersionRow, transform?: (items: ExercisesInput) => ExercisesInput, auditExtra: Record<string, unknown> = {}) {
  if (v.status !== "published") throw new HttpError(409, "Só é possível criar nova versão a partir de um treino publicado");
  if (!v.is_current) throw new HttpError(409, "Crie a nova versão a partir da versão atual");
  const draft = await db.query<{ id: string; version: number }>(
    "select id, version from program_versions where program_id = $1 and status = 'draft'", [v.program_id]);
  if (draft.rows[0]) return { id: draft.rows[0].id, version: draft.rows[0].version, existing: true };

  const base = detailToInput(await versionDetail(db, v));
  const items = transform ? transform(base.items) : base.items;
  const newId = uid();
  const next = v.version + 1;
  await db.transaction(async (tx) => {
    await tx.query("insert into program_versions (id, program_id, version, based_on) values ($1,$2,$3,$4)", [newId, v.program_id, next, v.id]);
    await writeContent(tx, newId, items, base.names);
    await audit(tx, a, "version.create", { versionId: newId, programId: v.program_id, version: next, basedOn: v.id, ...auditExtra });
  });
  return { id: newId, version: next, existing: false };
}

export const newVersion = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const v = await loadVersion(ctx.db, a, ctx.params.id);
  const r = await createDraftFromVersion(ctx.db, a, v);
  return json({ id: r.id, status: "draft", version: r.version, existing: r.existing }, r.existing ? 200 : 201);
});

/** Duplica para um novo programa em rascunho (mesmo aluno ou outro aluno da mesma consultoria). */
export const duplicateVersion = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const v = await loadVersion(ctx.db, a, ctx.params.id);
  const input = await body(ctx, z.object({ studentId: uuid.optional(), name: name.optional() }));
  const target = input.studentId ?? v.student_id;
  await assertStudent(ctx.db, a, target);
  const { items, names } = detailToInput(await versionDetail(ctx.db, v));
  const id = await ctx.db.transaction((tx) => newProgram(tx, a, target, input.name ?? `${v.name} (cópia)`, items, names, false, v.weekly_frequency));
  return json({ id, status: "draft" }, 201);
});

export const listVersions = route(async (ctx) => {
  const a = await requireActor(ctx);
  const { rows } = await ctx.db.query(
    `select pv.id, p.name, pv.status, pv.published_at as "publishedAt", pv.version, pv.program_id as "programId",
            p.student_id as "studentId", u.name as "studentName",
            (pv.status = 'published' and pv.version = (select max(x.version) from program_versions x
               where x.program_id = pv.program_id and x.status = 'published')) as "isCurrent",
            (select count(*)::int from workout_logs l where l.version_id = pv.id
               and ($1 = 'trainer' or l.student_id = $3)) as "logCount"
       from program_versions pv
       join programs p on p.id = pv.program_id
       join users u on u.id = p.student_id
      where ( ($1 = 'trainer' and p.consultancy_id = $2)
           or ($1 = 'student' and p.student_id = $3 and pv.status = 'published'
               and ( pv.version = (select max(x.version) from program_versions x
                                    where x.program_id = pv.program_id and x.status = 'published')
                     or coalesce((select (sp.perms->>'viewHistory')::boolean from student_permissions sp where sp.student_id = $3), true) )) )
      order by pv.created_at desc`,
    [a.role, a.consultancyId, a.userId],
  );
  return json(rows);
});

export const getVersion = route(async (ctx) => {
  const a = await requireActor(ctx);
  const v = await loadVersion(ctx.db, a, ctx.params.id);
  return json(await versionDetail(ctx.db, v));
});

// -------------------------------------------------------------------- Modelos

export const createTemplate = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const input = await body(ctx, z.object({ name, versionId: uuid.optional(), exercises: exercisesInput.optional() })
    .refine((x) => (x.versionId != null) !== (x.exercises != null), { message: "Informe versionId ou exercises" }));
  let items: ExercisesInput;
  if (input.versionId) {
    items = detailToInput(await versionDetail(ctx.db, await loadVersion(ctx.db, a, input.versionId))).items;
  } else {
    items = input.exercises!;
    await resolveNames(ctx.db, a, items);
  }
  const id = uid();
  await ctx.db.query(
    "insert into templates (id, consultancy_id, name, content, created_by) values ($1,$2,$3,$4::jsonb,$5)",
    [id, a.consultancyId, input.name, JSON.stringify(items), a.userId],
  );
  return json({ id }, 201);
});

export const listTemplates = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const { rows } = await ctx.db.query<{ id: string; name: string; created_at: string; content: ExercisesInput }>(
    "select id, name, created_at, content from templates where consultancy_id = $1 order by created_at desc", [a.consultancyId]);
  return json(rows.map((r) => ({
    id: r.id, name: r.name, createdAt: r.created_at,
    exerciseCount: r.content.length, setCount: r.content.reduce((n, e) => n + e.sets.length, 0),
  })));
});

export const getTemplate = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  if (!uuid.safeParse(ctx.params.id).success) notFound();
  const { rows } = await ctx.db.query<{ id: string; name: string; content: ExercisesInput }>(
    "select id, name, content from templates where id = $1 and consultancy_id = $2", [ctx.params.id, a.consultancyId]);
  if (!rows[0]) notFound();
  return json({ id: rows[0].id, name: rows[0].name, exercises: rows[0].content });
});

// ------------------------------------------------- Volume, configuração e auditoria

export async function indirectWeight(db: Db, consultancyId: string): Promise<number> {
  const { rows } = await db.query<{ indirect_weight: number }>(
    "select indirect_weight from consultancy_settings where consultancy_id = $1", [consultancyId]);
  return rows[0]?.indirect_weight ?? DEFAULT_INDIRECT_WEIGHT;
}

export const getVolume = route(async (ctx) => {
  const a = await requireActor(ctx);
  const v = await loadVersion(ctx.db, a, ctx.params.id);
  if (a.role === "student") await requirePerm(ctx.db, a, "viewVolume");
  const d = await versionDetail(ctx.db, v);
  const weight = await indirectWeight(ctx.db, a.consultancyId);
  const muscles = computeVolume(
    d.exercises.map((e) => ({ primary: e.primaryMuscles, secondary: e.secondaryMuscles, sets: e.sets })),
    weight,
  );
  return json({ indirectWeight: weight, formula: "ponderado = diretas + indiretas × peso (só séries de trabalho)", muscles });
});

export const getSettings = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  return json({ indirectWeight: await indirectWeight(ctx.db, a.consultancyId), allowed: ALLOWED_WEIGHTS });
});

export const putSettings = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const input = await body(ctx, z.object({ indirectWeight: z.number().refine((n) => (ALLOWED_WEIGHTS as readonly number[]).includes(n), { message: "Peso deve ser 0, 0,25, 0,5, 0,75 ou 1" }) }));
  const before = await indirectWeight(ctx.db, a.consultancyId);
  await ctx.db.transaction(async (tx) => {
    await tx.query(
      `insert into consultancy_settings (consultancy_id, indirect_weight) values ($1,$2)
       on conflict (consultancy_id) do update set indirect_weight = excluded.indirect_weight`,
      [a.consultancyId, input.indirectWeight]);
    await audit(tx, a, "settings.indirect_weight", { from: before, to: input.indirectWeight });
  });
  return json({ indirectWeight: input.indirectWeight });
});

export const listAudit = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const { rows } = await ctx.db.query(
    `select l.id, l.action, l.detail, l.at, u.name as "actorName"
       from audit_log l join users u on u.id = l.actor_id
      where l.consultancy_id = $1 order by l.at desc limit 30`, [a.consultancyId]);
  return json(rows);
});

// ------------------------------------------------------ Permissões do aluno (opção C)

export async function getPerms(db: Q, studentId: string): Promise<Permissions> {
  const { rows } = await db.query<{ perms: Partial<Permissions> }>(
    "select perms from student_permissions where student_id = $1", [studentId]);
  return mergePermissions(rows[0]?.perms);
}

/** Bloqueia (403) a ação do aluno se o personal não liberou a permissão. */
export async function requirePerm(db: Q, a: Actor, key: PermKey) {
  if (!(await getPerms(db, a.userId))[key]) throw new HttpError(403, "O personal não liberou esta alteração para você");
}

export const getMyPermissions = route(async (ctx) => {
  const a = await requireActor(ctx, "student");
  return json(await getPerms(ctx.db, a.userId));
});

export const getStudentPermissions = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  if (!uuid.safeParse(ctx.params.id).success) notFound();
  await assertStudent(ctx.db, a, ctx.params.id);
  return json(await getPerms(ctx.db, ctx.params.id));
});

const permissionsInput = z.object(Object.fromEntries(PERMISSION_KEYS.map((k) => [k, z.boolean()]))).strict();

export const putStudentPermissions = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  if (!uuid.safeParse(ctx.params.id).success) notFound();
  await assertStudent(ctx.db, a, ctx.params.id);
  const input = (await body(ctx, permissionsInput)) as Permissions;
  const before = await getPerms(ctx.db, ctx.params.id);
  const changed = Object.fromEntries(PERMISSION_KEYS.filter((k) => before[k] !== input[k]).map((k) => [k, { from: before[k], to: input[k] }]));
  await ctx.db.transaction(async (tx) => {
    await tx.query(
      `insert into student_permissions (student_id, consultancy_id, perms) values ($1,$2,$3::jsonb)
       on conflict (student_id) do update set perms = excluded.perms, updated_at = now()`,
      [ctx.params.id, a.consultancyId, JSON.stringify(input)]);
    if (Object.keys(changed).length > 0) await audit(tx, a, "student.permissions", { studentId: ctx.params.id, changed });
  });
  return json(input);
});

// -------------------------------------------------------------------- Registros

interface LogRow {
  id: string; student_id: string; version_id: string; started_at: string; finished_at: string | null;
  note: string | null; exercise_order: string[] | null;
}
interface LoggedRow {
  id: string; log_id: string; version_set_id: string | null; version_exercise_id: string | null;
  extra_exercise_id: string | null; position: number | null;
  reps: number | null; load_kg: number | null; rir: number | null; rest_s: number | null; note: string | null;
}

const LOG_COLS = "id, student_id, version_id, started_at, finished_at, note, exercise_order";

async function loadLogs(db: Db, versionId: string, studentId: string | null) {
  const logs = await db.query<LogRow>(
    `select ${LOG_COLS} from workout_logs
      where version_id = $1 and ($2::uuid is null or student_id = $2) order by started_at`,
    [versionId, studentId],
  );
  const sets = await db.query<LoggedRow>(
    `select ls.id, ls.log_id, ls.version_set_id, ls.version_exercise_id, ls.extra_exercise_id, ls.position,
            ls.reps, ls.load_kg, ls.rir, ls.rest_s, ls.note
       from logged_sets ls join workout_logs l on l.id = ls.log_id
      where l.version_id = $1 and ($2::uuid is null or l.student_id = $2)`,
    [versionId, studentId],
  );
  const subs = await db.query<{ log_id: string; version_exercise_id: string; exercise_id: string; name: string }>(
    `select s.log_id, s.version_exercise_id, s.exercise_id, e.name
       from log_substitutions s join exercises e on e.id = s.exercise_id join workout_logs l on l.id = s.log_id
      where l.version_id = $1 and ($2::uuid is null or l.student_id = $2)`,
    [versionId, studentId],
  );
  const extras = await db.query<{ id: string; log_id: string; exercise_id: string; exercise_name: string; position: number }>(
    `select x.id, x.log_id, x.exercise_id, x.exercise_name, x.position
       from log_extra_exercises x join workout_logs l on l.id = x.log_id
      where l.version_id = $1 and ($2::uuid is null or l.student_id = $2) order by x.position`,
    [versionId, studentId],
  );
  return logs.rows.map((l) => ({
    id: l.id, studentId: l.student_id, startedAt: l.started_at, finishedAt: l.finished_at, note: l.note,
    exerciseOrder: l.exercise_order,
    substitutions: subs.rows.filter((s) => s.log_id === l.id).map((s) => ({ versionExerciseId: s.version_exercise_id, exerciseId: s.exercise_id, name: s.name })),
    extraExercises: extras.rows.filter((x) => x.log_id === l.id).map((x) => ({ id: x.id, exerciseId: x.exercise_id, name: x.exercise_name, position: x.position })),
    sets: sets.rows.filter((s) => s.log_id === l.id).map((s) => ({
      id: s.id, versionSetId: s.version_set_id, versionExerciseId: s.version_exercise_id, extraExerciseId: s.extra_exercise_id,
      position: s.position, reps: s.reps, loadKg: s.load_kg, rir: s.rir, restS: s.rest_s, note: s.note,
    })),
  }));
}

export const listLogs = route(async (ctx) => {
  const a = await requireActor(ctx);
  const v = await loadVersion(ctx.db, a, ctx.params.id);
  return json(await loadLogs(ctx.db, v.id, a.role === "student" ? a.userId : null));
});

export const startLog = route(async (ctx) => {
  const a = await requireActor(ctx, "student");
  const v = await loadVersion(ctx.db, a, ctx.params.id);
  const input = await body(ctx, z.object({ id: uuid.optional() }));
  const id = input.id ?? uid();
  const already = await ctx.db.query(
    "select 1 from workout_logs where id = $1 and student_id = $2 and version_id = $3", [id, a.userId, v.id]);
  if (already.rows.length === 0 && !v.is_current) {
    throw new HttpError(409, "Este treino foi substituído por uma versão mais nova");
  }
  await ctx.db.query(
    "insert into workout_logs (id, student_id, version_id) values ($1,$2,$3) on conflict (id) do nothing",
    [id, a.userId, v.id],
  );
  // Reenvio com o mesmo id devolve o mesmo registro; id de outro aluno = não encontrado.
  const { rows } = await ctx.db.query<LogRow>(
    `select ${LOG_COLS} from workout_logs where id = $1 and student_id = $2 and version_id = $3`,
    [id, a.userId, v.id],
  );
  if (!rows[0]) notFound();
  return json({ id: rows[0].id, startedAt: rows[0].started_at, finishedAt: rows[0].finished_at }, 200);
});

async function ownLog(db: Db, a: Actor, logId: string): Promise<LogRow> {
  if (!uuid.safeParse(logId).success) notFound();
  const { rows } = await db.query<LogRow>(
    `select ${LOG_COLS} from workout_logs where id = $1 and student_id = $2`,
    [logId, a.userId],
  );
  if (!rows[0]) notFound();
  return rows[0];
}

const loggedInput = z.object({
  versionSetId: uuid.optional(),          // série prescrita
  versionExerciseId: uuid.optional(),     // série extra de exercício prescrito (permissão: editSets)
  extraExerciseId: uuid.optional(),       // série de exercício extra
  position: z.number().int().min(1).max(50).optional(),
  reps: z.number().int().min(0).max(1000).nullish(),
  loadKg: z.number().min(0).max(2000).nullish(),
  rir: z.number().int().min(0).max(10).nullish(),
  restS: z.number().int().min(0).max(1800).nullish(), // descanso realizado (permissão: adjustRest)
  note: z.string().max(500).nullish(),
})
  .refine((x) => [x.versionSetId, x.versionExerciseId, x.extraExerciseId].filter(Boolean).length === 1, { message: "Informe exatamente um destino para a série" })
  .refine((x) => !(x.versionExerciseId || x.extraExerciseId) || x.position != null, { message: "Informe a posição da série extra" });

/** Idempotente: o id da série é gerado pelo cliente; reenviar não duplica. */
export const putLoggedSet = route(async (ctx) => {
  const a = await requireActor(ctx, "student");
  const log = await ownLog(ctx.db, a, ctx.params.id);
  const setId = ctx.params.setId ?? "";
  if (!uuid.safeParse(setId).success) throw new HttpError(400, "Id de série inválido");
  const input = await body(ctx, loggedInput);

  if (input.restS != null) await requirePerm(ctx.db, a, "adjustRest");

  if (input.versionSetId) {
    // A série prescrita precisa pertencer à versão deste registro.
    const vs = await ctx.db.query(
      `select 1 from version_sets vs join version_exercises ve on ve.id = vs.version_exercise_id
        where vs.id = $1 and ve.version_id = $2`, [input.versionSetId, log.version_id]);
    if (vs.rows.length === 0) throw new HttpError(400, "Série não pertence a este treino");
  } else if (input.versionExerciseId) {
    await requirePerm(ctx.db, a, "editSets");
    const ve = await ctx.db.query("select 1 from version_exercises where id = $1 and version_id = $2", [input.versionExerciseId, log.version_id]);
    if (ve.rows.length === 0) throw new HttpError(400, "Exercício não pertence a este treino");
  } else {
    const xe = await ctx.db.query("select 1 from log_extra_exercises where id = $1 and log_id = $2", [input.extraExerciseId, log.id]);
    if (xe.rows.length === 0) throw new HttpError(400, "Exercício extra não pertence a este registro");
  }

  const existing = await ctx.db.query<{ log_id: string; version_set_id: string | null; version_exercise_id: string | null; extra_exercise_id: string | null; position: number | null }>(
    "select log_id, version_set_id, version_exercise_id, extra_exercise_id, position from logged_sets where id = $1", [setId]);
  const ex = existing.rows[0];
  if (ex && ex.log_id !== log.id) notFound(); // id pertence a registro alheio
  if (ex && (ex.version_set_id !== (input.versionSetId ?? null) || ex.version_exercise_id !== (input.versionExerciseId ?? null)
      || ex.extra_exercise_id !== (input.extraExerciseId ?? null) || ex.position !== (input.position ?? null))) {
    throw new HttpError(409, "Id já usado para outra série");
  }

  const vals = [input.reps ?? null, input.loadKg ?? null, input.rir ?? null, input.restS ?? null, input.note ?? null];
  const upd = "reps = excluded.reps, load_kg = excluded.load_kg, rir = excluded.rir, rest_s = excluded.rest_s, note = excluded.note";
  const ret = `returning id, version_set_id as "versionSetId", version_exercise_id as "versionExerciseId",
               extra_exercise_id as "extraExerciseId", position, reps, load_kg as "loadKg", rir, rest_s as "restS", note`;
  let rows;
  if (input.versionSetId) {
    ({ rows } = await ctx.db.query(
      `insert into logged_sets (id, log_id, version_set_id, reps, load_kg, rir, rest_s, note) values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (log_id, version_set_id) do update set ${upd} ${ret}`,
      [setId, log.id, input.versionSetId, ...vals]));
  } else if (input.versionExerciseId) {
    ({ rows } = await ctx.db.query(
      `insert into logged_sets (id, log_id, version_exercise_id, position, reps, load_kg, rir, rest_s, note) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (log_id, version_exercise_id, position) where version_set_id is null and extra_exercise_id is null
       do update set ${upd} ${ret}`,
      [setId, log.id, input.versionExerciseId, input.position, ...vals]));
  } else {
    ({ rows } = await ctx.db.query(
      `insert into logged_sets (id, log_id, extra_exercise_id, position, reps, load_kg, rir, rest_s, note) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (extra_exercise_id, position) where extra_exercise_id is not null
       do update set ${upd} ${ret}`,
      [setId, log.id, input.extraExerciseId, input.position, ...vals]));
  }
  return json(rows[0], 200);
});

export const finishLog = route(async (ctx) => {
  const a = await requireActor(ctx, "student");
  const log = await ownLog(ctx.db, a, ctx.params.id);
  const input = await body(ctx, z.object({ note: z.string().max(1000).nullish() }));
  await ctx.db.query(
    "update workout_logs set finished_at = coalesce(finished_at, now()), note = coalesce($2, note) where id = $1",
    [log.id, input.note ?? null],
  );
  return json({ ok: true });
});

// -------------------------------------------- Adaptações da sessão (por permissão)

/** Reordenar exercícios na sessão. A ordem prescrita não muda; a escolhida fica no registro. */
export const putOrder = route(async (ctx) => {
  const a = await requireActor(ctx, "student");
  const log = await ownLog(ctx.db, a, ctx.params.id);
  const input = await body(ctx, z.object({ order: z.array(uuid).min(1).max(60) }));
  await requirePerm(ctx.db, a, "reorder");
  const ve = await ctx.db.query<{ id: string }>("select id from version_exercises where version_id = $1", [log.version_id]);
  const valid = new Set(ve.rows.map((r) => r.id));
  const given = new Set(input.order);
  if (given.size !== input.order.length || given.size !== valid.size || [...given].some((x) => !valid.has(x))) {
    throw new HttpError(400, "A ordem deve conter cada exercício do treino exatamente uma vez");
  }
  await ctx.db.query("update workout_logs set exercise_order = $2::uuid[] where id = $1", [log.id, input.order]);
  return json({ order: input.order });
});

/** Substituir um exercício: alternativa autorizada, ou qualquer da biblioteca com a permissão livre. */
export const putSubstitution = route(async (ctx) => {
  const a = await requireActor(ctx, "student");
  const log = await ownLog(ctx.db, a, ctx.params.id);
  const veId = ctx.params.veId ?? "";
  if (!uuid.safeParse(veId).success) notFound();
  const input = await body(ctx, z.object({ exerciseId: uuid.nullable() }));
  const ve = await ctx.db.query<{ alternative_ids: string[] }>(
    "select alternative_ids from version_exercises where id = $1 and version_id = $2", [veId, log.version_id]);
  if (!ve.rows[0]) throw new HttpError(400, "Exercício não pertence a este treino");

  if (input.exerciseId === null) { // voltar ao prescrito é sempre permitido
    await ctx.db.query("delete from log_substitutions where log_id = $1 and version_exercise_id = $2", [log.id, veId]);
    return json({ versionExerciseId: veId, exerciseId: null });
  }
  const perms = await getPerms(ctx.db, a.userId);
  const authorized = ve.rows[0].alternative_ids.includes(input.exerciseId);
  if (!(perms.substituteFree || (authorized && perms.substituteAuthorized))) {
    throw new HttpError(403, authorized ? "O personal não liberou a substituição de exercícios" : "Este exercício não está entre as alternativas autorizadas");
  }
  const cat = await ctx.db.query(
    "select 1 from exercises where id = $1 and (consultancy_id is null or consultancy_id = $2)", [input.exerciseId, a.consultancyId]);
  if (cat.rows.length === 0) throw new HttpError(400, "Exercício inexistente");
  await ctx.db.query(
    `insert into log_substitutions (log_id, version_exercise_id, exercise_id) values ($1,$2,$3)
     on conflict (log_id, version_exercise_id) do update set exercise_id = excluded.exercise_id`,
    [log.id, veId, input.exerciseId]);
  return json({ versionExerciseId: veId, exerciseId: input.exerciseId });
});

/** Incluir um exercício extra na sessão (idempotente pelo id do cliente). */
export const postExtraExercise = route(async (ctx) => {
  const a = await requireActor(ctx, "student");
  const log = await ownLog(ctx.db, a, ctx.params.id);
  const input = await body(ctx, z.object({ id: uuid.optional(), exerciseId: uuid }));
  const id = input.id ?? uid();
  const existing = await ctx.db.query<{ log_id: string; exercise_id: string; exercise_name: string; position: number }>(
    "select log_id, exercise_id, exercise_name, position from log_extra_exercises where id = $1", [id]);
  if (existing.rows[0]) {
    if (existing.rows[0].log_id !== log.id) notFound();
    const e = existing.rows[0];
    return json({ id, exerciseId: e.exercise_id, name: e.exercise_name, position: e.position });
  }
  await requirePerm(ctx.db, a, "addExercises");
  const cat = await ctx.db.query<{ name: string }>(
    "select name from exercises where id = $1 and (consultancy_id is null or consultancy_id = $2)", [input.exerciseId, a.consultancyId]);
  if (cat.rows.length === 0) throw new HttpError(400, "Exercício inexistente");
  const pos = await ctx.db.query<{ n: number }>("select count(*)::int + 1 as n from log_extra_exercises where log_id = $1", [log.id]);
  await ctx.db.query(
    "insert into log_extra_exercises (id, log_id, exercise_id, exercise_name, position) values ($1,$2,$3,$4,$5)",
    [id, log.id, input.exerciseId, cat.rows[0].name, pos.rows[0].n]);
  return json({ id, exerciseId: input.exerciseId, name: cat.rows[0].name, position: pos.rows[0].n }, 201);
});

// ------------------------------------------------------------------- Comparação

export const comparison = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const v = await loadVersion(ctx.db, a, ctx.params.id);
  const detail = await versionDetail(ctx.db, v);
  const logs = await loadLogs(ctx.db, v.id, null);

  const sub = (x: number | null | undefined, y: number | null | undefined) =>
    x == null || y == null ? null : Math.round((x - y) * 100) / 100;

  // Faixa de repetições: dentro da faixa = 0; fora, a diferença até o limite mais próximo.
  const repsDiff = (done: number | null, min: number | null, max: number | null | undefined) => {
    if (done == null || min == null) return null;
    if (max != null && done > max) return done - max;
    return done < min ? done - min : 0;
  };
  const exName = new Map(detail.exercises.map((e) => [e.id, e.name]));
  const view = (s: { reps: number | null; loadKg: number | null; rir: number | null; restS: number | null; note: string | null }) =>
    ({ reps: s.reps, loadKg: s.loadKg, rir: s.rir, restS: s.restS, note: s.note });

  return json({
    version: detail,
    logs: logs.map((l) => {
      const subBy = new Map(l.substitutions.map((s) => [s.versionExerciseId, s.name]));
      const extraSets = l.sets.filter((s) => s.versionExerciseId && !s.versionSetId);
      return {
        id: l.id, startedAt: l.startedAt, finishedAt: l.finishedAt, note: l.note,
        // Três camadas distintas: prescrito (rows.prescribed), adaptado (adaptations) e realizado (rows.done).
        adaptations: {
          originalOrder: detail.exercises.map((e) => e.name),
          adaptedOrder: l.exerciseOrder ? l.exerciseOrder.map((id) => exName.get(id) ?? "?") : null,
          substitutions: l.substitutions.map((s) => ({ prescribed: exName.get(s.versionExerciseId) ?? "?", performed: s.name })),
          extraExercises: l.extraExercises.map((x) => ({
            name: x.name,
            sets: l.sets.filter((s) => s.extraExerciseId === x.id).sort((p, q) => (p.position ?? 0) - (q.position ?? 0)).map((s) => ({ position: s.position, ...view(s) })),
          })),
          extraSets: extraSets.sort((p, q) => (p.position ?? 0) - (q.position ?? 0)).map((s) => ({
            exerciseName: exName.get(s.versionExerciseId!) ?? "?", performedName: subBy.get(s.versionExerciseId!) ?? null, position: s.position, ...view(s),
          })),
        },
        rows: detail.exercises.flatMap((e) =>
          e.sets.map((s) => {
            const done = l.sets.find((d) => d.versionSetId === s.id) ?? null;
            return {
              exerciseName: e.name, performedName: subBy.get(e.id) ?? null, setPosition: s.position, versionSetId: s.id,
              setType: s.setType,
              prescribed: { reps: s.reps, repsMax: s.repsMax, loadKg: s.loadKg, loadPct: s.loadPct, rir: s.rir, rpe: s.rpe, restS: s.restS, tempo: s.tempo },
              done: done && view(done),
              diff: done && { reps: repsDiff(done.reps, s.reps, s.repsMax), loadKg: sub(done.loadKg, s.loadKg), rir: sub(done.rir, s.rir), restS: sub(done.restS, s.restS) },
            };
          }),
        ),
      };
    }),
  });
});

// ------------------------------------------------------ Esqueci a senha

const RESET_MINUTES = 60;
const RESET_MAX_PER_HOUR = 3;
const FORGOT_REPLY = { ok: true, message: "Se o e-mail estiver cadastrado, enviaremos um link para redefinir a senha." };

/** Base do link enviado. Nunca confia no cabeçalho Host em produção (evita envenenamento do link). */
function appBaseUrl(req: Request): string | null {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  return process.env.NODE_ENV === "production" ? null : new URL(req.url).origin;
}

/** Resposta idêntica para e-mail cadastrado ou não (não revela quem tem conta). */
export const forgotPassword = route(async (ctx) => {
  const input = await body(ctx, z.object({ email }));
  const { rows } = await ctx.db.query<{ id: string; name: string }>("select id, name from users where email = $1", [input.email]);
  const user = rows[0];
  let devLink: string | undefined;
  if (user) {
    const recent = await ctx.db.query<{ n: number }>(
      "select count(*)::int as n from password_resets where user_id = $1 and created_at > now() - interval '1 hour'", [user.id]);
    const base = appBaseUrl(ctx.req);
    if (recent.rows[0].n < RESET_MAX_PER_HOUR && base) {
      const token = newToken();
      await ctx.db.query(
        "insert into password_resets (id, user_id, token_hash, expires_at) values ($1,$2,$3, now() + ($4 || ' minutes')::interval)",
        [uid(), user.id, sha256(token), String(RESET_MINUTES)]);
      const link = `${base}/redefinir-senha/${token}`;
      await sendMail({
        to: input.email,
        subject: "Redefinir sua senha",
        text: `Olá, ${user.name}.

Para criar uma nova senha, abra o link abaixo (válido por ${RESET_MINUTES} minutos e de uso único):
${link}

Se você não pediu isso, ignore esta mensagem: sua senha continua a mesma.`,
      });
      // Somente em desenvolvimento local, para testar sem provedor de e-mail.
      if (process.env.NODE_ENV === "development") devLink = link;
    }
  }
  return json(devLink ? { ...FORGOT_REPLY, devLink } : FORGOT_REPLY);
});

async function findResetToken(db: Q, token: string) {
  const { rows } = await db.query<{ id: string; user_id: string }>(
    "select id, user_id from password_resets where token_hash = $1 and used_at is null and expires_at > now()", [sha256(token)]);
  return rows[0] ?? null;
}

export const checkResetToken = route(async (ctx) => {
  if (!(await findResetToken(ctx.db, ctx.params.token ?? ""))) throw new HttpError(404, "Link inválido ou expirado");
  return json({ ok: true });
});

export const resetPassword = route(async (ctx) => {
  const input = await body(ctx, z.object({ token: z.string().min(10).max(200), password }));
  const hash = await hashPassword(input.password);
  await ctx.db.transaction(async (tx) => {
    const t = await findResetToken(tx, input.token);
    if (!t) throw new HttpError(404, "Link inválido ou expirado");
    // Marca como usado primeiro: uso único mesmo com requisições simultâneas.
    const used = await tx.query("update password_resets set used_at = now() where id = $1 and used_at is null returning id", [t.id]);
    if (used.rows.length === 0) throw new HttpError(404, "Link inválido ou expirado");
    await tx.query("update users set password_hash = $2 where id = $1", [t.user_id, hash]);
    await tx.query("delete from sessions where user_id = $1", [t.user_id]); // derruba sessões antigas
    await tx.query("update password_resets set used_at = now() where user_id = $1 and used_at is null", [t.user_id]);
  });
  return json({ ok: true });
});

export type { Ctx };
