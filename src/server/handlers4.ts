// Entrega 4: acompanhamento — biblioteca (mídia), avaliações, check-ins e chat.
import { z } from "zod";
import { BUILTIN_TEMPLATES, numericDeltas, validateAnswers, type Field } from "../lib/assessment";
import { computeFlags, dueStatus, DEFAULT_FREQUENCY_DAYS, DEFAULT_QUESTION_IDS, priority, questionsFor, type Flag } from "../lib/checkin";
import { isSafeMediaUrl, pickPref, resolveMedia, type MediaItem, type MediaPref } from "../lib/media";
import { uid } from "./auth";
import type { Actor } from "./auth";
import type { Db } from "./db";
import { assertStudent, audit } from "./handlers";
import { body, HttpError, json, notFound, requireActor, route } from "./http";

const uuid = z.string().uuid();
const text = (max: number) => z.string().trim().min(1).max(max);

// =============================================================== Biblioteca e mídia

interface ExRow { id: string; name: string; consultancy_id: string | null }

/** Exercício oficial ou da própria consultoria; qualquer outro responde 404. */
async function accessibleExercise(db: Db, a: Actor, id: string): Promise<ExRow> {
  if (!uuid.safeParse(id).success) notFound();
  const { rows } = await db.query<ExRow>(
    "select id, name, consultancy_id from exercises where id = $1 and (consultancy_id is null or consultancy_id = $2)", [id, a.consultancyId]);
  if (!rows[0]) notFound();
  return rows[0];
}

/** Exercício próprio: pertence à biblioteca privada do personal; o catálogo oficial não é alterado. */
export const createExercise = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const input = await body(ctx, z.object({
    name: text(80), equipment: z.string().trim().max(60).default("Livre"),
    primaryMuscles: z.array(text(60)).min(1).max(4), secondaryMuscles: z.array(text(60)).max(8).default([]),
  }));
  const dup = await ctx.db.query(
    "select 1 from exercises where lower(name) = lower($1) and (consultancy_id is null or consultancy_id = $2)", [input.name, a.consultancyId]);
  if (dup.rows.length) throw new HttpError(409, "Já existe um exercício com este nome");
  const id = uid();
  await ctx.db.query(
    "insert into exercises (id, consultancy_id, name, muscle, equipment, primary_muscles, secondary_muscles) values ($1,$2,$3,$4,$5,$6::text[],$7::text[])",
    [id, a.consultancyId, input.name, input.primaryMuscles.join(" / "), input.equipment, input.primaryMuscles, input.secondaryMuscles]);
  return json({ id, name: input.name }, 201);
});

async function mediaFor(db: Db, a: Actor, exerciseId: string) {
  const toItem = (r: { id: string; kind: "animation" | "video"; title: string; url: string; license: string | null }): MediaItem =>
    ({ id: r.id, kind: r.kind, title: r.title, url: r.url, license: r.license });
  const cols = "id, kind, title, url, license";
  const official = (await db.query<any>(`select ${cols} from exercise_media where exercise_id = $1 and consultancy_id is null order by created_at`, [exerciseId])).rows.map(toItem);
  const own = (await db.query<any>(`select ${cols} from exercise_media where exercise_id = $1 and consultancy_id = $2 order by created_at`, [exerciseId, a.consultancyId])).rows.map(toItem);
  const prefs = (await db.query<{ student_id: string | null; mode: MediaPref["mode"]; own_media_id: string | null }>(
    "select student_id, mode, own_media_id from media_preferences where consultancy_id = $1 and exercise_id = $2", [a.consultancyId, exerciseId]))
    .rows.map((p): MediaPref => ({ studentId: p.student_id, mode: p.mode, ownMediaId: p.own_media_id }));
  return { official, own, prefs };
}

/** Aluno: só a mídia já resolvida para ele. Personal: oficial, própria, regras e a visão de um aluno (?studentId). */
export const getExerciseMedia = route(async (ctx) => {
  const a = await requireActor(ctx);
  const ex = await accessibleExercise(ctx.db, a, ctx.params.id);
  const { official, own, prefs } = await mediaFor(ctx.db, a, ex.id);
  if (a.role === "student") return json({ exercise: { id: ex.id, name: ex.name }, resolved: resolveMedia(official, own, pickPref(prefs, a.userId)) });
  const sid = ctx.url.searchParams.get("studentId");
  if (sid) await assertStudent(ctx.db, a, sid);
  return json({
    exercise: { id: ex.id, name: ex.name, own: ex.consultancy_id !== null },
    official, own, preferences: prefs,
    resolved: resolveMedia(official, own, pickPref(prefs, sid)),
  });
});

