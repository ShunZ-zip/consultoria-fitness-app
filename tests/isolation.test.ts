import { beforeAll, describe, expect, it } from "vitest";
import { getDb, resetDb } from "../src/server/db";
import { call, firstExercises, h, inviteStudent, publishWorkout, registerTrainer, uuid } from "./helpers";

// Consultoria Alfa: personal + alunos A1 e A2. Consultoria Beta: personal + aluno B1.
let alfa: string, beta: string;
let a1: { cookie: string; id: string; token: string };
let a2: { cookie: string; id: string };
let b1: { cookie: string; id: string };
let vA1: string;      // treino publicado do A1
let draftA1: string;  // rascunho do A1
let logA1: string;    // registro do A1
let setA1: string;    // série prescrita do A1
let loggedSetId: string;

beforeAll(async () => {
  await resetDb();
  alfa = await registerTrainer("alfa");
  beta = await registerTrainer("beta");
  a1 = await inviteStudent(alfa, "a1");
  a2 = await inviteStudent(alfa, "a2");
  b1 = await inviteStudent(beta, "b1");
  vA1 = await publishWorkout(alfa, a1.id);
  draftA1 = await publishWorkout(alfa, a1.id, false);
  logA1 = (await call(h.startLog, { body: {}, cookie: a1.cookie, params: { id: vA1 } })).body.id;
  const detail = (await call(h.getVersion, { cookie: a1.cookie, params: { id: vA1 } })).body;
  setA1 = detail.exercises[0].sets[0].id;
  loggedSetId = uuid();
  const r = await call(h.putLoggedSet, {
    method: "PUT", cookie: a1.cookie, params: { id: logA1, setId: loggedSetId },
    body: { versionSetId: setA1, reps: 10, loadKg: 40 },
  });
  expect(r.status).toBe(200);
});

describe("aluno não acessa dados de outro aluno (mesma consultoria)", () => {
  it("não lê o treino do outro", async () => {
    expect((await call(h.getVersion, { cookie: a2.cookie, params: { id: vA1 } })).status).toBe(404);
  });
  it("não lista o treino do outro", async () => {
    expect((await call(h.listVersions, { cookie: a2.cookie })).body).toHaveLength(0);
  });
  it("não lê registros do outro", async () => {
    expect((await call(h.listLogs, { cookie: a2.cookie, params: { id: vA1 } })).status).toBe(404);
  });
  it("não inicia registro no treino do outro", async () => {
    expect((await call(h.startLog, { body: {}, cookie: a2.cookie, params: { id: vA1 } })).status).toBe(404);
  });
  it("não grava série no registro do outro", async () => {
    const r = await call(h.putLoggedSet, {
      method: "PUT", cookie: a2.cookie, params: { id: logA1, setId: uuid() },
      body: { versionSetId: setA1, reps: 99 },
    });
    expect(r.status).toBe(404);
  });
  it("não sobrescreve série do outro reaproveitando o id", async () => {
    const own = await publishWorkout(alfa, a2.id);
    const ownLog = (await call(h.startLog, { body: {}, cookie: a2.cookie, params: { id: own } })).body.id;
    const ownSet = (await call(h.getVersion, { cookie: a2.cookie, params: { id: own } })).body.exercises[0].sets[0].id;
    const r = await call(h.putLoggedSet, {
      method: "PUT", cookie: a2.cookie, params: { id: ownLog, setId: loggedSetId },
      body: { versionSetId: ownSet, reps: 1 },
    });
    expect(r.status).toBe(404);
    const db = await getDb();
    const { rows } = await db.query<{ reps: number }>("select reps from logged_sets where id = $1", [loggedSetId]);
    expect(rows[0].reps).toBe(10);
  });
  it("não finaliza registro do outro", async () => {
    expect((await call(h.finishLog, { cookie: a2.cookie, params: { id: logA1 }, body: {} })).status).toBe(404);
  });
  it("não reutiliza o id de registro do outro", async () => {
    const own = await publishWorkout(alfa, a2.id);
    expect((await call(h.startLog, { body: { id: logA1 }, cookie: a2.cookie, params: { id: own } })).status).toBe(404);
  });
});

describe("aluno não acessa a área do personal nem de outra consultoria", () => {
  it("não usa endpoints de personal", async () => {
    expect((await call(h.listStudents, { cookie: a1.cookie })).status).toBe(403);
    expect((await call(h.listInvites, { cookie: a1.cookie })).status).toBe(403);
    expect((await call(h.createInvite, { body: { studentName: "x" }, cookie: a1.cookie })).status).toBe(403);
    expect((await call(h.comparison, { cookie: a1.cookie, params: { id: vA1 } })).status).toBe(403);
    expect((await call(h.publishVersion, { body: {}, cookie: a1.cookie, params: { id: draftA1 } })).status).toBe(403);
  });
  it("não cria nem altera treino", async () => {
    const [e1] = await firstExercises(a1.cookie, 1);
    const r = await call(h.createVersion, {
      cookie: a1.cookie,
      body: { studentId: a1.id, name: "meu", publish: true, exercises: [{ exerciseId: e1, sets: [{ reps: 5 }] }] },
    });
    expect(r.status).toBe(403);
  });
  it("aluno de outra consultoria não vê nada de Alfa", async () => {
    expect((await call(h.getVersion, { cookie: b1.cookie, params: { id: vA1 } })).status).toBe(404);
    expect((await call(h.listVersions, { cookie: b1.cookie })).body).toHaveLength(0);
  });
  it("não vê rascunho nem o próprio, antes de publicar", async () => {
    expect((await call(h.getVersion, { cookie: a1.cookie, params: { id: draftA1 } })).status).toBe(404);
    expect((await call(h.startLog, { body: {}, cookie: a1.cookie, params: { id: draftA1 } })).status).toBe(404);
  });
});

