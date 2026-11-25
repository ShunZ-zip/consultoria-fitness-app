import { beforeAll, describe, expect, it } from "vitest";
import { getDb, resetDb } from "../src/server/db";
import { call, h, inviteStudent, registerTrainer, setPerms, uuid } from "./helpers";

let alfa: string, beta: string;
let a1: { cookie: string; id: string };
let a2: { cookie: string; id: string };
let b1: { cookie: string; id: string };
let ex: Record<string, any> = {};

const body = (studentId: string, exercises: any[], extra: any = {}) => ({ studentId, name: "Treino A", exercises, ...extra });
const wk = (o: any = {}) => ({ reps: 10, loadKg: 40, ...o });

async function create(cookie: string, studentId: string, exercises: any[], extra: any = {}) {
  return call(h.createVersion, { cookie, body: body(studentId, exercises, extra) });
}
const detail = async (cookie: string, id: string) => (await call(h.getVersion, { cookie, params: { id } })).body;

beforeAll(async () => {
  await resetDb();
  alfa = await registerTrainer("alfa");
  beta = await registerTrainer("beta");
  a1 = await inviteStudent(alfa, "a1");
  a2 = await inviteStudent(alfa, "a2");
  b1 = await inviteStudent(beta, "b1");
  const cat = (await call(h.listExercises, { cookie: alfa })).body as any[];
  ex = Object.fromEntries(cat.map((e) => [e.name, e]));
});

describe("catálogo e séries avançadas", () => {
  it("catálogo traz músculos primários e secundários", () => {
    expect(ex["Supino reto"].primaryMuscles).toEqual(["Peitoral"]);
    expect(ex["Supino reto"].secondaryMuscles).toEqual(["Deltoide anterior", "Tríceps"]);
  });

  it("guarda tipo, faixa de reps, % de 1RM, RPE, cadência e observação por série", async () => {
    const r = await create(alfa, a1.id, [{
      exerciseId: ex["Supino reto"].id,
      sets: [
        { setType: "warmup", reps: 12, loadPct: 40, restS: 45 },
        { setType: "prep", reps: 6, loadPct: 70, rpe: 6 },
        { setType: "work", reps: 8, repsMax: 12, loadPct: 80, rpe: 8.5, restS: 120, tempo: "3-1-1-0", note: "pausa no peito" },
      ],
    }]);
    expect(r.status).toBe(201);
    const sets = (await detail(alfa, r.body.id)).exercises[0].sets;
    expect(sets.map((s: any) => s.setType)).toEqual(["warmup", "prep", "work"]);
    expect(sets[2]).toMatchObject({ reps: 8, repsMax: 12, loadPct: 80, loadKg: null, rpe: 8.5, rir: null, tempo: "3-1-1-0", note: "pausa no peito" });
  });

  it("rejeita combinações inconsistentes", async () => {
    const bad = async (set: any) => (await create(alfa, a1.id, [{ exerciseId: ex["Supino reto"].id, sets: [set] }])).status;
    expect(await bad({ reps: 10, repsMax: 8 })).toBe(400);          // máx < mín
    expect(await bad({ repsMax: 12 })).toBe(400);                   // máx sem mín
    expect(await bad({ reps: 8, loadKg: 50, loadPct: 80 })).toBe(400); // kg e %
    expect(await bad({ reps: 8, rir: 2, rpe: 8 })).toBe(400);      // RIR e RPE
    expect(await bad({ reps: 8, rpe: 8.3 })).toBe(400);             // RPE em passos de 0,5
    expect(await bad({ reps: 8, setType: "outro" })).toBe(400);
  });
});

