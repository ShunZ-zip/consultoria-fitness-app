import { beforeAll, describe, expect, it } from "vitest";
import * as h3 from "../src/server/handlers3";
import { getDb, resetDb } from "../src/server/db";
import { call, h, inviteStudent, registerTrainer, setPerms, uuid } from "./helpers";

let alfa: string, beta: string;
let ex: Record<string, any> = {};
const wk = (o: any = {}) => ({ reps: 10, loadKg: 40, ...o });

/** Aluno com programa publicado (supino + remada), frequência semanal opcional. */
async function world(label: string, weeklyFrequency?: number, sets?: any[]) {
  const s = await inviteStudent(alfa, label);
  const v = (await call(h.createVersion, {
    cookie: alfa,
    body: {
      studentId: s.id, name: "Treino A", publish: true, weeklyFrequency,
      exercises: [
        { exerciseId: ex["Supino reto"].id, alternativeIds: [ex["Supino inclinado com halteres"].id], sets: sets ?? [wk(), wk(), wk()] },
        { exerciseId: ex["Remada curvada"].id, sets: [wk({ loadKg: 50 })] },
      ],
    },
  })).body.id as string;
  const d = (await call(h.getVersion, { cookie: s.cookie, params: { id: v } })).body;
  return { s, v, d, sets: d.exercises[0].sets.map((x: any) => x.id) as string[], rowSet: d.exercises[1].sets[0].id as string, ves: d.exercises.map((e: any) => e.id) as string[] };
}
type W = Awaited<ReturnType<typeof world>>;

/** Uma sessão concluída com a mesma carga em todas as séries do supino; `daysAgo` ajusta a data do registro. */
async function session(w: W, loadKg: number, reps = 10, daysAgo = 0, finish = true) {
  const log = (await call(h.startLog, { body: {}, cookie: w.s.cookie, params: { id: w.v } })).body.id as string;
  for (const sid of w.sets) await call(h.putLoggedSet, { method: "PUT", cookie: w.s.cookie, params: { id: log, setId: uuid() }, body: { versionSetId: sid, reps, loadKg } });
  if (finish) await call(h.finishLog, { cookie: w.s.cookie, params: { id: log }, body: {} });
  if (daysAgo) await (await getDb()).query("update workout_logs set started_at = now() - ($2 || ' days')::interval where id = $1", [log, String(daysAgo)]);
  return log;
}
const evoOf = async (cookie: string, studentId: string) => (await call(h3.getStudentEvolution, { cookie, params: { id: studentId } }));

beforeAll(async () => {
  await resetDb();
  alfa = await registerTrainer("alfa");
  beta = await registerTrainer("beta");
  const cat = (await call(h.listExercises, { cookie: alfa })).body as any[];
  ex = Object.fromEntries(cat.map((e) => [e.name, e]));
});

