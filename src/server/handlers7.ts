// Entrega 6: IA assistiva POR REGRAS (sem provedor externo). Gera sugestões com evidências; só o personal decide.
// Aprovar cria um RASCUNHO de nova versão (nunca altera a versão publicada). O aluno não vê sugestões.
import { z } from "zod";
import { analyze, applyProposal, type AnalysisInput, type Proposal, type SessionObs } from "../lib/suggestions";
import { computeVolume } from "../lib/volume";
import { uid } from "./auth";
import type { Actor } from "./auth";
import type { Db } from "./db";
import { assertStudent, audit, createDraftFromVersion, indirectWeight, loadVersion, versionDetail, type VersionRow } from "./handlers";
import { HttpError, json, notFound, requireActor, route } from "./http";

const uuid = z.string().uuid();

interface SugRow { id: string; student_id: string; student_name: string; version_id: string; kind: string; status: string; title: string; rationale: string; evidence: unknown; proposal: Proposal | null; result_version_id: string | null; created_at: string; decided_at: string | null }
const COLS = "s.id, s.student_id, u.name as student_name, s.version_id, s.kind, s.status, s.title, s.rationale, s.evidence, s.proposal, s.result_version_id, s.created_at, s.decided_at";
const out = (r: SugRow) => ({ id: r.id, studentId: r.student_id, studentName: r.student_name, versionId: r.version_id, kind: r.kind, status: r.status, title: r.title, rationale: r.rationale, evidence: r.evidence, proposal: r.proposal, resultVersionId: r.result_version_id, createdAt: r.created_at, decidedAt: r.decided_at });

/** Monta os dados agregados que as regras puras analisam (sem nome, e-mail ou texto livre). */
async function buildInput(db: Db, a: Actor, v: VersionRow, now: Date): Promise<AnalysisInput> {
  const detail = await versionDetail(db, v);
  const fin = await db.query<{ n: number }>("select count(*)::int as n from workout_logs where version_id = $1 and finished_at is not null", [v.id]);
  const rows = (await db.query<{ log_id: string; at: Date; exercise_id: string; t_reps: number | null; t_max: number | null; t_rir: number | null; t_load: number | null; reps: number | null; load_kg: number | null; rir: number | null }>(
    `select l.id as log_id, l.started_at as at, ve.exercise_id, vs.reps as t_reps, vs.reps_max as t_max, vs.rir as t_rir, vs.load_kg as t_load, ls.reps, ls.load_kg, ls.rir
       from logged_sets ls join workout_logs l on l.id = ls.log_id
       join version_sets vs on vs.id = ls.version_set_id join version_exercises ve on ve.id = vs.version_exercise_id
      where l.version_id = $1 and l.finished_at is not null and vs.set_type = 'work' order by l.started_at, vs.position`, [v.id])).rows;
  const exercises = detail.exercises.map((e) => {
    const sessions = new Map<string, SessionObs>();
    for (const r of rows.filter((x) => x.exercise_id === e.exerciseId)) {
      const s = sessions.get(r.log_id) ?? { logId: r.log_id, date: new Date(r.at).toISOString(), sets: [] };
      s.sets.push({ reps: r.reps, loadKg: r.load_kg, rir: r.rir, targetReps: r.t_reps, targetRepsMax: r.t_max, targetRir: r.t_rir, targetLoadKg: r.t_load });
      sessions.set(r.log_id, s);
    }
    return { exerciseId: e.exerciseId, name: e.name, prescribedWorkSets: e.sets.filter((s) => s.setType === "work").length, sessions: [...sessions.values()] };
  });
  const checkins = (await db.query<{ at: Date; flags: { id: string; level: string; reason: string }[] }>(
    "select created_at as at, flags from checkins where student_id = $1 and consultancy_id = $2 and created_at > $3 order by created_at desc",
    [v.student_id, a.consultancyId, new Date(now.getTime() - 14 * 86400000)])).rows.map((c) => ({ date: new Date(c.at).toISOString(), flags: c.flags }));
  const muscles = computeVolume(detail.exercises.map((e) => ({ primary: e.primaryMuscles, secondary: e.secondaryMuscles, sets: e.sets })), await indirectWeight(db, a.consultancyId));
  return { finishedSessions: fin.rows[0].n, exercises, checkins, muscles };
}

