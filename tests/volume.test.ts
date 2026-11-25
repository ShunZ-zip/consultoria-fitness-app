import { describe, expect, it } from "vitest";
import { computeVolume, type VolumeExercise } from "../src/lib/volume";

const w = (n: number) => Array.from({ length: n }, () => ({ setType: "work" as const }));
const supino: VolumeExercise = { primary: ["Peitoral"], secondary: ["Deltoide anterior", "Tríceps"], sets: w(4) };
const triceps: VolumeExercise = { primary: ["Tríceps"], secondary: [], sets: w(3) };

describe("volume por músculo", () => {
  it("separa diretas e indiretas e pondera com o peso configurado", () => {
    const v = Object.fromEntries(computeVolume([supino, triceps], 0.5).map((m) => [m.muscle, m]));
    expect(v["Peitoral"]).toMatchObject({ direct: 4, indirect: 0, weighted: 4 });
    expect(v["Tríceps"]).toMatchObject({ direct: 3, indirect: 4, weighted: 5 }); // 3 + 4 × 0,5
    expect(v["Deltoide anterior"]).toMatchObject({ direct: 0, indirect: 4, weighted: 2 });
  });

  it("o peso é configurável (0 a 1)", () => {
    const at = (weight: number) => computeVolume([supino, triceps], weight).find((m) => m.muscle === "Tríceps")!.weighted;
    expect(at(0)).toBe(3);
    expect(at(0.25)).toBe(4);
    expect(at(1)).toBe(7);
  });

  it("aquecimento e preparação não entram no ponderado", () => {
    const ex: VolumeExercise = {
      primary: ["Quadríceps"], secondary: ["Glúteo máximo"],
      sets: [{ setType: "warmup" }, { setType: "warmup" }, { setType: "prep" }, ...w(3)],
    };
    const v = computeVolume([ex], 0.5);
    expect(v.find((m) => m.muscle === "Quadríceps")).toMatchObject({ direct: 3, warmup: 2, prep: 1, weighted: 3 });
    // O secundário só recebe séries de trabalho como indiretas.
    expect(v.find((m) => m.muscle === "Glúteo máximo")).toMatchObject({ direct: 0, indirect: 3, warmup: 0, prep: 0, weighted: 1.5 });
  });

  it("exercício com dois músculos primários conta uma direta em cada", () => {
    const stiff: VolumeExercise = { primary: ["Posterior de coxa", "Glúteo máximo"], secondary: [], sets: w(2) };
    const v = computeVolume([stiff], 0.5);
    expect(v.map((m) => [m.muscle, m.direct])).toEqual(expect.arrayContaining([["Posterior de coxa", 2], ["Glúteo máximo", 2]]));
  });

  it("sem séries, sem volume", () => {
    expect(computeVolume([], 0.5)).toEqual([]);
  });
});