describe("evolução: carga, 1RM estimada, recordes e aderência", () => {
  let w: W;
  beforeAll(async () => {
    w = await world("evo", 3);
    await session(w, 50, 10, 14);
    await session(w, 52.5, 10, 7);
    await session(w, 55, 10, 0);
  });

  it("um ponto por sessão, com a variação de carga e de 1RM", async () => {
    const r = await evoOf(alfa, w.s.id);
    expect(r.status).toBe(200);
    const sup = r.body.exercises.find((e: any) => e.name === "Supino reto");
    expect(sup.points.map((p: any) => p.topLoad)).toEqual([50, 52.5, 55]);
    expect(sup.change).toMatchObject({ loadKg: 5 });
    expect(sup.bestE1rm.value).toBe(73.3); // 55 × (1 + 10/30)
    expect(sup.heaviest).toMatchObject({ loadKg: 55, reps: 10 });
  });
  it("recordes pessoais e sessões concluídas", async () => {
    const r = (await evoOf(alfa, w.s.id)).body;
    expect(r.summary.sessionsCompleted).toBe(3);
    expect(r.summary.records).toBe(2); // 2ª e 3ª sessões superam a melhor 1RM anterior (a 1ª é a base)
  });
  it("aderência = concluídas / previstas (frequência × semanas) e taxa de séries da prescrição", async () => {
    const r = (await evoOf(alfa, w.s.id)).body.summary;
    expect(r.sessionsPlanned).toBeGreaterThanOrEqual(3);
    expect(r.adherencePct).toBe(Math.min(100, Math.round((3 / r.sessionsPlanned) * 100)));
    expect(r.completionPct).toBe(Math.round((9 / 12) * 100)); // 3 sessões × 3 séries de supino feitas, de 4 prescritas por sessão (remada não feita)
    expect(r.note).toMatch(/hipertrofia/);
  });
  it("sem frequência semanal, não inventa aderência", async () => {
    const x = await world("semfreq");
    await session(x, 40);
    const r = (await evoOf(alfa, x.s.id)).body.summary;
    expect(r).toMatchObject({ sessionsCompleted: 1, sessionsPlanned: null, adherencePct: null });
  });
  it("registro não concluído não conta como sessão", async () => {
    const x = await world("aberto", 2);
    await session(x, 40, 10, 0, false);
    expect((await evoOf(alfa, x.s.id)).body.summary.sessionsCompleted).toBe(0);
  });
  it("aquecimento e preparação não entram na evolução", async () => {
    const x = await world("aq", 2, [{ setType: "warmup", reps: 5, loadKg: 100 }, wk({ loadKg: 60 })]);
    await session(x, 61);
    const sup = (await evoOf(alfa, x.s.id)).body.exercises.find((e: any) => e.name === "Supino reto");
    expect(sup.points[0].sets).toBe(1);
    expect(sup.points[0].topLoad).toBe(61);
  });
  it("conta o exercício efetivamente executado (substituição e exercício extra)", async () => {
    const x = await world("sub", 2);
    await setPerms(alfa, x.s.id, { addExercises: true });
    const log = (await call(h.startLog, { body: {}, cookie: x.s.cookie, params: { id: x.v } })).body.id;
    await call(h.putSubstitution, { method: "PUT", cookie: x.s.cookie, params: { id: log, veId: x.ves[0] }, body: { exerciseId: ex["Supino inclinado com halteres"].id } });
    await call(h.putLoggedSet, { method: "PUT", cookie: x.s.cookie, params: { id: log, setId: uuid() }, body: { versionSetId: x.sets[0], reps: 10, loadKg: 30 } });
    const xid = uuid();
    await call(h.postExtraExercise, { cookie: x.s.cookie, params: { id: log }, body: { id: xid, exerciseId: ex["Rosca direta"].id } });
    await call(h.putLoggedSet, { method: "PUT", cookie: x.s.cookie, params: { id: log, setId: uuid() }, body: { extraExerciseId: xid, position: 1, reps: 12, loadKg: 20 } });
    const names = (await evoOf(alfa, x.s.id)).body.exercises.map((e: any) => e.name).sort();
    expect(names).toEqual(["Rosca direta", "Supino inclinado com halteres"]);
  });
});

describe("evolução: acesso", () => {
  let w: W, other: W;
  beforeAll(async () => {
    w = await world("acc1", 3); other = await world("acc2", 3);
    await session(w, 50); await session(other, 90);
  });
  it("o aluno vê só a própria evolução", async () => {
    const r = await call(h3.getMyEvolution, { cookie: w.s.cookie });
    expect(r.status).toBe(200);
    expect(r.body.exercises.find((e: any) => e.name === "Supino reto").points[0].topLoad).toBe(50); // não mistura os 90 kg do outro aluno
  });
  it("exige a permissão 'consultar treinos anteriores'", async () => {
    await setPerms(alfa, other.s.id, { viewHistory: false });
    expect((await call(h3.getMyEvolution, { cookie: other.s.cookie })).status).toBe(403);
  });
  it("personal da própria consultoria vê; outra consultoria não; aluno não usa a rota do personal", async () => {
    expect((await evoOf(alfa, w.s.id)).status).toBe(200);
    expect((await evoOf(beta, w.s.id)).status).toBe(404);
    expect((await evoOf(w.s.cookie, other.s.id)).status).toBe(403);
    expect((await call(h3.getMyEvolution, { cookie: alfa })).status).toBe(403);
    expect((await call(h3.getMyEvolution, {})).status).toBe(401);
  });
});

describe("último treino durante o registro", () => {
  it("mostra a última sessão concluída de cada exercício; não mistura alunos nem sessões abertas", async () => {
    const w = await world("last1", 3); const o = await world("last2", 3);
    await session(w, 50, 10, 7); await session(w, 57.5, 8, 0); await session(o, 99);
    await session(w, 70, 5, 0, false); // aberta: não conta
    const r = await call(h3.getLastTraining, { cookie: w.s.cookie, params: { id: w.v } });
    expect(r.status).toBe(200);
    expect(r.body[w.ves[0]].sets).toHaveLength(3);
    expect(r.body[w.ves[0]].best).toEqual({ reps: 8, loadKg: 57.5 });
    expect(r.body[w.ves[1]]).toBeUndefined(); // remada nunca feita
    expect((await call(h3.getLastTraining, { cookie: o.s.cookie, params: { id: w.v } })).status).toBe(404); // treino do outro aluno
    expect((await call(h3.getLastTraining, { cookie: alfa, params: { id: w.v } })).status).toBe(403);
  });
});

