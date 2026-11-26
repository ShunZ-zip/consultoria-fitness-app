import { randomUUID as uuid } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildWeek, computeEngagement, dayKey, sinceText, weekSummaryText } from "../src/lib/engagement";
import * as h from "../src/server/handlers";
import * as h10 from "../src/server/handlers10";
import { call, firstExercises, inviteStudent, publishWorkout, registerTrainer } from "./helpers";

// 26/11/2026 é quinta-feira. 12:00 em Brasília = 15:00Z.
const NOW = new Date("2026-11-26T15:00:00Z");

describe("frequência semanal e engajamento (regras puras)", () => {
  it("dia civil respeita o fuso: 01:00Z ainda é o dia anterior em Brasília", () => {
    expect(dayKey("2026-11-26T01:00:00Z")).toBe("2026-11-25");
    expect(dayKey("2026-11-26T01:00:00Z", 0)).toBe("2026-11-26");
    expect(dayKey("2026-11-26T01:00:00Z", 840)).toBe("2026-11-26");
  });

  it("semana vai de segunda a domingo e marca hoje, dias futuros e sessões por dia", () => {
    const w = buildWeek(["2026-11-24T21:00:00Z", "2026-11-26T01:00:00Z", "2026-11-26T02:30:00Z"], NOW);
    expect(w.map((d) => d.date)).toEqual(["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29"]);
    expect(w.map((d) => d.label).join("")).toBe("STQQSSD");
    expect(w.map((d) => d.trained)).toEqual([false, true, true, false, false, false, false]);
    expect(w[2].sessions).toBe(2);           // quarta: duas sessões
    expect(w.findIndex((d) => d.today)).toBe(3);
    expect(w.map((d) => d.future)).toEqual([false, false, false, false, true, true, true]);
  });

  it("domingo ainda é da mesma semana; segunda abre uma semana nova e zerada", () => {
    const sunday = buildWeek(["2026-11-23T15:00:00Z"], new Date("2026-11-29T15:00:00Z"));
    expect(sunday[0].date).toBe("2026-11-23"); expect(sunday[0].trained).toBe(true); expect(sunday.findIndex((d) => d.today)).toBe(6);
    const monday = buildWeek(["2026-11-23T15:00:00Z"], new Date("2026-11-30T15:00:00Z"));
    expect(monday[0].date).toBe("2026-11-30"); expect(monday.every((d) => !d.trained)).toBe(true);
  });

  it("engajamento: dias treinados, sessões, último treino, média e ignora datas do futuro e inválidas", () => {
    const e = computeEngagement(["2026-11-24T21:00:00Z", "2026-11-26T01:00:00Z", "2026-11-26T02:30:00Z", "2026-11-27T02:00:00Z", "lixo"], NOW, 4);
    expect(e).toMatchObject({ daysTrainedThisWeek: 2, sessionsThisWeek: 3, totalSessions: 3, daysSinceLast: 1, status: "engaged", statusLabel: "Engajado", plannedPerWeek: 4 });
    expect(e.avgPerWeek).toBe(0.8);
    expect(e.lastWorkoutAt).toBe("2026-11-26T02:30:00.000Z");
    expect(sinceText(e.daysSinceLast)).toBe("ontem");
  });

  it("limites de status: até 4 dias engajado, de 5 a 9 atenção, 10 ou mais parado, nenhum = sem treinos", () => {
    const at = (daysAgo: number) => [new Date(NOW.getTime() - daysAgo * 86400000)];
    expect(computeEngagement(at(0), NOW).status).toBe("engaged");
    expect(computeEngagement(at(4), NOW).status).toBe("engaged");
    expect(computeEngagement(at(5), NOW).status).toBe("attention");
    expect(computeEngagement(at(9), NOW).status).toBe("attention");
    expect(computeEngagement(at(10), NOW).status).toBe("stalled");
    const none = computeEngagement([], NOW);
    expect(none).toMatchObject({ status: "none", statusLabel: "Sem treinos", daysSinceLast: null, avgPerWeek: null, lastWorkoutAt: null, totalSessions: 0 });
    expect(sinceText(0)).toBe("hoje"); expect(sinceText(3)).toBe("há 3 dias"); expect(sinceText(null)).toBe("—");
  });

  it("média usa só os últimos 28 dias", () => {
    const old = new Date(NOW.getTime() - 40 * 86400000);
    const recent = [0, 7, 14, 21].map((d) => new Date(NOW.getTime() - d * 86400000));
    expect(computeEngagement([old, ...recent], NOW).avgPerWeek).toBe(1);
  });

  it("textos do resumo semanal", () => {
    expect(weekSummaryText(0)).toBe("Nenhum treino nesta semana ainda");
    expect(weekSummaryText(1)).toBe("1 dia de treino nesta semana"); expect(weekSummaryText(3)).toBe("3 dias de treino nesta semana");
  });
});

