import { beforeAll, describe, expect, it } from "vitest";
import { getDb, resetDb } from "../src/server/db";
import { DEFAULT_PERMISSIONS, PERMISSION_KEYS } from "../src/lib/permissions";
import { call, h, inviteStudent, registerTrainer, setPerms, uuid } from "./helpers";

// Opção C: o personal define as permissões de cada aluno. O aluno SEMPRE registra o que fez.
let alfa: string, beta: string;
let ex: Record<string, any> = {};
const wk = (o: any = {}) => ({ reps: 10, loadKg: 40, ...o });

interface World { s: { cookie: string; id: string }; v: string; log: string; ves: string[]; sets: string[] }

/** Cria um aluno com treino publicado (supino com alternativa autorizada + remada) e um registro aberto. */
async function world(label: string, perms: Record<string, boolean> = {}): Promise<World> {
  const s = await inviteStudent(alfa, label);
  if (Object.keys(perms).length) await setPerms(alfa, s.id, perms);
  const v = (await call(h.createVersion, {
    cookie: alfa,
    body: {
      studentId: s.id, name: "Treino A", publish: true,
      exercises: [
        { exerciseId: ex["Supino reto"].id, alternativeIds: [ex["Supino inclinado com halteres"].id], sets: [wk(), wk()] },
        { exerciseId: ex["Remada curvada"].id, sets: [wk()] },
      ],
    },
  })).body.id;
  const d = (await call(h.getVersion, { cookie: s.cookie, params: { id: v } })).body;
  const log = (await call(h.startLog, { body: {}, cookie: s.cookie, params: { id: v } })).body.id;
  return { s, v, log, ves: d.exercises.map((e: any) => e.id), sets: d.exercises.flatMap((e: any) => e.sets.map((x: any) => x.id)) };
}

const putSet = (w: World, body: any, setId = uuid()) =>
  call(h.putLoggedSet, { method: "PUT", cookie: w.s.cookie, params: { id: w.log, setId }, body });
const order = (w: World, ids: string[]) => call(h.putOrder, { method: "PUT", cookie: w.s.cookie, params: { id: w.log }, body: { order: ids } });
const substitute = (w: World, veId: string, exerciseId: string | null) =>
  call(h.putSubstitution, { method: "PUT", cookie: w.s.cookie, params: { id: w.log, veId }, body: { exerciseId } });
const addExtra = (w: World, exerciseId: string, id?: string) =>
  call(h.postExtraExercise, { cookie: w.s.cookie, params: { id: w.log }, body: { exerciseId, id } });

beforeAll(async () => {
  await resetDb();
  alfa = await registerTrainer("alfa");
  beta = await registerTrainer("beta");
  const cat = (await call(h.listExercises, { cookie: alfa })).body as any[];
  ex = Object.fromEntries(cat.map((e) => [e.name, e]));
});

