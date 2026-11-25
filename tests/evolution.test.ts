import { describe, expect, it } from "vitest";
import { computeAdherence, computeEvolution, estimate1RM, type PerformedSet } from "../src/lib/evolution";

const S = (logId: string, day: number, reps: number | null, loadKg: number | null, ex = "e1", name = "Supino reto"): PerformedSet => ({
  logId, at: `2026-11-${String(day).padStart(2, "0")}T10:00:00Z`, finishedAt: null, exerciseId: ex, exerciseName: name, reps, loadKg,
});

describe("1RM estimada (Epley)", () => {
  it("carga × (1 + reps/30), com 1 repetição = a própria carga", () => {
    expect(estimate1RM(60, 10)).toBe(80);
    expect(estimate1RM(100, 1)).toBe(100);
    expect(estimate1RM(57.5, 10)).toBe(76.7);
  });
  it("não estima sem dados ou acima de 12 repetições", () => {
    expect(estimate1RM(null, 10)).toBeNull();
    expect(estimate1RM(60, null)).toBeNull();
    expect(estimate1RM(0, 10)).toBeNull();
    expect(estimate1RM(20, 13)).toBeNull();
    expect(estimate1RM(20, 0)).toBeNull();
  });
});

describe("evolução por exercício", () => {
  const sets = [
    S("l1", 1, 10, 50), S("l1", 1, 10, 50), S("l1", 1, 8, 55),
    S("l2", 8, 10, 52.5), S("l2", 8, 9, 55),
    S("l3", 15, 10, 52.5), S("l3", 15, 8, 55), // sem novo recorde
    S("l4", 22, 10, 60),
  ];
  const ev = computeEvolution(sets)[0];

  it("um ponto por sessão, em ordem, com carga máxima, 1RM e volume", () => {
    expect(ev.points.map((p) => p.logId)).toEqual(["l1", "l2", "l3", "l4"]);
    expect(ev.points[0]).toMatchObject({ topLoad: 55, sets: 3, volumeLoad: 50 * 10 + 50 * 10 + 55 * 8 });
    expect(ev.points[3]).toMatchObject({ topLoad: 60, bestE1rm: 80 });
  });
  it("carga mais pesada e melhor 1RM", () => {
    expect(ev.heaviest).toMatchObject({ loadKg: 60, reps: 10 });
    expect(ev.bestE1rm?.value).toBe(80);
  });
  it("recordes: só quando a melhor série supera a melhor anterior (a primeira sessão é a base)", () => {
    // 1RM por sessão: l1 ≈ 69,7 (55×8) ; l2 ≈ 71,5 (55×9) → recorde; l3 ≈ 69,7 → não; l4 = 80 → recorde
    expect(ev.records).toBe(2);
    expect(ev.points.map((p) => p.isRecord)).toEqual([false, true, false, true]); // marca em quais sessões ocorreram os recordes
  });
  it("variação entre o primeiro e o último ponto", () => {
    expect(ev.change.loadKg).toBe(5);
    expect(ev.change.e1rm).toBeCloseTo(80 - 69.7, 1);
  });
  it("separa exercícios e ignora séries sem dados", () => {
    const r = computeEvolution([S("a", 1, 10, 20, "x", "Rosca"), S("a", 1, null, null, "x", "Rosca"), S("a", 1, 10, 50, "y", "Remada")]);
    expect(r.map((e) => e.name).sort()).toEqual(["Remada", "Rosca"]);
    expect(r.find((e) => e.name === "Rosca")!.points[0].sets).toBe(1);
  });
  it("sem séries, sem evolução", () => expect(computeEvolution([])).toEqual([]));
});

describe("aderência", () => {
  const now = new Date("2026-11-29T00:00:00Z");
  it("sessões concluídas / previstas (frequência × semanas)", () => {
    const a = computeAdherence({ finishedSessions: 9, prescribedDone: 9, prescribedTotal: 10, now, programs: [{ weeklyFrequency: 3, since: "2026-11-08T00:00:00Z" }] });
    expect(a).toMatchObject({ sessionsCompleted: 9, sessionsPlanned: 9, adherencePct: 100, completionPct: 90 }); // 3 semanas × 3
  });
  it("limita em 100% e exige frequência definida", () => {
    expect(computeAdherence({ finishedSessions: 20, prescribedDone: 1, prescribedTotal: 1, now, programs: [{ weeklyFrequency: 1, since: "2026-11-22T00:00:00Z" }] }).adherencePct).toBe(100);
    const none = computeAdherence({ finishedSessions: 4, prescribedDone: 4, prescribedTotal: 8, now, programs: [{ weeklyFrequency: null, since: "2026-11-01T00:00:00Z" }] });
    expect(none).toMatchObject({ sessionsCompleted: 4, sessionsPlanned: null, adherencePct: null, completionPct: 50 });
  });
  it("sem prescrição concluída, sem taxa", () => {
    expect(computeAdherence({ finishedSessions: 0, prescribedDone: 0, prescribedTotal: 0, now, programs: [] }).completionPct).toBeNull();
  });
});