export const addExerciseMedia = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const ex = await accessibleExercise(ctx.db, a, ctx.params.id);
  const input = await body(ctx, z.object({ title: text(120), url: z.string().trim().max(1000), license: z.string().trim().max(200).optional() }));
  if (!isSafeMediaUrl(input.url)) throw new HttpError(400, "Use um link https válido para o vídeo");
  const n = await ctx.db.query<{ n: number }>("select count(*)::int as n from exercise_media where exercise_id = $1 and consultancy_id = $2", [ex.id, a.consultancyId]);
  if (n.rows[0].n >= 5) throw new HttpError(400, "Limite de 5 vídeos próprios por exercício");
  const id = uid();
  await ctx.db.transaction(async (tx) => {
    await tx.query("insert into exercise_media (id, exercise_id, consultancy_id, kind, title, url, license, created_by) values ($1,$2,$3,'video',$4,$5,$6,$7)",
      [id, ex.id, a.consultancyId, input.title, input.url, input.license ?? null, a.userId]);
    await audit(tx, a, "media.add", { exerciseId: ex.id, mediaId: id });
  });
  return json({ id }, 201);
});

/** Define o que o aluno vê: para todos os alunos do personal ou para um aluno específico. */
export const putMediaPreference = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const ex = await accessibleExercise(ctx.db, a, ctx.params.id);
  const input = await body(ctx, z.object({ mode: z.enum(["official", "own", "both"]), ownMediaId: uuid.nullish(), studentId: uuid.nullish() }));
  if (input.studentId) await assertStudent(ctx.db, a, input.studentId);
  if (input.ownMediaId) {
    const m = await ctx.db.query("select 1 from exercise_media where id = $1 and exercise_id = $2 and consultancy_id = $3", [input.ownMediaId, ex.id, a.consultancyId]);
    if (m.rows.length === 0) throw new HttpError(400, "Vídeo próprio inexistente para este exercício");
  } else if (input.mode !== "official") {
    const any = await ctx.db.query("select 1 from exercise_media where exercise_id = $1 and consultancy_id = $2", [ex.id, a.consultancyId]);
    if (any.rows.length === 0) throw new HttpError(400, "Adicione um vídeo próprio primeiro");
  }
  await ctx.db.transaction(async (tx) => {
    await tx.query("delete from media_preferences where consultancy_id = $1 and exercise_id = $2 and student_id is not distinct from $3::uuid", [a.consultancyId, ex.id, input.studentId ?? null]);
    await tx.query("insert into media_preferences (id, consultancy_id, exercise_id, student_id, mode, own_media_id) values ($1,$2,$3,$4,$5,$6)",
      [uid(), a.consultancyId, ex.id, input.studentId ?? null, input.mode, input.ownMediaId ?? null]);
    await audit(tx, a, "media.preference", { exerciseId: ex.id, studentId: input.studentId ?? null, mode: input.mode });
  });
  return json({ ok: true });
});

// ===================================================================== Avaliações

const fieldSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]{1,40}$/, "id do campo: letras minúsculas, números e _"),
  label: text(160),
  type: z.enum(["text", "number", "scale", "yesno", "choice"]),
  unit: z.string().trim().max(20).optional(),
  options: z.array(text(80)).min(2).max(12).optional(),
  min: z.number().int().min(0).max(100).optional(), max: z.number().int().min(1).max(100).optional(),
  required: z.boolean().optional(),
}).refine((f) => f.type !== "choice" || !!f.options, { message: "Campo de escolha precisa de opções" });
const fieldsSchema = z.array(fieldSchema).min(1).max(40).refine((fs) => new Set(fs.map((f) => f.id)).size === fs.length, { message: "Ids de campo repetidos" });

export const listAssessmentTemplates = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const { rows } = await ctx.db.query(
    `select id, name, kind, fields, created_at as "createdAt" from assessment_templates where consultancy_id = $1 order by created_at desc`, [a.consultancyId]);
  return json({ templates: rows, builtins: BUILTIN_TEMPLATES });
});

