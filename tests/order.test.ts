import { describe, expect, it } from "vitest";
import * as h from "../src/server/handlers";
import * as h11 from "../src/server/handlers11";
import { call, firstExercises, inviteStudent, registerTrainer } from "./helpers";

async function mkWorkout(t: string, studentId: string, name: string) {
  const [ex] = await firstExercises(t, 1);
  const r = await call(h.createVersion, { cookie: t, body: { studentId, name, publish: true, exercises: [{ exerciseId: ex, sets: [{ reps: 10, loadKg: 40 }] }] } });
  expect(r.status).toBe(201);
  return r.body.id as string;
}
const list = async (cookie: string) => (await call(h.listVersions, { cookie })).body as any[];
const names = async (cookie: string, studentId?: string) => (await list(cookie)).filter((v) => !studentId || v.studentId === studentId).map((v) => v.name);
const programIds = async (t: string, studentId: string) => [...new Set((await list(t)).filter((v) => v.studentId === studentId).map((v) => v.programId as string))];

describe("ordem dos treinos do aluno", () => {
  it("treino novo entra no fim; o aluno e o personal veem a mesma ordem", async () => {
    const t = await registerTrainer("od-a"); const s = await inviteStudent(t, "od-s1");
    await mkWorkout(t, s.id, "Treino 1"); await mkWorkout(t, s.id, "Treino 2"); await mkWorkout(t, s.id, "Treino 3");
    expect(await names(t, s.id)).toEqual(["Treino 1", "Treino 2", "Treino 3"]);
    expect(await names(s.cookie)).toEqual(["Treino 1", "Treino 2", "Treino 3"]);
  });

  it("reordenar muda a ordem para os dois; lista parcial coloca os citados primeiro e mantém os demais", async () => {
    const t = await registerTrainer("od-b"); const s = await inviteStudent(t, "od-s2");
    for (const n of ["A", "B", "C", "D"]) await mkWorkout(t, s.id, n);
    const [a, b, c, d] = await programIds(t, s.id);
    const full = await call(h11.reorderWorkouts, { cookie: t, params: { id: s.id }, body: { programIds: [d, c, b, a] } });
    expect(full.status).toBe(200);
    expect(await names(t, s.id)).toEqual(["D", "C", "B", "A"]); expect(await names(s.cookie)).toEqual(["D", "C", "B", "A"]);
    await call(h11.reorderWorkouts, { cookie: t, params: { id: s.id }, body: { programIds: [a] } });     // só o A, vai para a frente
    expect(await names(t, s.id)).toEqual(["A", "D", "C", "B"]);
    await call(h11.reorderWorkouts, { cookie: t, params: { id: s.id }, body: { programIds: [b, b, c] } }); // repetido não duplica
    expect(await names(t, s.id)).toEqual(["B", "C", "A", "D"]);
    const after = await mkWorkout(t, s.id, "E");                                                         // novo depois de reordenar: fim
    expect(after).toBeTruthy(); expect((await names(t, s.id)).at(-1)).toBe("E");
  });

  it("versões do mesmo treino ficam juntas (mais nova primeiro) e a ordem é por aluno", async () => {
    const t = await registerTrainer("od-c"); const s1 = await inviteStudent(t, "od-s3"); const s2 = await inviteStudent(t, "od-s4");
    const v1 = await mkWorkout(t, s1.id, "Superiores"); await mkWorkout(t, s1.id, "Inferiores"); await mkWorkout(t, s2.id, "Do outro aluno");
    await call(h.newVersion, { cookie: t, params: { id: v1 } });
    const all = await list(t); const mine = all.filter((v) => v.studentId === s1.id);
    expect(mine.map((v) => `${v.name}${v.version}`)).toEqual(["Superiores2", "Superiores1", "Inferiores1"]);
    const [pSup, pInf] = [...new Set(mine.map((v) => v.programId))];
    await call(h11.reorderWorkouts, { cookie: t, params: { id: s1.id }, body: { programIds: [pInf, pSup] } });
    expect((await list(t)).filter((v) => v.studentId === s1.id).map((v) => v.name)).toEqual(["Inferiores", "Superiores", "Superiores"]);
    expect((await names(t, s2.id))).toEqual(["Do outro aluno"]);                                          // o outro aluno não muda
  });

  it("ISOLAMENTO e validação: programa de outro aluno ou de outra consultoria 404; aluno 403; ids inválidos 400; sem sessão 401", async () => {
    const a = await registerTrainer("od-d"); const b = await registerTrainer("od-e");
    const s1 = await inviteStudent(a, "od-s5"); const s2 = await inviteStudent(a, "od-s6"); const s3 = await inviteStudent(b, "od-s7");
    await mkWorkout(a, s1.id, "S1"); await mkWorkout(a, s2.id, "S2"); await mkWorkout(b, s3.id, "S3");
    const [p1] = await programIds(a, s1.id); const [p2] = await programIds(a, s2.id); const [p3] = await programIds(b, s3.id);
    expect((await call(h11.reorderWorkouts, { cookie: a, params: { id: s1.id }, body: { programIds: [p2] } })).status).toBe(404);      // de outro aluno
    expect((await call(h11.reorderWorkouts, { cookie: a, params: { id: s1.id }, body: { programIds: [p1, p3] } })).status).toBe(404);  // de outra consultoria
    expect((await call(h11.reorderWorkouts, { cookie: b, params: { id: s1.id }, body: { programIds: [p1] } })).status).toBe(404);      // aluno de outra consultoria
    expect((await call(h11.reorderWorkouts, { cookie: s1.cookie, params: { id: s1.id }, body: { programIds: [p1] } })).status).toBe(403);
    expect((await call(h11.reorderWorkouts, { cookie: a, params: { id: s1.id }, body: { programIds: [] } })).status).toBe(400);
    expect((await call(h11.reorderWorkouts, { cookie: a, params: { id: s1.id }, body: { programIds: ["x"] } })).status).toBe(400);
    expect((await call(h11.reorderWorkouts, { cookie: a, params: { id: "nao-e-uuid" }, body: { programIds: [p1] } })).status).toBe(404);
    expect((await call(h11.reorderWorkouts, { params: { id: s1.id }, body: { programIds: [p1] } })).status).toBe(401);
  });
});
