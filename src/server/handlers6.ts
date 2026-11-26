// Organização do personal: quadro de tarefas (A fazer / Em andamento / Concluído) e sugestões derivadas de dados reais.
// NÃO é agenda: o prazo é só uma data opcional em texto. Tudo é escopado pela consultoria; aluno não acessa (403).
import { z } from "zod";
import { dateKey } from "../lib/billing";
import { TASK_STATUSES, TASK_TAGS, type Suggestion } from "../lib/tasks";
import { uid } from "./auth";
import type { Actor } from "./auth";
import type { Db } from "./db";
import { assertStudent, audit } from "./handlers";
import { body, HttpError, json, notFound, requireActor, route } from "./http";

const uuid = z.string().uuid();
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD");
const title = z.string().trim().min(1, "Informe um título").max(140);
const tag = z.enum(TASK_TAGS);
const status = z.enum(TASK_STATUSES);

interface Row { id: string; title: string; tag: string; status: string; student_id: string | null; student_name: string | null; due_date: string | null; position: number }
const COLS = "t.id, t.title, t.tag, t.status, t.student_id, u.name as student_name, t.due_date, t.position";
const FROM = "tasks t left join users u on u.id = t.student_id";
const out = (r: Row) => ({ id: r.id, title: r.title, tag: r.tag, status: r.status, studentId: r.student_id, studentName: r.student_name, dueDate: r.due_date, position: r.position });

async function nextPosition(db: Db, consultancyId: string, st: string): Promise<number> {
  const r = await db.query<{ n: number }>("select coalesce(max(position) + 1, 0)::int as n from tasks where consultancy_id = $1 and status = $2", [consultancyId, st]);
  return r.rows[0].n;
}

async function loadTask(db: Db, a: Actor, id: string): Promise<Row> {
  if (!uuid.safeParse(id).success) notFound();
  const r = await db.query<Row>(`select ${COLS} from ${FROM} where t.id = $1 and t.consultancy_id = $2`, [id, a.consultancyId]);
  if (!r.rows[0]) notFound(); // tarefa de outra consultoria = inexistente
  return r.rows[0];
}

export const listTasks = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const { rows } = await ctx.db.query<Row>(`select ${COLS} from ${FROM} where t.consultancy_id = $1 order by t.status, t.position, t.created_at`, [a.consultancyId]);
  return json(rows.map(out));
});

export const createTask = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const input = await body(ctx, z.object({ title, tag: tag.default("Outro"), status: status.default("todo"), studentId: uuid.nullish(), dueDate: ymd.nullish() }));
  if (input.studentId) await assertStudent(ctx.db, a, input.studentId);
  const id = uid();
  await ctx.db.query(
    "insert into tasks (id, consultancy_id, title, tag, status, student_id, due_date, position, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [id, a.consultancyId, input.title, input.tag, input.status, input.studentId ?? null, input.dueDate ?? null, await nextPosition(ctx.db, a.consultancyId, input.status), a.userId]);
  await audit(ctx.db, a, "task.create", { taskId: id, tag: input.tag });
  return json({ id }, 201);
});

export const updateTask = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const cur = await loadTask(ctx.db, a, ctx.params.id);
  const input = await body(ctx, z.object({ title: title.optional(), tag: tag.optional(), status: status.optional(), studentId: uuid.nullable().optional(), dueDate: ymd.nullable().optional(), position: z.number().int().min(0).max(100000).optional() }).strict());
  if (input.studentId) await assertStudent(ctx.db, a, input.studentId);
  const nextStatus = input.status ?? cur.status;
  const position = input.position ?? (nextStatus !== cur.status ? await nextPosition(ctx.db, a.consultancyId, nextStatus) : cur.position);
  await ctx.db.query(
    `update tasks set title = $3, tag = $4, status = $5, student_id = $6, due_date = $7, position = $8, updated_at = now() where id = $1 and consultancy_id = $2`,
    [cur.id, a.consultancyId, input.title ?? cur.title, input.tag ?? cur.tag, nextStatus,
      input.studentId === undefined ? cur.student_id : input.studentId, input.dueDate === undefined ? cur.due_date : input.dueDate, position]);
  return json({ ok: true });
});

export const deleteTask = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const cur = await loadTask(ctx.db, a, ctx.params.id);
  await ctx.db.query("delete from tasks where id = $1 and consultancy_id = $2", [cur.id, a.consultancyId]);
  await audit(ctx.db, a, "task.delete", { taskId: cur.id, tag: cur.tag });
  return json({ ok: true });
});

/** Grava a ordem das colunas de uma vez (arrastar e soltar). Todos os ids precisam ser da consultoria. */
export const reorderTasks = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const input = await body(ctx, z.object({ items: z.array(z.object({ id: uuid, status, position: z.number().int().min(0).max(100000) })).min(1).max(300) }));
  const ids = [...new Set(input.items.map((i) => i.id))];
  if (ids.length !== input.items.length) throw new HttpError(400, "Cartão repetido");
  const found = await ctx.db.query<{ n: number }>("select count(*)::int as n from tasks where consultancy_id = $1 and id = any($2::uuid[])", [a.consultancyId, ids]);
  if (found.rows[0].n !== ids.length) notFound();
  await ctx.db.transaction(async (tx) => {
    for (const i of input.items) await tx.query("update tasks set status = $3, position = $4, updated_at = now() where id = $1 and consultancy_id = $2", [i.id, a.consultancyId, i.status, i.position]);
  });
  return json({ ok: true });
});

