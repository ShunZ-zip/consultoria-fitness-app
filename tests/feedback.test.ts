import { randomUUID as uuid } from "node:crypto";
import { describe, expect, it } from "vitest";
import { completionPct, durationMinutes, effortLabel, formatDuration, matchesQuery } from "../src/lib/feedback";
import * as h from "../src/server/handlers";
import * as h9 from "../src/server/handlers9";
import { call, inviteStudent, publishWorkout, registerTrainer } from "./helpers";

describe("caixa de feedbacks: regras puras", () => {
  it("duração: minutos, nula se faltar ponta, ordem inválida ou mais de 24 h", () => {
    expect(durationMinutes("2026-11-25T18:13:00Z", "2026-11-25T19:04:00Z")).toBe(51);
    expect(durationMinutes(null, "2026-11-25T19:04:00Z")).toBeNull();
    expect(durationMinutes("2026-11-25T19:04:00Z", "2026-11-25T18:13:00Z")).toBeNull();
    expect(durationMinutes("2026-11-24T10:00:00Z", "2026-11-25T11:00:00Z")).toBeNull();
    expect(formatDuration(5)).toBe("5 min"); expect(formatDuration(65)).toBe("1 h 05 min"); expect(formatDuration(120)).toBe("2 h"); expect(formatDuration(null)).toBe("—");
  });
  it("esforço: rótulos de 1 a 8; fora da escala ou ausente = nulo", () => {
    expect(effortLabel(1)).toBe("Muito leve"); expect(effortLabel(5)).toBe("Intensa"); expect(effortLabel(8)).toBe("Exaustão máxima");
    expect(effortLabel(0)).toBeNull(); expect(effortLabel(9)).toBeNull(); expect(effortLabel(null)).toBeNull();
  });
  it("conclusão: percentual limitado a 100; sem prescrição = nulo", () => {
    expect(completionPct(2, 3)).toBe(67); expect(completionPct(5, 3)).toBe(100); expect(completionPct(0, 3)).toBe(0);
    expect(completionPct(3, 0)).toBeNull();
  });
  it("busca por aluno ou treino sem acento nem maiúsculas", () => {
    const it1 = { studentName: "Jéssica da Silva", workoutName: "Superiores A" };
    expect(matchesQuery(it1, "jessica")).toBe(true); expect(matchesQuery(it1, "SUPERIORES")).toBe(true);
    expect(matchesQuery(it1, "")).toBe(true); expect(matchesQuery(it1, "pernas")).toBe(false);
  });
});

/** Aluno registra todas as séries do treino e conclui (com esforço e observação opcionais). */
async function doSession(student: string, versionId: string, o: { effort?: number; note?: string; finish?: boolean; onlyFirst?: boolean } = {}) {
  const detail = (await call(h.getVersion, { cookie: student, params: { id: versionId } })).body;
  const sets = detail.exercises.flatMap((e: any) => e.sets);
  const log = await call(h.startLog, { body: {}, cookie: student, params: { id: versionId } });
  for (const s of o.onlyFirst ? sets.slice(0, 1) : sets) {
    await call(h.putLoggedSet, { method: "PUT", cookie: student, params: { id: log.body.id, setId: uuid() }, body: { versionSetId: s.id, reps: 10, loadKg: 40, rir: 2 } });
  }
  if (o.finish !== false) {
    const r = await call(h.finishLog, { cookie: student, params: { id: log.body.id }, body: { note: o.note ?? null, effort: o.effort ?? null } });
    return { logId: log.body.id as string, status: r.status };
  }
  return { logId: log.body.id as string, status: 0 };
}