export const createAssessmentTemplate = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const input = await body(ctx, z.union([
    z.object({ key: z.string() }),
    z.object({ name: text(100), kind: z.enum(["measures", "anamnesis", "screening", "tests", "questionnaire"]).default("questionnaire"), fields: fieldsSchema }),
  ]));
  let name: string, kind: string, fields: Field[];
  if ("key" in input) {
    const b = BUILTIN_TEMPLATES.find((t) => t.key === input.key);
    if (!b) throw new HttpError(400, "Modelo pronto inexistente");
    ({ name, kind, fields } = b);
  } else ({ name, kind, fields } = { name: input.name, kind: input.kind, fields: input.fields as Field[] });
  const id = uid();
  await ctx.db.query("insert into assessment_templates (id, consultancy_id, name, kind, fields, created_by) values ($1,$2,$3,$4,$5::jsonb,$6)",
    [id, a.consultancyId, name, kind, JSON.stringify(fields), a.userId]);
  return json({ id, name }, 201);
});

/** Registra uma avaliação (o personal preenche) ou envia ao aluno para preencher. */
export const requestAssessment = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  if (!uuid.safeParse(ctx.params.id).success) notFound();
  await assertStudent(ctx.db, a, ctx.params.id);
  const input = await body(ctx, z.object({ templateId: uuid, answers: z.record(z.string(), z.unknown()).optional() }));
  const t = (await ctx.db.query<{ id: string; name: string; fields: Field[] }>(
    "select id, name, fields from assessment_templates where id = $1 and consultancy_id = $2", [input.templateId, a.consultancyId])).rows[0];
  if (!t) notFound();
  let answers: unknown = null; let status = "pending";
  if (input.answers) {
    const v = validateAnswers(t.fields, input.answers);
    if (!v.ok) return json({ error: "Respostas inválidas", errors: v.errors }, 400);
    answers = v.clean; status = "done";
  }
  const id = uid();
  await ctx.db.transaction(async (tx) => {
    await tx.query(
      `insert into assessments (id, consultancy_id, student_id, template_id, template_name, fields, answers, status, requested_by, filled_by, submitted_at)
       values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10, ${status === "done" ? "now()" : "null"})`,
      [id, a.consultancyId, ctx.params.id, t.id, t.name, JSON.stringify(t.fields), answers === null ? null : JSON.stringify(answers), status, a.userId, status === "done" ? "trainer" : null]);
    await audit(tx, a, "assessment.create", { assessmentId: id, studentId: ctx.params.id, template: t.name, status });
  });
  return json({ id, status }, 201);
});

const LIST_COLS = `id, template_name as "templateName", status, filled_by as "filledBy", created_at as "createdAt", submitted_at as "submittedAt"`;

export const listStudentAssessments = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  if (!uuid.safeParse(ctx.params.id).success) notFound();
  await assertStudent(ctx.db, a, ctx.params.id);
  const { rows } = await ctx.db.query(`select ${LIST_COLS} from assessments where consultancy_id = $1 and student_id = $2 order by created_at desc`, [a.consultancyId, ctx.params.id]);
  return json(rows);
});

export const myAssessments = route(async (ctx) => {
  const a = await requireActor(ctx, "student");
  const { rows } = await ctx.db.query(`select ${LIST_COLS} from assessments where student_id = $1 order by created_at desc`, [a.userId]);
  return json(rows);
});

/** Dado de saúde: só o aluno dono e o personal da consultoria. A leitura pelo personal fica na auditoria. */
export const getAssessment = route(async (ctx) => {
  const a = await requireActor(ctx);
  if (!uuid.safeParse(ctx.params.id).success) notFound();
  const { rows } = await ctx.db.query<{ id: string; student_id: string; template_id: string; template_name: string; fields: Field[]; answers: Record<string, any> | null; status: string; filled_by: string | null; created_at: string; submitted_at: string | null }>(
    `select id, student_id, template_id, template_name, fields, answers, status, filled_by, created_at, submitted_at from assessments
      where id = $1 and (($2 = 'trainer' and consultancy_id = $3) or ($2 = 'student' and student_id = $4))`,
    [ctx.params.id, a.role, a.consultancyId, a.userId]);
  const r = rows[0]; if (!r) notFound();
  let deltas: Record<string, number | null> | null = null;
  if (r.answers) {
    const prev = (await ctx.db.query<{ answers: Record<string, any> }>(
      `select answers from assessments where student_id = $1 and template_id = $2 and status = 'done' and submitted_at < $3 and id <> $4 order by submitted_at desc limit 1`,
      [r.student_id, r.template_id, r.submitted_at, r.id])).rows[0];
    deltas = numericDeltas(r.fields, r.answers, prev?.answers ?? null);
  }
  if (a.role === "trainer") await audit(ctx.db, a, "assessment.view", { assessmentId: r.id, studentId: r.student_id });
  return json({ id: r.id, studentId: r.student_id, templateName: r.template_name, fields: r.fields, answers: r.answers, status: r.status, filledBy: r.filled_by, createdAt: r.created_at, submittedAt: r.submitted_at, deltas });
});