describe("frequência semanal do programa", () => {
  it("valida, edita no rascunho e é copiada ao duplicar e ao versionar", async () => {
    const s = await inviteStudent(alfa, "freq");
    const base = (f: any) => ({ studentId: s.id, name: "F", weeklyFrequency: f, exercises: [{ exerciseId: ex["Supino reto"].id, sets: [wk()] }] });
    expect((await call(h.createVersion, { cookie: alfa, body: base(0) })).status).toBe(400);
    expect((await call(h.createVersion, { cookie: alfa, body: base(8) })).status).toBe(400);
    const c = await call(h.createVersion, { cookie: alfa, body: base(4) });
    expect((await call(h.getVersion, { cookie: alfa, params: { id: c.body.id } })).body.weeklyFrequency).toBe(4);
    await call(h.updateDraft, { method: "PUT", cookie: alfa, params: { id: c.body.id }, body: { weeklyFrequency: 2, exercises: [{ exerciseId: ex["Supino reto"].id, sets: [wk()] }] } });
    expect((await call(h.getVersion, { cookie: alfa, params: { id: c.body.id } })).body.weeklyFrequency).toBe(2);
    const dup = await call(h.duplicateVersion, { body: {}, cookie: alfa, params: { id: c.body.id } });
    expect((await call(h.getVersion, { cookie: alfa, params: { id: dup.body.id } })).body.weeklyFrequency).toBe(2);
    await call(h.publishVersion, { body: {}, cookie: alfa, params: { id: c.body.id } });
    const nv = await call(h.newVersion, { body: {}, cookie: alfa, params: { id: c.body.id } });
    expect((await call(h.getVersion, { cookie: alfa, params: { id: nv.body.id } })).body.weeklyFrequency).toBe(2);
    await call(h.updateDraft, { method: "PUT", cookie: alfa, params: { id: nv.body.id }, body: { weeklyFrequency: null, exercises: [{ exerciseId: ex["Supino reto"].id, sets: [wk()] }] } });
    expect((await call(h.getVersion, { cookie: alfa, params: { id: nv.body.id } })).body.weeklyFrequency).toBeNull();
  });
});

describe("sincronização: reenviar a sessão offline inteira não duplica nada", () => {
  it("a mesma sequência de operações aplicada várias vezes (reenvio após perda de resposta) dá o mesmo resultado", async () => {
    const w = await world("sync", 3);
    await setPerms(alfa, w.s.id, { addExercises: true, editSets: true });
    // Tudo gerado no cliente, como a fila offline faz.
    const logId = uuid(), xid = uuid(), setIds = w.sets.map(() => uuid()), extraSetId = uuid(), xSetId = uuid();
    const ops: (() => Promise<{ status: number }>)[] = [
      () => call(h.startLog, { body: { id: logId }, cookie: w.s.cookie, params: { id: w.v } }),
      ...w.sets.map((sid, i) => () => call(h.putLoggedSet, { method: "PUT", cookie: w.s.cookie, params: { id: logId, setId: setIds[i] }, body: { versionSetId: sid, reps: 10 - i, loadKg: 40, restS: 80 } })),
      () => call(h.putOrder, { method: "PUT", cookie: w.s.cookie, params: { id: logId }, body: { order: [w.ves[1], w.ves[0]] } }),
      () => call(h.putSubstitution, { method: "PUT", cookie: w.s.cookie, params: { id: logId, veId: w.ves[0] }, body: { exerciseId: ex["Supino inclinado com halteres"].id } }),
      () => call(h.postExtraExercise, { cookie: w.s.cookie, params: { id: logId }, body: { id: xid, exerciseId: ex["Rosca direta"].id } }),
      () => call(h.putLoggedSet, { method: "PUT", cookie: w.s.cookie, params: { id: logId, setId: xSetId }, body: { extraExerciseId: xid, position: 1, reps: 12, loadKg: 20 } }),
      () => call(h.putLoggedSet, { method: "PUT", cookie: w.s.cookie, params: { id: logId, setId: extraSetId }, body: { versionExerciseId: w.ves[0], position: 1, reps: 6, loadKg: 40 } }),
      () => call(h.finishLog, { cookie: w.s.cookie, params: { id: logId }, body: { note: "ok" } }),
    ];
    for (let round = 0; round < 3; round++) for (const op of ops) expect([200, 201]).toContain((await op()).status);

    const db = await getDb();
    const n = async (sql: string, p: unknown[]) => (await db.query<{ n: number }>(sql, p)).rows[0].n;
    expect(await n("select count(*)::int n from workout_logs where student_id = $1", [w.s.id])).toBe(1);
    expect(await n("select count(*)::int n from logged_sets where log_id = $1", [logId])).toBe(w.sets.length + 2); // prescritas + 1 extra + 1 de exercício extra
    expect(await n("select count(*)::int n from log_extra_exercises where log_id = $1", [logId])).toBe(1);
    expect(await n("select count(*)::int n from log_substitutions where log_id = $1", [logId])).toBe(1);
    const log = (await call(h.listLogs, { cookie: w.s.cookie, params: { id: w.v } })).body[0];
    expect(log.exerciseOrder).toEqual([w.ves[1], w.ves[0]]);
    expect(log.finishedAt).toBeTruthy();
  });
});