async function finishSession(student: string, versionId: string) {
  const detail = (await call(h.getVersion, { cookie: student, params: { id: versionId } })).body;
  const log = await call(h.startLog, { body: {}, cookie: student, params: { id: versionId } });
  for (const s of detail.exercises.flatMap((e: any) => e.sets).slice(0, 1)) {
    await call(h.putLoggedSet, { method: "PUT", cookie: student, params: { id: log.body.id, setId: uuid() }, body: { versionSetId: s.id, reps: 10, loadKg: 40 } });
  }
  await call(h.finishLog, { cookie: student, params: { id: log.body.id }, body: {} });
  return log.body.id as string;
}

describe("frequência e engajamento (API)", () => {
  it("aluno vê o próprio; sessão em andamento não conta; hoje fica marcado na semana", async () => {
    const t = await registerTrainer("en-a"); const s = await inviteStudent(t, "en-s1"); const vid = await publishWorkout(t, s.id);
    const empty = await call(h10.myEngagement, { cookie: s.cookie });
    expect(empty.status).toBe(200); expect(empty.body).toMatchObject({ status: "none", totalSessions: 0 }); expect(empty.body.week).toHaveLength(7);
    await finishSession(s.cookie, vid); await finishSession(s.cookie, vid);
    await call(h.startLog, { body: {}, cookie: s.cookie, params: { id: vid } }); // em andamento: não conta
    const r = await call(h10.myEngagement, { cookie: s.cookie });
    expect(r.body).toMatchObject({ status: "engaged", totalSessions: 2, sessionsThisWeek: 2, daysTrainedThisWeek: 1, daysSinceLast: 0 });
    expect(r.body.week.filter((d: any) => d.trained)).toHaveLength(1);
    expect(r.body.week.find((d: any) => d.today).trained).toBe(true);
  });

  it("personal vê o do aluno da sua consultoria e a meta semanal da prescrição", async () => {
    const t = await registerTrainer("en-b"); const s = await inviteStudent(t, "en-s2");
    const [ex] = await firstExercises(t, 1);
    const v = await call(h.createVersion, { cookie: t, body: { studentId: s.id, name: "Treino A", publish: true, weeklyFrequency: 4, exercises: [{ exerciseId: ex, sets: [{ reps: 10, loadKg: 40 }] }] } });
    expect(v.status).toBe(201);
    await finishSession(s.cookie, v.body.id);
    const r = await call(h10.studentEngagement, { cookie: t, params: { id: s.id } });
    expect(r.status).toBe(200); expect(r.body).toMatchObject({ totalSessions: 1, plannedPerWeek: 4, status: "engaged" });
  });

  it("ISOLAMENTO: outra consultoria 404; aluno não lê o de outro nem usa a rota do personal; personal não usa a do aluno", async () => {
    const a = await registerTrainer("en-c"); const b = await registerTrainer("en-d");
    const s1 = await inviteStudent(a, "en-s3"); const s2 = await inviteStudent(a, "en-s4");
    expect((await call(h10.studentEngagement, { cookie: b, params: { id: s1.id } })).status).toBe(404);
    expect((await call(h10.studentEngagement, { cookie: a, params: { id: "nao-e-uuid" } })).status).toBe(404);
    expect((await call(h10.studentEngagement, { cookie: s2.cookie, params: { id: s1.id } })).status).toBe(403);
    expect((await call(h10.myEngagement, { cookie: a })).status).toBe(403);
    expect((await call(h10.myEngagement)).status).toBe(401);
  });

  it("fuso inválido cai no padrão; fuso válido muda o dia civil", async () => {
    const t = await registerTrainer("en-e"); const s = await inviteStudent(t, "en-s5"); const vid = await publishWorkout(t, s.id);
    await finishSession(s.cookie, vid);
    const bad = await call(h10.myEngagement, { cookie: s.cookie, query: "tz=abc" });
    const ok = await call(h10.myEngagement, { cookie: s.cookie, query: "tz=-180" });
    expect(bad.status).toBe(200); expect(bad.body.week.map((d: any) => d.date)).toEqual(ok.body.week.map((d: any) => d.date));
    const far = await call(h10.myEngagement, { cookie: s.cookie, query: "tz=840" });
    expect(far.status).toBe(200); expect(far.body.week).toHaveLength(7);
  });
});