export const submitAssessment = route(async (ctx) => {
  const a = await requireActor(ctx, "student");
  if (!uuid.safeParse(ctx.params.id).success) notFound();
  const input = await body(ctx, z.object({ answers: z.record(z.string(), z.unknown()) }));
  const r = (await ctx.db.query<{ id: string; fields: Field[]; status: string }>("select id, fields, status from assessments where id = $1 and student_id = $2", [ctx.params.id, a.userId])).rows[0];
  if (!r) notFound();
  if (r.status !== "pending") throw new HttpError(409, "Esta avaliação já foi respondida");
  const v = validateAnswers(r.fields, input.answers);
  if (!v.ok) return json({ error: "Respostas inválidas", errors: v.errors }, 400);
  const upd = await ctx.db.query("update assessments set answers = $2::jsonb, status = 'done', filled_by = 'student', submitted_at = now() where id = $1 and status = 'pending' returning id", [r.id, JSON.stringify(v.clean)]);
  if (upd.rows.length === 0) throw new HttpError(409, "Esta avaliação já foi respondida");
  await audit(ctx.db, a, "assessment.submit", { assessmentId: r.id });
  return json({ ok: true });
});

// ====================================================================== Check-ins

interface Cfg { frequencyDays: number; questionIds: string[] }

async function effectiveConfig(db: Db, consultancyId: string, studentId: string): Promise<Cfg & { scope: "student" | "consultancy" | "default" }> {
  const rows = (await db.query<{ student_id: string | null; frequency_days: number; question_ids: string[] }>(
    "select student_id, frequency_days, question_ids from checkin_configs where consultancy_id = $1 and (student_id = $2 or student_id is null)", [consultancyId, studentId])).rows;
  const mine = rows.find((r) => r.student_id === studentId), def = rows.find((r) => r.student_id === null);
  const pick = mine ?? def;
  return pick ? { frequencyDays: pick.frequency_days, questionIds: pick.question_ids, scope: mine ? "student" : "consultancy" } : { frequencyDays: DEFAULT_FREQUENCY_DAYS, questionIds: DEFAULT_QUESTION_IDS, scope: "default" };
}

const DISCLAIMER = "Questionário ilustrativo, sem finalidade diagnóstica. Ele ajuda o seu personal a revisar o seu treino.";

export const getMyCheckin = route(async (ctx) => {
  const a = await requireActor(ctx, "student");
  const cfg = await effectiveConfig(ctx.db, a.consultancyId, a.userId);
  const last = (await ctx.db.query<{ id: string; created_at: string; answers: any; flags: Flag[] }>(
    "select id, created_at, answers, flags from checkins where student_id = $1 order by created_at desc limit 1", [a.userId])).rows[0] ?? null;
  const due = dueStatus(last ? new Date(last.created_at).toISOString() : null, cfg.frequencyDays, new Date());
  return json({ questions: questionsFor(cfg.questionIds), frequencyDays: cfg.frequencyDays, ...due, last: last && { id: last.id, createdAt: last.created_at, answers: last.answers }, disclaimer: DISCLAIMER });
});

export const postMyCheckin = route(async (ctx) => {
  const a = await requireActor(ctx, "student");
  const input = await body(ctx, z.object({ id: uuid.optional(), answers: z.record(z.string(), z.unknown()) }));
  const cfg = await effectiveConfig(ctx.db, a.consultancyId, a.userId);
  const v = validateAnswers(questionsFor(cfg.questionIds), input.answers);
  if (!v.ok) return json({ error: "Respostas inválidas", errors: v.errors }, 400);
  const id = input.id ?? uid();
  await ctx.db.query(
    "insert into checkins (id, consultancy_id, student_id, answers, flags) values ($1,$2,$3,$4::jsonb,$5::jsonb) on conflict (id) do nothing",
    [id, a.consultancyId, a.userId, JSON.stringify(v.clean), JSON.stringify(computeFlags(v.clean))]);
  const mine = await ctx.db.query("select 1 from checkins where id = $1 and student_id = $2", [id, a.userId]);
  if (mine.rows.length === 0) notFound(); // id de outro aluno
  return json({ id }, 201);
});