// ------------------------------------------------------------------ Sugestões

/** Sugestões derivadas de dados reais da consultoria. Quem já virou tarefa (mesmo concluída) não volta. */
export async function computeSuggestions(db: Db, a: Actor, now = new Date()): Promise<Suggestion[]> {
  const c = a.consultancyId;
  const out: Suggestion[] = [];

  const checkins = await db.query<{ id: string; student_id: string; name: string; flags: { reason: string }[] }>(
    `select ck.id, ck.student_id, u.name, ck.flags from checkins ck join users u on u.id = ck.student_id
      where ck.consultancy_id = $1 and ck.created_at > $2 and jsonb_array_length(ck.flags) > 0 order by ck.created_at desc`,
    [c, new Date(now.getTime() - 14 * 86400000)]);
  for (const r of checkins.rows) out.push({ key: `checkin:${r.id}`, title: `Revisar check-in de ${r.name}`, tag: "Check-in", studentId: r.student_id, studentName: r.name, reason: r.flags.map((f) => f.reason).join("; ") });

  const notrain = await db.query<{ id: string; name: string }>(
    `select u.id, u.name from memberships m join users u on u.id = m.user_id
      where m.consultancy_id = $1 and m.role = 'student'
        and not exists (select 1 from programs p join program_versions pv on pv.program_id = p.id where p.student_id = u.id and pv.status = 'published')
      order by u.name`, [c]);
  for (const r of notrain.rows) out.push({ key: `notrain:${r.id}`, title: `Publicar treino para ${r.name}`, tag: "Treino", studentId: r.id, studentName: r.name, reason: "Aluno sem treino publicado" });

  const last = await db.query<{ id: string; student_id: string; sender_id: string; created_at: Date; name: string }>(
    `select distinct on (m.student_id) m.id, m.student_id, m.sender_id, m.created_at, u.name
       from messages m join users u on u.id = m.student_id where m.consultancy_id = $1 order by m.student_id, m.created_at desc`, [c]);
  for (const r of last.rows) {
    if (r.sender_id === r.student_id && now.getTime() - new Date(r.created_at).getTime() > 86400000) {
      out.push({ key: `msg:${r.student_id}:${r.id}`, title: `Responder mensagem de ${r.name}`, tag: "Conversa", studentId: r.student_id, studentName: r.name, reason: "Mensagem sem resposta há mais de 24 h" });
    }
  }

  const pending = await db.query<{ id: string; student_id: string; name: string; template_name: string }>(
    `select a.id, a.student_id, u.name, a.template_name from assessments a join users u on u.id = a.student_id
      where a.consultancy_id = $1 and a.status = 'pending' order by a.created_at`, [c]);
  for (const r of pending.rows) out.push({ key: `assess:${r.id}`, title: `Cobrar avaliação “${r.template_name}” de ${r.name}`, tag: "Avaliação", studentId: r.student_id, studentName: r.name, reason: "Avaliação enviada e ainda não respondida" });

  const late = await db.query<{ id: string; student_id: string; name: string; due_date: string }>(
    `select ch.id, ch.student_id, u.name, ch.due_date from student_charges ch join users u on u.id = ch.student_id
      where ch.consultancy_id = $1 and (ch.status = 'overdue' or (ch.status = 'pending' and ch.due_date < $2)) order by ch.due_date`, [c, dateKey(now)]);
  for (const r of late.rows) out.push({ key: `overdue:${r.id}`, title: `Cobrança em atraso: ${r.name}`, tag: "Financeiro", studentId: r.student_id, studentName: r.name, reason: `Venceu em ${r.due_date.split("-").reverse().join("/")}` });

  const taken = new Set((await db.query<{ source_key: string }>("select source_key from tasks where consultancy_id = $1 and source_key is not null", [c])).rows.map((r) => r.source_key));
  return out.filter((s) => !taken.has(s.key));
}

export const listSuggestions = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  return json(await computeSuggestions(ctx.db, a));
});

/** Um clique: cria a tarefa a partir de uma sugestão válida (recalculada no servidor). Repetir não duplica (409). */
export const acceptSuggestion = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const input = await body(ctx, z.object({ key: z.string().min(3).max(200) }));
  const s = (await computeSuggestions(ctx.db, a)).find((x) => x.key === input.key);
  if (!s) throw new HttpError(409, "Esta sugestão não existe mais ou já virou tarefa");
  const id = uid();
  await ctx.db.query(
    "insert into tasks (id, consultancy_id, title, tag, status, student_id, position, source_key, created_by) values ($1,$2,$3,$4,'todo',$5,$6,$7,$8)",
    [id, a.consultancyId, s.title, s.tag, s.studentId, await nextPosition(ctx.db, a.consultancyId, "todo"), s.key, a.userId]);
  await audit(ctx.db, a, "task.create", { taskId: id, tag: s.tag, suggestion: true });
  return json({ id }, 201);
});