describe("configuração das permissões (personal)", () => {
  it("padrão do protótipo: 5 de 9 habilitadas", async () => {
    const s = await inviteStudent(alfa, "padrao");
    const p = (await call(h.getStudentPermissions, { cookie: alfa, params: { id: s.id } })).body;
    expect(p).toEqual(DEFAULT_PERMISSIONS);
    expect(PERMISSION_KEYS).toHaveLength(9);
    expect(Object.values(p).filter(Boolean)).toHaveLength(5);
    expect((await call(h.getMyPermissions, { cookie: s.cookie })).body).toEqual(DEFAULT_PERMISSIONS);
  });

  it("é individual por aluno e fica na auditoria (só o que mudou)", async () => {
    const a = await inviteStudent(alfa, "ind-a");
    const b = await inviteStudent(alfa, "ind-b");
    expect((await setPerms(alfa, a.id, { substituteFree: true, adjustRest: false })).status).toBe(200);
    expect((await call(h.getStudentPermissions, { cookie: alfa, params: { id: a.id } })).body).toMatchObject({ substituteFree: true, adjustRest: false });
    expect((await call(h.getStudentPermissions, { cookie: alfa, params: { id: b.id } })).body).toEqual(DEFAULT_PERMISSIONS);
    const log = (await call(h.listAudit, { cookie: alfa })).body.find((x: any) => x.action === "student.permissions");
    expect(log.detail.studentId).toBe(a.id);
    expect(Object.keys(log.detail.changed).sort()).toEqual(["adjustRest", "substituteFree"]);
    // Sem mudança, sem nova entrada.
    const before = (await call(h.listAudit, { cookie: alfa })).body.length;
    await setPerms(alfa, a.id, {});
    expect((await call(h.listAudit, { cookie: alfa })).body.length).toBe(before);
  });

  it("rejeita corpo inválido", async () => {
    const s = await inviteStudent(alfa, "inv");
    const cur = (await call(h.getStudentPermissions, { cookie: alfa, params: { id: s.id } })).body;
    const put = (body: any) => call(h.putStudentPermissions, { method: "PUT", cookie: alfa, params: { id: s.id }, body });
    expect((await put({ ...cur, reorder: "sim" })).status).toBe(400);
    expect((await put({ ...cur, inventada: true })).status).toBe(400);
    expect((await put({ reorder: true })).status).toBe(400);
  });

  it("só o personal da consultoria configura; aluno e outra consultoria não", async () => {
    const s = await inviteStudent(alfa, "acl");
    const put = (cookie: string) => call(h.putStudentPermissions, { method: "PUT", cookie, params: { id: s.id }, body: DEFAULT_PERMISSIONS });
    expect((await put(s.cookie)).status).toBe(403); // o próprio aluno não se autoriza
    expect((await put(beta)).status).toBe(404);
    expect((await call(h.getStudentPermissions, { cookie: beta, params: { id: s.id } })).status).toBe(404);
    expect((await call(h.getStudentPermissions, { cookie: s.cookie, params: { id: s.id } })).status).toBe(403);
    expect((await call(h.getMyPermissions, { cookie: alfa })).status).toBe(403);
    expect((await call(h.getMyPermissions, {})).status).toBe(401);
  });
});

describe("sempre permitido: registrar o realizado, mesmo sem nenhuma permissão", () => {
  it("aluno sem permissões registra, e a prescrição segue intacta", async () => {
    const none = Object.fromEntries(PERMISSION_KEYS.map((k) => [k, false]));
    const w = await world("nenhuma", none);
    const r = await putSet(w, { versionSetId: w.sets[0], reps: 9, loadKg: 42.5, rir: 1, note: "ok" });
    expect(r.status).toBe(200);
    expect((await call(h.finishLog, { cookie: w.s.cookie, params: { id: w.log }, body: {} })).status).toBe(200);
    const d = (await call(h.getVersion, { cookie: alfa, params: { id: w.v } })).body;
    expect(d.exercises[0].sets[0]).toMatchObject({ reps: 10, loadKg: 40 });
    // E nenhuma adaptação é aceita.
    expect((await order(w, [w.ves[1], w.ves[0]])).status).toBe(403);
    expect((await substitute(w, w.ves[0], ex["Supino inclinado com halteres"].id)).status).toBe(403);
    expect((await addExtra(w, ex["Rosca direta"].id)).status).toBe(403);
    expect((await putSet(w, { versionExerciseId: w.ves[0], position: 1, reps: 5 })).status).toBe(403);
    expect((await putSet(w, { versionSetId: w.sets[1], reps: 10, restS: 90 })).status).toBe(403);
  });
});

describe("alterar a ordem dos exercícios", () => {
  it("com permissão (padrão): salva a ordem sem tocar na prescrição", async () => {
    const w = await world("ordem");
    expect((await order(w, [w.ves[1], w.ves[0]])).status).toBe(200);
    const logs = (await call(h.listLogs, { cookie: w.s.cookie, params: { id: w.v } })).body;
    expect(logs[0].exerciseOrder).toEqual([w.ves[1], w.ves[0]]);
    const d = (await call(h.getVersion, { cookie: w.s.cookie, params: { id: w.v } })).body;
    expect(d.exercises.map((e: any) => e.id)).toEqual(w.ves); // prescrita inalterada
  });
  it("exige permutação exata dos exercícios do treino", async () => {
    const w = await world("ordem2");
    expect((await order(w, [w.ves[0]])).status).toBe(400);
    expect((await order(w, [w.ves[0], w.ves[0]])).status).toBe(400);
    expect((await order(w, [w.ves[0], uuid()])).status).toBe(400);
  });
  it("revogada: bloqueia", async () => {
    const w = await world("ordem3", { reorder: false });
    expect((await order(w, [w.ves[1], w.ves[0]])).status).toBe(403);
  });
});