/** Versões publicadas ATUAIS (uma por programa) do aluno. */
async function currentVersions(db: Db, a: Actor, studentId: string): Promise<VersionRow[]> {
  const ids = (await db.query<{ id: string }>(
    `select pv.id from program_versions pv join programs p on p.id = pv.program_id
      where p.student_id = $1 and p.consultancy_id = $2 and pv.status = 'published'
        and pv.version = (select max(x.version) from program_versions x where x.program_id = pv.program_id and x.status = 'published')`, [studentId, a.consultancyId])).rows;
  return Promise.all(ids.map((r) => loadVersion(db, a, r.id)));
}

/** Gera sugestões (idempotente: a mesma regra para o mesmo exercício e versão não se repete, nem depois de decidida). */
export const generateSuggestions = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  if (!uuid.safeParse(ctx.params.id).success) notFound();
  await assertStudent(ctx.db, a, ctx.params.id);
  const versions = await currentVersions(ctx.db, a, ctx.params.id);
  const results = [];
  let created = 0;
  for (const v of versions) {
    const res = analyze(await buildInput(ctx.db, a, v, new Date()));
    for (const s of res.suggestions) {
      const ins = await ctx.db.query(
        `insert into suggestions (id, consultancy_id, student_id, version_id, kind, dedupe_key, title, rationale, evidence, proposal)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb) on conflict (consultancy_id, student_id, version_id, kind, dedupe_key) do nothing returning id`,
        [uid(), a.consultancyId, ctx.params.id, v.id, s.kind, s.dedupeKey, s.title, s.rationale, JSON.stringify(s.evidence), s.proposal ? JSON.stringify(s.proposal) : null]);
      if (ins.rows.length) created++;
    }
    results.push({ versionId: v.id, programName: v.name, insufficient: res.insufficient });
  }
  if (created) await audit(ctx.db, a, "suggestion.generate", { studentId: ctx.params.id, created });
  return json({ created, noPublishedWorkout: versions.length === 0, versions: results });
});

export const listStudentSuggestions = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  if (!uuid.safeParse(ctx.params.id).success) notFound();
  await assertStudent(ctx.db, a, ctx.params.id);
  const { rows } = await ctx.db.query<SugRow>(
    `select ${COLS} from suggestions s join users u on u.id = s.student_id where s.consultancy_id = $1 and s.student_id = $2 order by (s.status = 'pending') desc, s.created_at desc limit 100`,
    [a.consultancyId, ctx.params.id]);
  return json(rows.map(out));
});

async function loadSuggestion(db: Db, a: Actor, id: string): Promise<SugRow> {
  if (!uuid.safeParse(id).success) notFound();
  const r = await db.query<SugRow>(`select ${COLS} from suggestions s join users u on u.id = s.student_id where s.id = $1 and s.consultancy_id = $2`, [id, a.consultancyId]);
  if (!r.rows[0]) notFound(); // sugestão de outra consultoria = inexistente
  return r.rows[0];
}

/** Aprovar: com proposta, cria um RASCUNHO da próxima versão com a mudança; sem proposta, só registra que o personal viu. */
export const approveSuggestion = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const s = await loadSuggestion(ctx.db, a, ctx.params.id);
  if (s.status !== "pending") throw new HttpError(409, "Esta sugestão já foi decidida");
  let draftId: string | null = null;
  if (s.proposal) {
    const v = await loadVersion(ctx.db, a, s.version_id);
    if (!v.is_current) throw new HttpError(409, "O treino mudou desde esta sugestão. Gere as sugestões de novo.");
    const open = await ctx.db.query("select 1 from program_versions where program_id = $1 and status = 'draft'", [v.program_id]);
    if (open.rows.length) throw new HttpError(409, "Já existe um rascunho deste treino. Publique ou ajuste o rascunho antes de aplicar a sugestão.");
    const d = await createDraftFromVersion(ctx.db, a, v, (items) => applyProposal(items, s.proposal!), { suggestionId: s.id });
    draftId = d.id;
  }
  await ctx.db.query("update suggestions set status = 'approved', decided_at = now(), decided_by = $2, result_version_id = $3 where id = $1 and status = 'pending'", [s.id, a.userId, draftId]);
  await audit(ctx.db, a, "suggestion.approve", { suggestionId: s.id, kind: s.kind, draftVersionId: draftId });
  return json({ ok: true, draftVersionId: draftId });
});

export const rejectSuggestion = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const s = await loadSuggestion(ctx.db, a, ctx.params.id);
  if (s.status !== "pending") throw new HttpError(409, "Esta sugestão já foi decidida");
  await ctx.db.query("update suggestions set status = 'rejected', decided_at = now(), decided_by = $2 where id = $1 and status = 'pending'", [s.id, a.userId]);
  await audit(ctx.db, a, "suggestion.reject", { suggestionId: s.id, kind: s.kind });
  return json({ ok: true });
});
