import { describe, expect, it } from "vitest";
import { dayKey } from "../src/lib/engagement";
import * as h from "../src/server/handlers";
import * as h11 from "../src/server/handlers11";
import { call, firstExercises, inviteStudent, registerTrainer } from "./helpers";

const addDays = (key: string, n: number) => new Date(Date.parse(key + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const TODAY = dayKey(new Date());

async function mkRoutine(t: string, studentId: string, extra: Record<string, unknown> = {}) {
  const r = await call(h11.createRoutine, { cookie: t, params: { id: studentId }, body: { name: "Mesociclo 1", ...extra } });
  return r;
}
async function mkWorkout(t: string, studentId: string, routineId: string | null, name = "Treino A") {
  const [ex] = await firstExercises(t, 1);
  return call(h.createVersion, { cookie: t, body: { studentId, name, publish: true, routineId, exercises: [{ exerciseId: ex, sets: [{ reps: 10, loadKg: 40 }] }] } });
}
const studentList = async (cookie: string) => (await call(h.listVersions, { cookie })).body as any[];

describe("rotinas: criar, validar, editar, arquivar", () => {
  it("valida nome, objetivo, nível e as combinações de datas/opções", async () => {
    const t = await registerTrainer("rt-a"); const s = await inviteStudent(t, "rt-s1");
    expect((await mkRoutine(t, s.id, { name: "  " })).status).toBe(400);
    expect((await mkRoutine(t, s.id, { goal: "Qualquer coisa" })).status).toBe(400);
    expect((await mkRoutine(t, s.id, { level: "Mestre" })).status).toBe(400);
    expect((await mkRoutine(t, s.id, { startsOn: "2026-11-10", endsOn: "2026-11-01" })).body.error).toMatch(/antes do início/);
    expect((await mkRoutine(t, s.id, { startsOn: "2026-02-30" })).status).toBe(400);
    expect((await mkRoutine(t, s.id, { visibility: "from_start" })).body.error).toMatch(/data de início/);
    expect((await mkRoutine(t, s.id, { autoArchive: true })).body.error).toMatch(/data de fim/);
    expect((await mkRoutine(t, s.id, { goal: "Hipertrofia", level: "Intermediário", notes: "Aquecer 10 min", startsOn: TODAY, endsOn: addDays(TODAY, 30) })).status).toBe(201);
  });

  it("lista com contagem de treinos e estado efetivo; edita; arquiva, exclui e restaura sem apagar nada; tudo auditado", async () => {
    const t = await registerTrainer("rt-b"); const s = await inviteStudent(t, "rt-s2");
    const r = await mkRoutine(t, s.id, { goal: "Força" }); const rid = r.body.id as string;
    await mkWorkout(t, s.id, rid, "Treino A"); await mkWorkout(t, s.id, rid, "Treino B");
    const l = (await call(h11.listRoutines, { cookie: t, params: { id: s.id } })).body;
    expect(l).toHaveLength(1); expect(l[0]).toMatchObject({ id: rid, workouts: 2, status: "active", hiddenReason: null, goal: "Força" });
    expect((await call(h11.updateRoutine, { method: "PUT", cookie: t, params: { id: rid }, body: { name: "Mesociclo 1 (ajustado)", goal: "Hipertrofia", notes: "Nova orientação" } })).status).toBe(200);
    for (const st of ["archived", "deleted", "active"] as const) expect((await call(h11.setRoutineStatus, { cookie: t, params: { id: rid }, body: { status: st } })).status).toBe(200);
    const after = (await call(h11.listRoutines, { cookie: t, params: { id: s.id } })).body[0];
    expect(after).toMatchObject({ name: "Mesociclo 1 (ajustado)", status: "active", workouts: 2, notes: "Nova orientação" });
    const audit = ((await call(h.listAudit, { cookie: t })).body as any[]).map((x) => x.action);
    for (const a of ["routine.create", "routine.update", "routine.archive", "routine.delete", "routine.restore"]) expect(audit).toContain(a);
    expect((await call(h11.setRoutineStatus, { cookie: t, params: { id: rid }, body: { status: "apagada" } })).status).toBe(400);
  });
});

describe("rotinas: o que o aluno vê", () => {
  it("treino sem rotina sempre aparece; rotina ativa aparece; arquivada, excluída, futura e vencida (com arquivar) somem; restaurar devolve", async () => {
    const t = await registerTrainer("rt-c"); const s = await inviteStudent(t, "rt-s3");
    await mkWorkout(t, s.id, null, "Sem rotina");
    const ativa = (await mkRoutine(t, s.id, { name: "Ativa" })).body.id; await mkWorkout(t, s.id, ativa, "Na ativa");
    const names = async () => (await studentList(s.cookie)).map((v) => v.name).sort();
    expect(await names()).toEqual(["Na ativa", "Sem rotina"]);

    await call(h11.setRoutineStatus, { cookie: t, params: { id: ativa }, body: { status: "archived" } });
    expect(await names()).toEqual(["Sem rotina"]);
    await call(h11.setRoutineStatus, { cookie: t, params: { id: ativa }, body: { status: "deleted" } });
    expect(await names()).toEqual(["Sem rotina"]);
    await call(h11.setRoutineStatus, { cookie: t, params: { id: ativa }, body: { status: "active" } });
    expect(await names()).toEqual(["Na ativa", "Sem rotina"]);

    const futura = (await mkRoutine(t, s.id, { name: "Futura", startsOn: addDays(TODAY, 5), endsOn: addDays(TODAY, 35), visibility: "from_start" })).body.id; await mkWorkout(t, s.id, futura, "Na futura");
    expect(await names()).toEqual(["Na ativa", "Sem rotina"]);                         // ainda não começou
    const sempre = (await mkRoutine(t, s.id, { name: "Sempre", startsOn: addDays(TODAY, 5), visibility: "always" })).body.id; await mkWorkout(t, s.id, sempre, "No sempre");
    expect(await names()).toEqual(["Na ativa", "No sempre", "Sem rotina"]);             // "sempre" ignora a data de início
    const vencida = (await mkRoutine(t, s.id, { name: "Vencida", startsOn: addDays(TODAY, -40), endsOn: addDays(TODAY, -2), autoArchive: true })).body.id; await mkWorkout(t, s.id, vencida, "Na vencida");
    expect(await names()).toEqual(["Na ativa", "No sempre", "Sem rotina"]);             // venceu e arquiva sozinha
    const venceuSemAuto = (await mkRoutine(t, s.id, { name: "Venceu sem auto", endsOn: addDays(TODAY, -2) })).body.id; await mkWorkout(t, s.id, venceuSemAuto, "Venceu sem auto");
    expect((await names())).toContain("Venceu sem auto");                               // sem "arquivar ao vencer" continua visível
    const list = (await call(h11.listRoutines, { cookie: t, params: { id: s.id } })).body as any[];
    expect(list.find((r) => r.name === "Futura")).toMatchObject({ hiddenReason: "not_started", status: "active" });
    expect(list.find((r) => r.name === "Vencida")).toMatchObject({ hiddenReason: "archived", status: "archived", storedStatus: "active" });
  });

  it("restaurar rotina vencida desliga o arquivamento automático (senão arquivaria de novo); restaurar comum não mexe na opção", async () => {
    const t = await registerTrainer("rt-k"); const s = await inviteStudent(t, "rt-s12");
    const rid = (await mkRoutine(t, s.id, { name: "Venceu", startsOn: addDays(TODAY, -30), endsOn: addDays(TODAY, -1), autoArchive: true })).body.id as string;
    await mkWorkout(t, s.id, rid, "Do vencido");
    expect((await studentList(s.cookie)).some((v) => v.name === "Do vencido")).toBe(false);
    const r = await call(h11.setRoutineStatus, { cookie: t, params: { id: rid }, body: { status: "active" } });
    expect(r.body).toMatchObject({ status: "active", autoArchiveTurnedOff: true });
    expect((await studentList(s.cookie)).some((v) => v.name === "Do vencido")).toBe(true);
    expect((await call(h11.listRoutines, { cookie: t, params: { id: s.id } })).body[0]).toMatchObject({ autoArchive: false, status: "active" });
    const ok = (await mkRoutine(t, s.id, { name: "Normal", endsOn: addDays(TODAY, 20), autoArchive: true })).body.id as string;
    await call(h11.setRoutineStatus, { cookie: t, params: { id: ok }, body: { status: "archived" } });
    expect((await call(h11.setRoutineStatus, { cookie: t, params: { id: ok }, body: { status: "active" } })).body.autoArchiveTurnedOff).toBe(false);
  });

  it("/me/routines devolve só as visíveis, com orientações; nunca as ocultas", async () => {
    const t = await registerTrainer("rt-d"); const s = await inviteStudent(t, "rt-s4");
    await mkRoutine(t, s.id, { name: "Visível", goal: "Hipertrofia", notes: "Beber água" });
    await mkRoutine(t, s.id, { name: "Arquivada" }).then((r) => call(h11.setRoutineStatus, { cookie: t, params: { id: r.body.id }, body: { status: "archived" } }));
    await mkRoutine(t, s.id, { name: "Futura", startsOn: addDays(TODAY, 3), visibility: "from_start" });
    const mine = (await call(h11.myRoutines, { cookie: s.cookie })).body as any[];
    expect(mine.map((r) => r.name)).toEqual(["Visível"]);
    expect(mine[0]).toMatchObject({ goal: "Hipertrofia", notes: "Beber água", showTime: true });
    expect(JSON.stringify(mine)).not.toMatch(/Arquivada|Futura/);
  });

  it("registros e histórico do aluno continuam existindo quando a rotina é arquivada; getVersion traz a rotina e showTime", async () => {
    const t = await registerTrainer("rt-e"); const s = await inviteStudent(t, "rt-s5");
    const rid = (await mkRoutine(t, s.id, { name: "Com tempo oculto", showTime: false })).body.id;
    const vid = (await mkWorkout(t, s.id, rid)).body.id as string;
    expect((await call(h.getVersion, { cookie: s.cookie, params: { id: vid } })).body.routine).toEqual({ id: rid, name: "Com tempo oculto", showTime: false });
    const log = await call(h.startLog, { body: {}, cookie: s.cookie, params: { id: vid } });
    await call(h.finishLog, { cookie: s.cookie, params: { id: log.body.id }, body: { note: "ok" } });
    await call(h11.setRoutineStatus, { cookie: t, params: { id: rid }, body: { status: "deleted" } });
    const tl = (await studentList(t)).find((v) => v.id === vid);                       // o personal continua vendo, com o registro
    expect(tl).toMatchObject({ routineId: rid, routineName: "Com tempo oculto", logCount: 1 });
    expect((await call(h.comparison, { cookie: t, params: { id: vid } })).body.logs).toHaveLength(1);
    expect((await studentList(s.cookie)).some((v) => v.id === vid)).toBe(false);       // o aluno não lista mais
  });
});

describe("rotinas: treino em rotina e isolamento", () => {
  it("criar treino com rotina de outro aluno, de outra consultoria, inexistente ou excluída = 404", async () => {
    const a = await registerTrainer("rt-f"); const b = await registerTrainer("rt-g");
    const s1 = await inviteStudent(a, "rt-s6"); const s2 = await inviteStudent(a, "rt-s7");
    const r1 = (await mkRoutine(a, s1.id)).body.id as string;
    expect((await mkWorkout(a, s1.id, r1)).status).toBe(201);
    expect((await mkWorkout(a, s2.id, r1)).status).toBe(404);                           // rotina de outro aluno
    const s3 = await inviteStudent(b, "rt-s8");
    expect((await mkWorkout(b, s3.id, r1)).status).toBe(404);                           // rotina de outra consultoria
    expect((await mkWorkout(a, s1.id, "00000000-0000-4000-8000-000000000000")).status).toBe(404);
    await call(h11.setRoutineStatus, { cookie: a, params: { id: r1 }, body: { status: "deleted" } });
    expect((await mkWorkout(a, s1.id, r1)).status).toBe(404);                           // excluída não recebe treinos
  });

  it("mover treino entre rotinas e tirar da rotina; só rotina do mesmo aluno; aluno 403", async () => {
    const t = await registerTrainer("rt-h"); const s1 = await inviteStudent(t, "rt-s9"); const s2 = await inviteStudent(t, "rt-s10");
    const r1 = (await mkRoutine(t, s1.id, { name: "R1" })).body.id, r2 = (await mkRoutine(t, s1.id, { name: "R2" })).body.id, rOther = (await mkRoutine(t, s2.id, { name: "Do outro" })).body.id;
    const vid = (await mkWorkout(t, s1.id, r1)).body.id as string;
    expect((await call(h11.moveWorkout, { cookie: t, params: { id: vid }, body: { routineId: r2 } })).status).toBe(200);
    expect((await studentList(t)).find((v) => v.id === vid).routineName).toBe("R2");
    expect((await call(h11.moveWorkout, { cookie: t, params: { id: vid }, body: { routineId: rOther } })).status).toBe(404);
    expect((await call(h11.moveWorkout, { cookie: t, params: { id: vid }, body: { routineId: null } })).status).toBe(200);
    expect((await studentList(t)).find((v) => v.id === vid).routineId).toBeNull();
    expect((await call(h11.moveWorkout, { cookie: s1.cookie, params: { id: vid }, body: { routineId: r1 } })).status).toBe(403);
  });

  it("ISOLAMENTO: outra consultoria não lista, cria, edita nem muda estado (404); aluno 403; sem sessão 401", async () => {
    const a = await registerTrainer("rt-i"); const b = await registerTrainer("rt-j");
    const s = await inviteStudent(a, "rt-s11"); const rid = (await mkRoutine(a, s.id)).body.id as string;
    expect((await call(h11.listRoutines, { cookie: b, params: { id: s.id } })).status).toBe(404);
    expect((await call(h11.createRoutine, { cookie: b, params: { id: s.id }, body: { name: "Invasora" } })).status).toBe(404);
    expect((await call(h11.updateRoutine, { method: "PUT", cookie: b, params: { id: rid }, body: { name: "Hackeada" } })).status).toBe(404);
    expect((await call(h11.setRoutineStatus, { cookie: b, params: { id: rid }, body: { status: "deleted" } })).status).toBe(404);
    expect((await call(h11.updateRoutine, { method: "PUT", cookie: a, params: { id: "nao-e-uuid" }, body: { name: "x" } })).status).toBe(404);
    expect((await call(h11.listRoutines, { cookie: s.cookie, params: { id: s.id } })).status).toBe(403);
    expect((await call(h11.createRoutine, { cookie: s.cookie, params: { id: s.id }, body: { name: "x" } })).status).toBe(403);
    expect((await call(h11.myRoutines, { cookie: a })).status).toBe(403);
    expect((await call(h11.myRoutines)).status).toBe(401);
    expect((await call(h11.listRoutines, { cookie: a, params: { id: s.id } })).body[0].name).toBe("Mesociclo 1"); // intacta
  });
});