describe("substituir exercícios", () => {
  const alt = () => ex["Supino inclinado com halteres"].id;
  it("autorizado: só alternativas definidas pelo personal", async () => {
    const w = await world("sub1");
    expect((await substitute(w, w.ves[0], alt())).status).toBe(200);
    expect((await substitute(w, w.ves[0], ex["Rosca direta"].id)).status).toBe(403); // fora da lista
    expect((await substitute(w, w.ves[1], alt())).status).toBe(403); // remada não tem alternativas
    const logs = (await call(h.listLogs, { cookie: w.s.cookie, params: { id: w.v } })).body;
    expect(logs[0].substitutions).toEqual([{ versionExerciseId: w.ves[0], exerciseId: alt(), name: "Supino inclinado com halteres" }]);
  });
  it("voltar ao prescrito é sempre permitido", async () => {
    const w = await world("sub2");
    await substitute(w, w.ves[0], alt());
    await setPerms(alfa, w.s.id, { substituteAuthorized: false });
    expect((await substitute(w, w.ves[0], null)).status).toBe(200);
    expect((await call(h.listLogs, { cookie: w.s.cookie, params: { id: w.v } })).body[0].substitutions).toEqual([]);
  });
  it("sem a permissão de autorizados, nem as alternativas valem", async () => {
    const w = await world("sub3", { substituteAuthorized: false });
    expect((await substitute(w, w.ves[0], alt())).status).toBe(403);
  });
  it("livre: qualquer exercício da biblioteca, mas só os acessíveis à consultoria", async () => {
    const w = await world("sub4", { substituteAuthorized: false, substituteFree: true });
    expect((await substitute(w, w.ves[1], ex["Rosca direta"].id)).status).toBe(200);
    // exercício próprio de outra consultoria não existe para esta
    const db = await getDb();
    const own = uuid();
    const cid = (await db.query<{ consultancy_id: string }>("select m.consultancy_id from memberships m join users u on u.id = m.user_id where u.email = 'beta@teste.com'")).rows[0].consultancy_id;
    await db.query("insert into exercises (id, consultancy_id, name, muscle, equipment) values ($1,$2,'Só da Beta','x','x')", [own, cid]);
    expect((await substitute(w, w.ves[1], own)).status).toBe(400);
    expect((await substitute(w, w.ves[1], uuid())).status).toBe(400);
  });
  it("não substitui exercício de outro treino", async () => {
    const w = await world("sub5");
    const other = await world("sub6");
    expect((await substitute(w, other.ves[0], alt())).status).toBe(400);
  });
});

