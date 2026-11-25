import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../src/server/db";
import { call, firstExercises, h, inviteStudent, registerTrainer, uuid } from "./helpers";

// Fluxo da entrega 1: convite -> treino publicado -> aluno registra -> personal compara.
describe("fluxo ponta a ponta", () => {
  beforeAll(async () => { await resetDb(); });

  it("personal convida, publica, aluno registra e personal compara", async () => {
    const trainer = await registerTrainer("ana");

    // 1. Convite: o token existe, o aluno vê o convite e cria a conta.
    const inv = await call(h.createInvite, { body: { studentName: "Bruno" }, cookie: trainer });
    expect(inv.status).toBe(201);
    const peek = await call(h.getInvite, { params: { token: inv.body.token } });
    expect(peek.body.studentName).toBe("Bruno");
    const acc = await call(h.acceptInvite, {
      params: { token: inv.body.token },
      body: { name: "Bruno", email: "bruno@aluno.com", password: "senha-segura-1" },
    });
    expect(acc.status).toBe(201);
    const student = acc.cookie!;
    const studentId = (await call(h.me, { cookie: student })).body.id;

    const students = await call(h.listStudents, { cookie: trainer });
    expect(students.body.map((s: any) => s.id)).toContain(studentId);

    // 2. Personal monta (rascunho) e publica.
    const [e1, e2] = await firstExercises(trainer);
    const created = await call(h.createVersion, {
      cookie: trainer,
      body: {
        studentId, name: "Treino A",
        exercises: [
          { exerciseId: e1, sets: [{ reps: 10, loadKg: 40, rir: 2, restS: 90 }, { reps: 10, loadKg: 40, rir: 2, restS: 90 }] },
          { exerciseId: e2, sets: [{ reps: 12, loadKg: 20, rir: 1, restS: 60 }] },
        ],
      },
    });
    expect(created.body.status).toBe("draft");
    const vid = created.body.id;

    // Rascunho ainda não aparece para o aluno.
    expect((await call(h.listVersions, { cookie: student })).body).toHaveLength(0);
    expect((await call(h.getVersion, { cookie: student, params: { id: vid } })).status).toBe(404);

    expect((await call(h.publishVersion, { method: "POST", body: {}, cookie: trainer, params: { id: vid } })).status).toBe(200);
    const mine = await call(h.listVersions, { cookie: student });
    expect(mine.body).toHaveLength(1);

    // 3. Aluno registra o realizado (diferente do prescrito).
    const detail = (await call(h.getVersion, { cookie: student, params: { id: vid } })).body;
    const sets = detail.exercises.flatMap((e: any) => e.sets);
    expect(sets).toHaveLength(3);
    const log = await call(h.startLog, { body: {}, cookie: student, params: { id: vid } });
    const done = [
      { reps: 10, loadKg: 40, rir: 2 },  // igual
      { reps: 8, loadKg: 42.5, rir: 1 }, // menos reps, mais carga
      { reps: 12, loadKg: 20, rir: 0, note: "forte" },
    ];
    for (const [i, s] of sets.entries()) {
      const r = await call(h.putLoggedSet, {
        method: "PUT", cookie: student, params: { id: log.body.id, setId: uuid() },
        body: { versionSetId: s.id, ...done[i] },
      });
      expect(r.status).toBe(200);
    }
    await call(h.finishLog, { cookie: student, params: { id: log.body.id }, body: { note: "ok" } });

    // 4. Personal compara prescrito x realizado.
    const cmp = await call(h.comparison, { cookie: trainer, params: { id: vid } });
    expect(cmp.status).toBe(200);
    expect(cmp.body.logs).toHaveLength(1);
    const rows = cmp.body.logs[0].rows;
    expect(rows).toHaveLength(3);
    expect(rows[0].prescribed).toMatchObject({ reps: 10, loadKg: 40 });
    expect(rows[0].diff).toMatchObject({ reps: 0, loadKg: 0 });
    expect(rows[1].done).toMatchObject({ reps: 8, loadKg: 42.5 });
    expect(rows[1].diff).toMatchObject({ reps: -2, loadKg: 2.5, rir: -1 });
    expect(cmp.body.logs[0].finishedAt).toBeTruthy();

    // A prescrição publicada continua intacta após o registro.
    const after = (await call(h.getVersion, { cookie: trainer, params: { id: vid } })).body;
    expect(after.exercises[0].sets[1]).toMatchObject({ reps: 10, loadKg: 40, rir: 2 });
  });
});