/** Painel do personal: quem precisa de atenção primeiro; quem está com check-in atrasado. */
export const listCheckins = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const students = (await ctx.db.query<{ id: string; name: string }>(
    "select u.id, u.name from memberships m join users u on u.id = m.user_id where m.consultancy_id = $1 and m.role = 'student'", [a.consultancyId])).rows;
  const latest = (await ctx.db.query<{ student_id: string; id: string; created_at: string; answers: any; flags: Flag[] }>(
    `select distinct on (student_id) student_id, id, created_at, answers, flags from checkins where consultancy_id = $1 order by student_id, created_at desc`, [a.consultancyId])).rows;
  const out = [];
  for (const s of students) {
    const l = latest.find((x) => x.student_id === s.id) ?? null;
    const cfg = await effectiveConfig(ctx.db, a.consultancyId, s.id);
    const due = dueStatus(l ? new Date(l.created_at).toISOString() : null, cfg.frequencyDays, new Date());
    out.push({ studentId: s.id, name: s.name, last: l && { id: l.id, createdAt: l.created_at, answers: l.answers }, flags: l?.flags ?? [], priority: priority(l?.flags ?? []), overdue: due.due, frequencyDays: cfg.frequencyDays });
  }
  out.sort((x, y) => y.priority - x.priority || Number(y.overdue) - Number(x.overdue) || x.name.localeCompare(y.name, "pt-BR"));
  return json(out);
});

export const listStudentCheckins = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  if (!uuid.safeParse(ctx.params.id).success) notFound();
  await assertStudent(ctx.db, a, ctx.params.id);
  const { rows } = await ctx.db.query(`select id, created_at as "createdAt", answers, flags from checkins where consultancy_id = $1 and student_id = $2 order by created_at desc limit 52`, [a.consultancyId, ctx.params.id]);
  const cfg = await effectiveConfig(ctx.db, a.consultancyId, ctx.params.id);
  return json({ checkins: rows, questions: questionsFor(cfg.questionIds), config: cfg });
});

const configInput = z.object({ frequencyDays: z.number().int().min(1).max(30), questionIds: z.array(z.string()).min(1).refine((ids) => ids.every((i) => DEFAULT_QUESTION_IDS.includes(i)), { message: "Pergunta desconhecida" }) });

/** Sem :id = padrão da consultoria; com :id = configuração só daquele aluno. */
export const getCheckinConfig = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const sid = ctx.params.id ?? null;
  if (sid) { if (!uuid.safeParse(sid).success) notFound(); await assertStudent(ctx.db, a, sid); }
  const cfg = sid ? await effectiveConfig(ctx.db, a.consultancyId, sid) : await effectiveConfig(ctx.db, a.consultancyId, "00000000-0000-0000-0000-000000000000");
  return json({ ...cfg, available: DEFAULT_QUESTION_IDS });
});

export const putCheckinConfig = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const sid = ctx.params.id ?? null;
  if (sid) { if (!uuid.safeParse(sid).success) notFound(); await assertStudent(ctx.db, a, sid); }
  const input = await body(ctx, configInput);
  await ctx.db.transaction(async (tx) => {
    await tx.query("delete from checkin_configs where consultancy_id = $1 and student_id is not distinct from $2::uuid", [a.consultancyId, sid]);
    await tx.query("insert into checkin_configs (id, consultancy_id, student_id, frequency_days, question_ids) values ($1,$2,$3,$4,$5::jsonb)",
      [uid(), a.consultancyId, sid, input.frequencyDays, JSON.stringify(input.questionIds)]);
    await audit(tx, a, "checkin.config", { studentId: sid, frequencyDays: input.frequencyDays, questions: input.questionIds.length });
  });
  return json(input);
});

// ========================================================================== Chat

const MAX_MSG = 2000;
const MAX_PER_MINUTE = 30;

/** Conversa individual: o aluno só vê a própria; o personal, as dos alunos da sua consultoria. */
async function threadOwner(ctx: { db: Db; params: Record<string, string> }, a: Actor): Promise<string> {
  if (a.role === "student") return a.userId;
  const sid = ctx.params.studentId ?? "";
  if (!uuid.safeParse(sid).success) notFound();
  await assertStudent(ctx.db, a, sid);
  return sid;
}