describe("adicionar exercícios e séries extras", () => {
  it("exercício extra: com permissão, idempotente, com séries próprias", async () => {
    const w = await world("extra1", { addExercises: true });
    const id = uuid();
    const a1 = await addExtra(w, ex["Rosca direta"].id, id);
    const a2 = await addExtra(w, ex["Rosca direta"].id, id);
    expect(a1.status).toBe(201);
    expect(a2.body).toMatchObject({ id, position: 1 });
    expect((await putSet(w, { extraExerciseId: id, position: 1, reps: 12, loadKg: 20 })).status).toBe(200);
    expect((await putSet(w, { extraExerciseId: id, position: 2, reps: 10, loadKg: 20 })).status).toBe(200);
    const log = (await call(h.listLogs, { cookie: w.s.cookie, params: { id: w.v } })).body[0];
    expect(log.extraExercises).toHaveLength(1);
    expect(log.sets.filter((s: any) => s.extraExerciseId === id)).toHaveLength(2);
    // Não altera a prescrição.
    expect((await call(h.getVersion, { cookie: alfa, params: { id: w.v } })).body.exercises).toHaveLength(2);
  });
  it("reenviar a série extra não duplica", async () => {
    const w = await world("extra2", { addExercises: true });
    const id = uuid();
    await addExtra(w, ex["Rosca direta"].id, id);
    const sid = uuid();
    for (let i = 0; i < 3; i++) expect((await putSet(w, { extraExerciseId: id, position: 1, reps: 12 }, sid)).status).toBe(200);
    const db = await getDb();
    expect((await db.query<{ n: number }>("select count(*)::int n from logged_sets where extra_exercise_id = $1", [id])).rows[0].n).toBe(1);
  });
  it("exercício extra de outro aluno não aceita séries", async () => {
    const w = await world("extra3", { addExercises: true });
    const o = await world("extra4", { addExercises: true });
    const id = uuid();
    await addExtra(o, ex["Rosca direta"].id, id);
    expect((await putSet(w, { extraExerciseId: id, position: 1, reps: 1 })).status).toBe(400);
    expect((await addExtra(w, ex["Rosca direta"].id, id)).status).toBe(404); // id alheio
  });
  it("série extra de exercício prescrito exige 'alterar séries'", async () => {
    const w = await world("extra5", { editSets: true });
    expect((await putSet(w, { versionExerciseId: w.ves[0], position: 1, reps: 8, loadKg: 40 })).status).toBe(200);
    expect((await putSet(w, { versionExerciseId: w.ves[0], position: 1, reps: 9, loadKg: 40 })).status).toBe(200); // atualiza, não duplica
    const db = await getDb();
    expect((await db.query<{ n: number }>("select count(*)::int n from logged_sets where log_id = $1 and version_exercise_id = $2", [w.log, w.ves[0]])).rows[0].n).toBe(1);
    expect((await putSet(w, { versionExerciseId: uuid(), position: 1, reps: 1 })).status).toBe(400);
  });
  it("destino da série é obrigatório e único", async () => {
    const w = await world("extra6", { editSets: true });
    expect((await putSet(w, { reps: 5 })).status).toBe(400);
    expect((await putSet(w, { versionSetId: w.sets[0], versionExerciseId: w.ves[0], position: 1, reps: 5 })).status).toBe(400);
    expect((await putSet(w, { versionExerciseId: w.ves[0], reps: 5 })).status).toBe(400); // sem posição
  });
});

describe("ajustar descanso, volume e histórico", () => {
  it("descanso realizado só com permissão e aparece na comparação", async () => {
    const w = await world("rest");
    expect((await putSet(w, { versionSetId: w.sets[0], reps: 10, loadKg: 40, restS: 75 })).status).toBe(200);
    await setPerms(alfa, w.s.id, { adjustRest: false });
    expect((await putSet(w, { versionSetId: w.sets[1], reps: 10, restS: 75 })).status).toBe(403);
    expect((await putSet(w, { versionSetId: w.sets[1], reps: 10 })).status).toBe(200); // sem descanso, segue valendo
  });
  it("volume: aluno só com a permissão; nunca de treino alheio", async () => {
    const w = await world("vol");
    const o = await world("vol2");
    const vol = (cookie: string, id: string) => call(h.getVolume, { cookie, params: { id } });
    expect((await vol(w.s.cookie, w.v)).status).toBe(403);
    await setPerms(alfa, w.s.id, { viewVolume: true });
    const r = await vol(w.s.cookie, w.v);
    expect(r.status).toBe(200);
    expect(r.body.muscles.find((m: any) => m.muscle === "Peitoral").direct).toBe(2);
    expect((await vol(w.s.cookie, o.v)).status).toBe(404);
    expect((await vol(beta, w.v)).status).toBe(404);
  });
  it("histórico: sem a permissão, versões anteriores ficam inacessíveis (salvo as já usadas)", async () => {
    const s = await inviteStudent(alfa, "hist");
    const make = async (publish = true) => (await call(h.createVersion, {
      cookie: alfa, body: { studentId: s.id, name: "H", publish, exercises: [{ exerciseId: ex["Supino reto"].id, sets: [wk()] }] } })).body.id;
    const v1 = await make();
    const n = await call(h.newVersion, { body: {}, cookie: alfa, params: { id: v1 } });
    await call(h.publishVersion, { body: {}, cookie: alfa, params: { id: n.body.id } });
    // Padrão: histórico liberado.
    expect((await call(h.listVersions, { cookie: s.cookie })).body.map((x: any) => x.version).sort()).toEqual([1, 2]);
    expect((await call(h.getVersion, { cookie: s.cookie, params: { id: v1 } })).status).toBe(200);
    await setPerms(alfa, s.id, { viewHistory: false });
    expect((await call(h.listVersions, { cookie: s.cookie })).body.map((x: any) => x.version)).toEqual([2]);
    expect((await call(h.getVersion, { cookie: s.cookie, params: { id: v1 } })).status).toBe(404);
    expect((await call(h.listLogs, { cookie: s.cookie, params: { id: v1 } })).status).toBe(404);
    expect((await call(h.getVersion, { cookie: s.cookie, params: { id: n.body.id } })).status).toBe(200);
  });
});