describe("caixa de feedbacks: API", () => {
  it("lista só sessões concluídas, com esforço, observação, séries feitas e RIR; contagens corretas", async () => {
    const t = await registerTrainer("fb-a"); const s = await inviteStudent(t, "fb-s1");
    const vid = await publishWorkout(t, s.id);
    const done = await doSession(s.cookie, vid, { effort: 5, note: "Ombro incomodou" });
    await doSession(s.cookie, vid, { finish: false }); // sessão em andamento não aparece
    const r = await call(h9.listFeedbacks, { cookie: t });
    expect(r.status).toBe(200);
    expect(r.body.counts).toEqual({ open: 1, resolved: 0 });
    const it = r.body.items[0];
    expect(it).toMatchObject({ id: done.logId, studentId: s.id, studentName: "Aluno fb-s1", effort: 5, effortLabel: "Intensa", note: "Ombro incomodou", setsDone: 3, setsPrescribed: 3, completionPct: 100, resolved: false });
    expect(it.avgRir).toBe(2);
    expect(r.body.items).toHaveLength(1);
  });

  it("esforço opcional: sem esforço fica nulo; fora de 1–8 é 400 e não conclui", async () => {
    const t = await registerTrainer("fb-b"); const s = await inviteStudent(t, "fb-s2");
    const vid = await publishWorkout(t, s.id);
    const a = await doSession(s.cookie, vid);
    expect(a.status).toBe(200);
    expect((await call(h9.listFeedbacks, { cookie: t })).body.items[0].effort).toBeNull();
    const detail = (await call(h.getVersion, { cookie: s.cookie, params: { id: vid } })).body; void detail;
    const log = await call(h.startLog, { body: {}, cookie: s.cookie, params: { id: vid } });
    expect((await call(h.finishLog, { cookie: s.cookie, params: { id: log.body.id }, body: { effort: 9 } })).status).toBe(400);
    expect((await call(h.finishLog, { cookie: s.cookie, params: { id: log.body.id }, body: { effort: 0 } })).status).toBe(400);
    expect((await call(h9.listFeedbacks, { cookie: t })).body.counts.open).toBe(1);
  });

  it("resolver, reabrir e abas: item muda de aba e a contagem acompanha; ação é auditada", async () => {
    const t = await registerTrainer("fb-c"); const s = await inviteStudent(t, "fb-s3");
    const vid = await publishWorkout(t, s.id);
    const { logId } = await doSession(s.cookie, vid, { effort: 2 });
    expect((await call(h9.feedbackCount, { cookie: t })).body.open).toBe(1);
    expect((await call(h9.resolveFeedback, { params: { id: logId }, body: { resolved: true }, cookie: t })).status).toBe(200);
    expect((await call(h9.feedbackCount, { cookie: t })).body.open).toBe(0);
    expect((await call(h9.listFeedbacks, { cookie: t })).body.items).toHaveLength(0);
    const res = await call(h9.listFeedbacks, { cookie: t, query: "status=resolved" });
    expect(res.body.items.map((i: any) => i.id)).toEqual([logId]); expect(res.body.items[0].resolved).toBe(true);
    expect((await call(h9.resolveFeedback, { params: { id: logId }, body: { resolved: false }, cookie: t })).status).toBe(200);
    expect((await call(h9.feedbackCount, { cookie: t })).body.open).toBe(1);
    const audit = (await call(h.listAudit, { cookie: t })).body as any[];
    expect(audit.some((x) => x.action === "feedback.resolve")).toBe(true); expect(audit.some((x) => x.action === "feedback.reopen")).toBe(true);
  });

  it("resolver todos: só os ids enviados; id repetido não conta; reabrir em lote", async () => {
    const t = await registerTrainer("fb-d"); const s = await inviteStudent(t, "fb-s4");
    const vid = await publishWorkout(t, s.id);
    const a = await doSession(s.cookie, vid); const b = await doSession(s.cookie, vid); const c = await doSession(s.cookie, vid);
    const r1 = await call(h9.resolveFeedbacks, { body: { ids: [a.logId, b.logId] }, cookie: t });
    expect(r1.body.changed).toBe(2);
    expect((await call(h9.resolveFeedbacks, { body: { ids: [a.logId, b.logId] }, cookie: t })).body.changed).toBe(0); // já resolvidos
    expect((await call(h9.listFeedbacks, { cookie: t })).body.items.map((i: any) => i.id)).toEqual([c.logId]);
    expect((await call(h9.resolveFeedbacks, { body: { ids: [a.logId], resolved: false }, cookie: t })).body.changed).toBe(1);
    expect((await call(h9.resolveFeedbacks, { body: { ids: [] }, cookie: t })).status).toBe(400);
    expect((await call(h9.resolveFeedbacks, { body: { ids: ["nao-e-uuid"] }, cookie: t })).status).toBe(400);
  });

  it("ISOLAMENTO: outra consultoria não vê, não resolve (404) e não altera em lote", async () => {
    const a = await registerTrainer("fb-e"); const b = await registerTrainer("fb-f");
    const s = await inviteStudent(a, "fb-s5"); const vid = await publishWorkout(a, s.id);
    const { logId } = await doSession(s.cookie, vid);
    expect((await call(h9.listFeedbacks, { cookie: b })).body).toMatchObject({ items: [], counts: { open: 0, resolved: 0 } });
    expect((await call(h9.feedbackCount, { cookie: b })).body.open).toBe(0);
    expect((await call(h9.resolveFeedback, { params: { id: logId }, body: { resolved: true }, cookie: b })).status).toBe(404);
    expect((await call(h9.resolveFeedbacks, { body: { ids: [logId] }, cookie: b })).body.changed).toBe(0);
    expect((await call(h9.feedbackCount, { cookie: a })).body.open).toBe(1); // continua aberto para o dono
  });

  it("permissões: aluno 403 em tudo, sem sessão 401, id inválido 404", async () => {
    const t = await registerTrainer("fb-g"); const s = await inviteStudent(t, "fb-s6"); const vid = await publishWorkout(t, s.id);
    const { logId } = await doSession(s.cookie, vid);
    for (const fn of [h9.listFeedbacks, h9.feedbackCount]) expect((await call(fn, { cookie: s.cookie })).status).toBe(403);
    expect((await call(h9.resolveFeedback, { params: { id: logId }, body: { resolved: true }, cookie: s.cookie })).status).toBe(403);
    expect((await call(h9.resolveFeedbacks, { body: { ids: [logId] }, cookie: s.cookie })).status).toBe(403);
    expect((await call(h9.listFeedbacks)).status).toBe(401);
    expect((await call(h9.resolveFeedback, { params: { id: "x" }, body: { resolved: true }, cookie: t })).status).toBe(404);
  });

  it("o aluno não vê o estado resolvido nos próprios registros", async () => {
    const t = await registerTrainer("fb-h"); const s = await inviteStudent(t, "fb-s7"); const vid = await publishWorkout(t, s.id);
    const { logId } = await doSession(s.cookie, vid, { effort: 3 });
    await call(h9.resolveFeedback, { params: { id: logId }, body: { resolved: true }, cookie: t });
    const mine = JSON.stringify((await call(h.listLogs, { cookie: s.cookie, params: { id: vid } })).body);
    expect(mine).not.toMatch(/resolved|feedback_resolved/i);
  });
});