describe("rascunho, versões e histórico", () => {
  it("edita e reordena um rascunho; publicado não aceita edição", async () => {
    const r = await create(alfa, a1.id, [
      { exerciseId: ex["Supino reto"].id, sets: [wk()] },
      { exerciseId: ex["Remada curvada"].id, sets: [wk(), wk()] },
    ]);
    const id = r.body.id;
    const put = await call(h.updateDraft, {
      method: "PUT", cookie: alfa, params: { id },
      body: {
        name: "Treino renomeado",
        exercises: [
          { exerciseId: ex["Remada curvada"].id, sets: [wk({ reps: 12 })] },
          { exerciseId: ex["Supino reto"].id, sets: [wk(), wk(), wk()] },
        ],
      },
    });
    expect(put.status).toBe(200);
    const d = await detail(alfa, id);
    expect(d.name).toBe("Treino renomeado");
    expect(d.exercises.map((e: any) => e.name)).toEqual(["Remada curvada", "Supino reto"]);
    expect(d.exercises[1].sets).toHaveLength(3);

    await call(h.publishVersion, { body: {}, cookie: alfa, params: { id } });
    const again = await call(h.updateDraft, { method: "PUT", cookie: alfa, params: { id }, body: { exercises: [{ exerciseId: ex["Supino reto"].id, sets: [wk()] }] } });
    expect(again.status).toBe(409);
  });

  it("nova versão: o aluno só vê a atual; a anterior e seus registros ficam preservados", async () => {
    const s = await inviteStudent(alfa, "versao");
    await setPerms(alfa, s.id, { viewHistory: false }); // sem histórico: o aluno só vê a versão atual
    const v1 = (await create(alfa, s.id, [{ exerciseId: ex["Supino reto"].id, sets: [wk({ reps: 10 }), wk({ reps: 10 })] }], { publish: true })).body.id;

    // Aluno registra na v1.
    const log = (await call(h.startLog, { body: {}, cookie: s.cookie, params: { id: v1 } })).body.id;
    const setId = (await detail(s.cookie, v1)).exercises[0].sets[0].id;
    await call(h.putLoggedSet, { method: "PUT", cookie: s.cookie, params: { id: log, setId: uuid() }, body: { versionSetId: setId, reps: 9, loadKg: 40 } });
    await call(h.finishLog, { cookie: s.cookie, params: { id: log }, body: {} });

    // Personal cria a v2 (rascunho); repetir devolve o mesmo rascunho.
    const n1 = await call(h.newVersion, { body: {}, cookie: alfa, params: { id: v1 } });
    expect(n1.status).toBe(201);
    expect(n1.body).toMatchObject({ status: "draft", version: 2 });
    const n2 = await call(h.newVersion, { body: {}, cookie: alfa, params: { id: v1 } });
    expect(n2.body).toMatchObject({ id: n1.body.id, existing: true });

    // Rascunho da v2 invisível ao aluno; ele continua na v1.
    let list = (await call(h.listVersions, { cookie: s.cookie })).body;
    expect(list.map((x: any) => x.id)).toEqual([v1]);
    expect((await call(h.getVersion, { cookie: s.cookie, params: { id: n1.body.id } })).status).toBe(404);

    // Edita o rascunho (mais carga) e publica.
    const v2 = n1.body.id;
    expect((await detail(alfa, v2)).exercises[0].sets).toHaveLength(2); // cópia da v1
    await call(h.updateDraft, { method: "PUT", cookie: alfa, params: { id: v2 }, body: { exercises: [{ exerciseId: ex["Supino reto"].id, sets: [wk({ loadKg: 45 }), wk({ loadKg: 45 }), wk({ loadKg: 45 })] }] } });
    await call(h.publishVersion, { body: {}, cookie: alfa, params: { id: v2 } });

    // Agora o aluno vê só a v2; não abre novos registros na v1.
    list = (await call(h.listVersions, { cookie: s.cookie })).body;
    expect(list.map((x: any) => [x.id, x.version])).toEqual([[v2, 2]]);
    expect((await call(h.startLog, { body: {}, cookie: s.cookie, params: { id: v1 } })).status).toBe(409);
    expect((await call(h.startLog, { body: {}, cookie: s.cookie, params: { id: v2 } })).status).toBe(200);

    // A v1 continua intacta, com o registro original e a comparação.
    const old = await detail(alfa, v1);
    expect(old.exercises[0].sets).toHaveLength(2);
    expect(old.exercises[0].sets[0].loadKg).toBe(40);
    const cmp = await call(h.comparison, { cookie: alfa, params: { id: v1 } });
    expect(cmp.body.logs).toHaveLength(1);
    expect(cmp.body.logs[0].rows[0].done).toMatchObject({ reps: 9, loadKg: 40 });

    // Só se cria versão a partir da atual; a v1 já não é.
    expect((await call(h.newVersion, { body: {}, cookie: alfa, params: { id: v1 } })).status).toBe(409);
    // O banco continua impedindo mexer na v1.
    const db = await getDb();
    await expect(db.query("update version_sets set reps = 1 where id = $1", [setId])).rejects.toThrow(/imutavel/);
    // Auditoria registra a criação e as publicações.
    const actions = (await call(h.listAudit, { cookie: alfa })).body.map((x: any) => x.action);
    expect(actions).toEqual(expect.arrayContaining(["version.create", "version.publish"]));
  });

  it("nova versão exige treino publicado", async () => {
    const draft = (await create(alfa, a1.id, [{ exerciseId: ex["Supino reto"].id, sets: [wk()] }])).body.id;
    expect((await call(h.newVersion, { body: {}, cookie: alfa, params: { id: draft } })).status).toBe(409);
  });

  it("comparação respeita a faixa de repetições", async () => {
    const s = await inviteStudent(alfa, "faixa");
    const v = (await create(alfa, s.id, [{ exerciseId: ex["Supino reto"].id, sets: [wk({ reps: 8, repsMax: 12 }), wk({ reps: 8, repsMax: 12 }), wk({ reps: 8, repsMax: 12 })] }], { publish: true })).body.id;
    const log = (await call(h.startLog, { body: {}, cookie: s.cookie, params: { id: v } })).body.id;
    const sets = (await detail(s.cookie, v)).exercises[0].sets;
    for (const [i, reps] of [10, 14, 6].entries()) {
      await call(h.putLoggedSet, { method: "PUT", cookie: s.cookie, params: { id: log, setId: uuid() }, body: { versionSetId: sets[i].id, reps, loadKg: 40 } });
    }
    const rows = (await call(h.comparison, { cookie: alfa, params: { id: v } })).body.logs[0].rows;
    expect(rows.map((r: any) => r.diff.reps)).toEqual([0, 2, -2]); // dentro, acima do máx, abaixo do mín
  });
});