describe("personal só acessa a própria consultoria", () => {
  it("não vê treino nem comparação de outra consultoria", async () => {
    expect((await call(h.getVersion, { cookie: beta, params: { id: vA1 } })).status).toBe(404);
    expect((await call(h.comparison, { cookie: beta, params: { id: vA1 } })).status).toBe(404);
    expect((await call(h.publishVersion, { body: {}, cookie: beta, params: { id: draftA1 } })).status).toBe(404);
    expect((await call(h.listVersions, { cookie: beta })).body).toHaveLength(0);
  });
  it("não lista nem prescreve para aluno de outra consultoria", async () => {
    const students = (await call(h.listStudents, { cookie: beta })).body.map((s: any) => s.id);
    expect(students).toEqual([b1.id]);
    const [e1] = await firstExercises(beta, 1);
    const r = await call(h.createVersion, {
      cookie: beta,
      body: { studentId: a1.id, name: "x", exercises: [{ exerciseId: e1, sets: [{ reps: 5 }] }] },
    });
    expect(r.status).toBe(404);
  });
});

describe("autenticação e convites", () => {
  it("sem sessão: 401", async () => {
    expect((await call(h.me)).status).toBe(401);
    expect((await call(h.listVersions)).status).toBe(401);
    expect((await call(h.getVersion, { params: { id: vA1 } })).status).toBe(401);
  });
  it("sessão inválida: 401", async () => {
    expect((await call(h.me, { cookie: "sid=invalido" })).status).toBe(401);
  });
  it("convite é de uso único", async () => {
    const again = await call(h.acceptInvite, {
      params: { token: a1.token },
      body: { name: "Intruso", email: "intruso@x.com", password: "senha-segura-1" },
    });
    expect(again.status).toBe(404);
    expect((await call(h.getInvite, { params: { token: a1.token } })).status).toBe(404);
  });
  it("convite expirado é recusado", async () => {
    const inv = await call(h.createInvite, { body: { studentName: "Velho" }, cookie: alfa });
    const db = await getDb();
    await db.query("update invites set expires_at = now() - interval '1 day' where student_name = 'Velho'");
    const r = await call(h.acceptInvite, {
      params: { token: inv.body.token },
      body: { name: "V", email: "velho@x.com", password: "senha-segura-1" },
    });
    expect(r.status).toBe(404);
  });
  it("token inventado é recusado", async () => {
    const r = await call(h.acceptInvite, {
      params: { token: "nao-existe" }, body: { name: "V", email: "v2@x.com", password: "senha-segura-1" },
    });
    expect(r.status).toBe(404);
  });
  it("o token do convite não fica salvo em texto no banco", async () => {
    const db = await getDb();
    const { rows } = await db.query("select 1 from invites where token_hash = $1", [a1.token]);
    expect(rows).toHaveLength(0);
  });
  it("escritas exigem JSON", async () => {
    const r = await call(h.createInvite, { body: { studentName: "x" }, cookie: alfa, json: false });
    expect(r.status).toBe(415);
  });
  it("login com senha errada: 401", async () => {
    expect((await call(h.login, { body: { email: "alfa@teste.com", password: "errada-errada" } })).status).toBe(401);
  });
});

describe("registro do realizado e prescrição publicada", () => {
  it("reenviar a mesma série não duplica", async () => {
    const setId = uuid();
    const detail = (await call(h.getVersion, { cookie: a1.cookie, params: { id: vA1 } })).body;
    const target = detail.exercises[1].sets[0].id;
    const send = () => call(h.putLoggedSet, {
      method: "PUT", cookie: a1.cookie, params: { id: logA1, setId }, body: { versionSetId: target, reps: 12, loadKg: 20 },
    });
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(200);
    const db = await getDb();
    const { rows } = await db.query<{ n: number }>(
      "select count(*)::int as n from logged_sets where log_id = $1 and version_set_id = $2", [logA1, target]);
    expect(rows[0].n).toBe(1);
  });
  it("reenviar o início do registro devolve o mesmo", async () => {
    const id = uuid();
    const one = await call(h.startLog, { body: { id }, cookie: a1.cookie, params: { id: vA1 } });
    const two = await call(h.startLog, { body: { id }, cookie: a1.cookie, params: { id: vA1 } });
    expect(one.body.id).toBe(two.body.id);
  });
  it("rejeita série de outro treino", async () => {
    const other = await publishWorkout(alfa, a1.id);
    const otherSet = (await call(h.getVersion, { cookie: a1.cookie, params: { id: other } })).body.exercises[0].sets[0].id;
    const r = await call(h.putLoggedSet, {
      method: "PUT", cookie: a1.cookie, params: { id: logA1, setId: uuid() }, body: { versionSetId: otherSet, reps: 1 },
    });
    expect(r.status).toBe(400);
  });
  it("o banco impede alterar ou apagar prescrição publicada", async () => {
    const db = await getDb();
    await expect(db.query("update version_sets set reps = 99 where id = $1", [setA1])).rejects.toThrow(/imutavel/);
    await expect(db.query("delete from version_sets where id = $1", [setA1])).rejects.toThrow(/imutavel/);
    await expect(db.query("update version_exercises set exercise_name = 'x' where version_id = $1", [vA1])).rejects.toThrow(/imutavel/);
  });
  it("publicar duas vezes é recusado", async () => {
    expect((await call(h.publishVersion, { body: {}, cookie: alfa, params: { id: vA1 } })).status).toBe(409);
  });
});