async function readThread(db: Db, a: Actor, studentId: string) {
  const { rows } = await db.query<{ id: string; sender_id: string; sender_name: string; body: string; exercise_id: string | null; exercise_name: string | null; created_at: string; read_at: string | null }>(
    `select * from (
       select m.id, m.sender_id, u.name as sender_name, m.body, m.exercise_id, m.exercise_name, m.created_at, m.read_at
         from messages m join users u on u.id = m.sender_id
        where m.consultancy_id = $1 and m.student_id = $2 order by m.created_at desc limit 200) t
     order by created_at asc`, [a.consultancyId, studentId]);
  return rows.map((m) => ({
    id: m.id, mine: m.sender_id === a.userId, senderName: m.sender_name, body: m.body,
    exercise: m.exercise_id ? { id: m.exercise_id, name: m.exercise_name } : null, createdAt: m.created_at, readAt: m.read_at,
  }));
}

export const getThread = route(async (ctx) => {
  const a = await requireActor(ctx);
  const sid = await threadOwner(ctx, a);
  return json(await readThread(ctx.db, a, sid));
});

export const postMessage = route(async (ctx) => {
  const a = await requireActor(ctx);
  const sid = await threadOwner(ctx, a);
  const input = await body(ctx, z.object({ id: uuid.optional(), body: z.string().trim().min(1).max(MAX_MSG), exerciseId: uuid.nullish() }));
  const id = input.id ?? uid();
  const existing = await ctx.db.query<{ sender_id: string; student_id: string }>("select sender_id, student_id from messages where id = $1", [id]);
  if (existing.rows[0]) { // reenvio com o mesmo id: não duplica; id alheio: não encontrado
    if (existing.rows[0].sender_id !== a.userId || existing.rows[0].student_id !== sid) notFound();
    return json({ id }, 200);
  }
  const recent = await ctx.db.query<{ n: number }>("select count(*)::int as n from messages where sender_id = $1 and created_at > now() - interval '1 minute'", [a.userId]);
  if (recent.rows[0].n >= MAX_PER_MINUTE) throw new HttpError(429, "Muitas mensagens em pouco tempo. Aguarde um instante.");
  let exName: string | null = null;
  if (input.exerciseId) exName = (await accessibleExercise(ctx.db, a, input.exerciseId)).name; // vínculo com exercício da ficha
  await ctx.db.query(
    "insert into messages (id, consultancy_id, student_id, sender_id, body, exercise_id, exercise_name) values ($1,$2,$3,$4,$5,$6,$7)",
    [id, a.consultancyId, sid, a.userId, input.body, input.exerciseId ?? null, exName]);
  return json({ id }, 201);
});

export const markThreadRead = route(async (ctx) => {
  const a = await requireActor(ctx);
  const sid = await threadOwner(ctx, a);
  await ctx.db.query("update messages set read_at = now() where consultancy_id = $1 and student_id = $2 and sender_id <> $3 and read_at is null", [a.consultancyId, sid, a.userId]);
  return json({ ok: true });
});

export const listConversations = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const { rows } = await ctx.db.query(
    `select u.id as "studentId", u.name,
            (select m.body from messages m where m.consultancy_id = $1 and m.student_id = u.id order by m.created_at desc limit 1) as "lastBody",
            (select m.created_at from messages m where m.consultancy_id = $1 and m.student_id = u.id order by m.created_at desc limit 1) as "lastAt",
            (select count(*)::int from messages m where m.consultancy_id = $1 and m.student_id = u.id and m.sender_id = u.id and m.read_at is null) as unread
       from memberships mb join users u on u.id = mb.user_id
      where mb.consultancy_id = $1 and mb.role = 'student'
      order by "lastAt" desc nulls last, u.name`, [a.consultancyId]);
  return json(rows);
});

export const unreadCount = route(async (ctx) => {
  const a = await requireActor(ctx);
  const { rows } = await ctx.db.query<{ n: number }>(
    a.role === "student"
      ? "select count(*)::int as n from messages where student_id = $1 and sender_id <> $1 and read_at is null"
      : "select count(*)::int as n from messages where consultancy_id = $1 and sender_id = student_id and read_at is null",
    a.role === "student" ? [a.userId] : [a.consultancyId]);
  return json({ count: rows[0].n });
});