describe("duplicar", () => {
  it("duplica para o mesmo aluno ou outro da consultoria, como rascunho independente", async () => {
    const src = (await create(alfa, a1.id, [{ exerciseId: ex["Supino reto"].id, sets: [wk(), wk()] }], { publish: true })).body.id;
    const same = await call(h.duplicateVersion, { body: {}, cookie: alfa, params: { id: src } });
    expect(same.status).toBe(201);
    const d = await detail(alfa, same.body.id);
    expect(d).toMatchObject({ status: "draft", version: 1, studentId: a1.id });
    expect(d.name).toContain("(cópia)");
    expect(d.programId).not.toBe((await detail(alfa, src)).programId);

    const other = await call(h.duplicateVersion, { body: { studentId: a2.id, name: "Para o A2" }, cookie: alfa, params: { id: src } });
    expect((await detail(alfa, other.body.id))).toMatchObject({ studentId: a2.id, name: "Para o A2" });
  });
  it("não duplica para aluno de outra consultoria nem treino alheio", async () => {
    const src = (await create(alfa, a1.id, [{ exerciseId: ex["Supino reto"].id, sets: [wk()] }], { publish: true })).body.id;
    expect((await call(h.duplicateVersion, { body: { studentId: b1.id }, cookie: alfa, params: { id: src } })).status).toBe(404);
    expect((await call(h.duplicateVersion, { body: {}, cookie: beta, params: { id: src } })).status).toBe(404);
    expect((await call(h.duplicateVersion, { body: {}, cookie: a1.cookie, params: { id: src } })).status).toBe(403);
  });
});