describe("alternativas autorizadas na prescrição", () => {
  it("são salvas, copiadas na nova versão e validadas", async () => {
    const s = await inviteStudent(alfa, "alt");
    const base = (alternativeIds: string[]) => ({
      studentId: s.id, name: "A", publish: true,
      exercises: [{ exerciseId: ex["Supino reto"].id, alternativeIds, sets: [wk()] }],
    });
    const bad = await call(h.createVersion, { cookie: alfa, body: base([ex["Supino reto"].id]) });
    expect(bad.status).toBe(400); // alternativa = o próprio exercício
    expect((await call(h.createVersion, { cookie: alfa, body: base([uuid()]) })).status).toBe(400); // inexistente
    const ok = await call(h.createVersion, { cookie: alfa, body: base([ex["Supino inclinado com halteres"].id, ex["Crucifixo"].id]) });
    expect(ok.status).toBe(201);
    const d = (await call(h.getVersion, { cookie: s.cookie, params: { id: ok.body.id } })).body;
    expect(d.exercises[0].alternatives.map((a: any) => a.name).sort()).toEqual(["Crucifixo", "Supino inclinado com halteres"]);
    const v2 = await call(h.newVersion, { body: {}, cookie: alfa, params: { id: ok.body.id } });
    const d2 = (await call(h.getVersion, { cookie: alfa, params: { id: v2.body.id } })).body;
    expect(d2.exercises[0].alternativeIds).toHaveLength(2);
    // Alternativa de outra consultoria é recusada.
    const db = await getDb();
    const own = uuid();
    const cid = (await db.query<{ consultancy_id: string }>("select m.consultancy_id from memberships m join users u on u.id = m.user_id where u.email = 'beta@teste.com'")).rows[0].consultancy_id;
    await db.query("insert into exercises (id, consultancy_id, name, muscle, equipment) values ($1,$2,'Alt Beta','x','x')", [own, cid]);
    expect((await call(h.createVersion, { cookie: alfa, body: base([own]) })).status).toBe(400);
  });
});

describe("comparação: prescrito, adaptado e realizado ficam distinguíveis", () => {
  it("mostra ordem, substituição, exercício extra, série extra e descanso", async () => {
    const w = await world("cmp", { addExercises: true, editSets: true, substituteAuthorized: true });
    await order(w, [w.ves[1], w.ves[0]]);
    await substitute(w, w.ves[0], ex["Supino inclinado com halteres"].id);
    const xid = uuid();
    await addExtra(w, ex["Rosca direta"].id, xid);
    await putSet(w, { extraExerciseId: xid, position: 1, reps: 12, loadKg: 20 });
    await putSet(w, { versionExerciseId: w.ves[0], position: 1, reps: 6, loadKg: 40 });
    await putSet(w, { versionSetId: w.sets[0], reps: 10, loadKg: 40, restS: 75 });

    const cmp = (await call(h.comparison, { cookie: alfa, params: { id: w.v } })).body;
    const l = cmp.logs[0];
    expect(l.adaptations.originalOrder).toEqual(["Supino reto", "Remada curvada"]);
    expect(l.adaptations.adaptedOrder).toEqual(["Remada curvada", "Supino reto"]);
    expect(l.adaptations.substitutions).toEqual([{ prescribed: "Supino reto", performed: "Supino inclinado com halteres" }]);
    expect(l.adaptations.extraExercises[0]).toMatchObject({ name: "Rosca direta", sets: [expect.objectContaining({ reps: 12, loadKg: 20 })] });
    expect(l.adaptations.extraSets[0]).toMatchObject({ exerciseName: "Supino reto", performedName: "Supino inclinado com halteres", reps: 6 });
    // O prescrito continua separado do realizado.
    const row = l.rows[0];
    expect(row.prescribed).toMatchObject({ reps: 10, loadKg: 40 });
    expect(row.performedName).toBe("Supino inclinado com halteres");
    expect(row.done).toMatchObject({ reps: 10, restS: 75 });
    // Séries extras não entram como "prescritas".
    expect(l.rows).toHaveLength(3);
  });
});