describe("modelos", () => {
  let tpl: string;
  it("salva a partir de um treino e de um conteúdo; lista e abre só na própria consultoria", async () => {
    const src = (await create(alfa, a1.id, [{ exerciseId: ex["Supino reto"].id, sets: [wk(), wk()] }], { publish: true })).body.id;
    const t = await call(h.createTemplate, { cookie: alfa, body: { name: "Peito básico", versionId: src } });
    expect(t.status).toBe(201);
    tpl = t.body.id;
    const direct = await call(h.createTemplate, { cookie: alfa, body: { name: "Direto", exercises: [{ exerciseId: ex["Rosca direta"].id, sets: [{ reps: 12 }] }] } });
    expect(direct.status).toBe(201);

    const list = (await call(h.listTemplates, { cookie: alfa })).body;
    expect(list.map((x: any) => x.name).sort()).toEqual(["Direto", "Peito básico"]);
    expect(list.find((x: any) => x.name === "Peito básico")).toMatchObject({ exerciseCount: 1, setCount: 2 });
    const got = (await call(h.getTemplate, { cookie: alfa, params: { id: tpl } })).body;
    expect(got.exercises[0]).toMatchObject({ exerciseId: ex["Supino reto"].id });
    // O modelo aplicado vira treino normal.
    expect((await create(alfa, a2.id, got.exercises)).status).toBe(201);
  });
  it("outra consultoria não vê nem usa; aluno não acessa; exige uma origem", async () => {
    expect((await call(h.listTemplates, { cookie: beta })).body).toEqual([]);
    expect((await call(h.getTemplate, { cookie: beta, params: { id: tpl } })).status).toBe(404);
    expect((await call(h.createTemplate, { cookie: beta, body: { name: "x", versionId: (await call(h.listVersions, { cookie: alfa })).body[0].id } })).status).toBe(404);
    expect((await call(h.listTemplates, { cookie: a1.cookie })).status).toBe(403);
    expect((await call(h.getTemplate, { cookie: a1.cookie, params: { id: tpl } })).status).toBe(403);
    expect((await call(h.createTemplate, { cookie: alfa, body: { name: "sem origem" } })).status).toBe(400);
  });
});

describe("volume por músculo e configuração auditável", () => {
  let vid: string;
  beforeAll(async () => {
    const s = await inviteStudent(alfa, "vol");
    vid = (await create(alfa, s.id, [
      { exerciseId: ex["Supino reto"].id, sets: [{ setType: "warmup", reps: 12 }, { setType: "prep", reps: 6 }, wk(), wk(), wk(), wk()] },
      { exerciseId: ex["Tríceps na polia"].id, sets: [wk(), wk(), wk()] },
    ])).body.id;
  });
  const muscles = async (cookie = alfa, id = vid) => Object.fromEntries((await call(h.getVolume, { cookie, params: { id } })).body.muscles.map((m: any) => [m.muscle, m]));

  it("distingue diretas, indiretas, aquecimento e preparação", async () => {
    const m = await muscles();
    expect(m["Peitoral"]).toMatchObject({ direct: 4, indirect: 0, warmup: 1, prep: 1, weighted: 4 });
    expect(m["Tríceps"]).toMatchObject({ direct: 3, indirect: 4, weighted: 5 }); // peso padrão 0,5
    expect(m["Deltoide anterior"]).toMatchObject({ direct: 0, indirect: 4, weighted: 2 });
  });

  it("alterar o peso muda o ponderado e fica na auditoria", async () => {
    expect((await call(h.putSettings, { method: "PUT", cookie: alfa, body: { indirectWeight: 0.25 } })).status).toBe(200);
    expect((await muscles())["Tríceps"].weighted).toBe(4); // 3 + 4 × 0,25
    const log = (await call(h.listAudit, { cookie: alfa })).body.find((x: any) => x.action === "settings.indirect_weight");
    expect(log.detail).toMatchObject({ from: 0.5, to: 0.25 });
    expect(log.actorName).toBe("Personal alfa");
  });

  it("peso inválido é recusado e nada é auditado", async () => {
    const before = (await call(h.listAudit, { cookie: alfa })).body.length;
    expect((await call(h.putSettings, { method: "PUT", cookie: alfa, body: { indirectWeight: 0.3 } })).status).toBe(400);
    expect((await call(h.putSettings, { method: "PUT", cookie: alfa, body: { indirectWeight: 2 } })).status).toBe(400);
    expect((await call(h.listAudit, { cookie: alfa })).body.length).toBe(before);
  });

  it("a configuração e a auditoria são isoladas por consultoria", async () => {
    expect((await call(h.getSettings, { cookie: beta })).body.indirectWeight).toBe(0.5);
    expect((await call(h.listAudit, { cookie: beta })).body).toEqual([]);
    await call(h.putSettings, { method: "PUT", cookie: beta, body: { indirectWeight: 1 } });
    expect((await call(h.getSettings, { cookie: alfa })).body.indirectWeight).toBe(0.25);
  });

  it("aluno não vê volume, configuração nem auditoria; outra consultoria não vê o volume", async () => {
    expect((await call(h.getVolume, { cookie: a1.cookie, params: { id: vid } })).status).toBe(404); // treino de outro aluno
    expect((await call(h.getSettings, { cookie: a1.cookie })).status).toBe(403);
    expect((await call(h.putSettings, { method: "PUT", cookie: a1.cookie, body: { indirectWeight: 1 } })).status).toBe(403);
    expect((await call(h.listAudit, { cookie: a1.cookie })).status).toBe(403);
    expect((await call(h.getVolume, { cookie: beta, params: { id: vid } })).status).toBe(404);
  });
});

describe("isolamento das novas operações", () => {
  it("personal de outra consultoria não edita, versiona nem lê treino alheio", async () => {
    const draft = (await create(alfa, a1.id, [{ exerciseId: ex["Supino reto"].id, sets: [wk()] }])).body.id;
    const pub = (await create(alfa, a1.id, [{ exerciseId: ex["Supino reto"].id, sets: [wk()] }], { publish: true })).body.id;
    const put = (cookie: string) => call(h.updateDraft, { method: "PUT", cookie, params: { id: draft }, body: { exercises: [{ exerciseId: ex["Supino reto"].id, sets: [wk()] }] } });
    expect((await put(beta)).status).toBe(404);
    expect((await put(a1.cookie)).status).toBe(403);
    expect((await call(h.newVersion, { body: {}, cookie: beta, params: { id: pub } })).status).toBe(404);
    expect((await call(h.newVersion, { body: {}, cookie: a1.cookie, params: { id: pub } })).status).toBe(403);
  });
  it("exercício de outra consultoria não pode ser prescrito", async () => {
    const db = await getDb();
    const own = uuid();
    const cid = (await db.query<{ consultancy_id: string }>("select m.consultancy_id from memberships m join users u on u.id = m.user_id where u.email = 'beta@teste.com'")).rows[0].consultancy_id;
    await db.query("insert into exercises (id, consultancy_id, name, muscle, equipment) values ($1,$2,'Exercício da Beta','x','x')", [own, cid]);
    const r = await create(alfa, a1.id, [{ exerciseId: own, sets: [wk()] }]);
    expect(r.status).toBe(400);
    // Mas a própria Beta pode usá-lo.
    expect((await create(beta, b1.id, [{ exerciseId: own, sets: [wk()] }])).status).toBe(201);
  });
});
