import { beforeAll, describe, expect, it } from "vitest";
import { has3D, jointsAt, LEN, modelUrl, nameFromModelUrl, repetition, SPECS, type Joints, type V3 } from "../src/lib/exercise3d";
import { getDb, resetDb } from "../src/server/db";
import * as h4 from "../src/server/handlers4";
import { ensureOfficialMedia } from "../src/server/officialMedia";
import { OFFICIAL_EXERCISES } from "../src/server/schema";
import { call, h, inviteStudent, registerTrainer } from "./helpers";

const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const all = (j: Joints): V3[] => [j.hipC, j.shoulderC, j.head, j.neckTop, ...j.hip, ...j.shoulder, ...j.elbow, ...j.wrist, ...j.knee, ...j.ankle, ...j.toe];

describe("animações 3D: cobertura e consistência do boneco", () => {
  it("todo exercício do catálogo oficial tem animação 3D (e só eles)", () => {
    expect(OFFICIAL_EXERCISES.every((e) => has3D(e.name))).toBe(true);
    expect(Object.keys(SPECS).sort()).toEqual(OFFICIAL_EXERCISES.map((e) => e.name).sort());
  });
  it("o músculo destacado corresponde ao músculo primário do catálogo (nenhum exercício sem destaque)", () => {
    const map: Record<string, string[]> = { Quadríceps: ["quad"], "Posterior de coxa": ["ham"], "Glúteo máximo": ["glute"], Panturrilha: ["calf"], Peitoral: ["chest"], Dorsais: ["back"], "Deltoide anterior": ["delt"], "Deltoide lateral": ["delt"], Bíceps: ["biceps"], Tríceps: ["triceps"], Abdômen: ["abs"] };
    for (const e of OFFICIAL_EXERCISES) {
      const wanted = e.primary.flatMap((p) => map[p] ?? []);
      expect(wanted.length, e.name).toBeGreaterThan(0);
      for (const w of wanted) expect(SPECS[e.name].muscles, `${e.name}: ${w}`).toContain(w);
    }
  });
  it("os segmentos mantêm o comprimento em toda a repetição e nada vira NaN", () => {
    for (const [name, spec] of Object.entries(SPECS)) {
      for (const u of [0, 0.25, 0.5, 0.75, 1]) {
        const j = jointsAt(spec, u);
        for (const p of all(j)) p.forEach((v) => expect(Number.isFinite(v), name).toBe(true));
        expect(dist(j.hipC, j.shoulderC)).toBeCloseTo(LEN.torso, 5);
        for (const i of [0, 1] as const) {
          expect(dist(j.hip[i], j.knee[i])).toBeCloseTo(LEN.thigh, 5); expect(dist(j.knee[i], j.ankle[i])).toBeCloseTo(LEN.shin, 5);
          expect(dist(j.shoulder[i], j.elbow[i])).toBeCloseTo(LEN.ua, 5); expect(dist(j.elbow[i], j.wrist[i])).toBeCloseTo(LEN.fa, 5);
        }
      }
    }
  });
  it("em pé, o pé fica no chão; nenhum exercício afunda o corpo abaixo do chão", () => {
    for (const [name, spec] of Object.entries(SPECS)) {
      for (const u of [0, 0.5, 1]) {
        const j = jointsAt(spec, u);
        const minY = Math.min(...all(j).map((p) => p[1]));
        expect(minY, `${name} u=${u}`).toBeGreaterThan(-0.15);
        if (spec.anchor.type !== "hip") expect(Math.min(j.ankle[0][1], j.toe[0][1]), name).toBeCloseTo(0.04, 3);
      }
    }
  });
  it("o movimento existe: início e fim são poses diferentes", () => {
    for (const [name, spec] of Object.entries(SPECS)) {
      const a = jointsAt(spec, 0), b = jointsAt(spec, 1);
      const moved = Math.max(...all(a).map((p, i) => dist(p, all(b)[i])));
      expect(moved, name).toBeGreaterThan(0.12);
    }
  });
  it("o equipamento tem sempre a mesma quantidade de peças (o desenho só atualiza posições)", () => {
    for (const [name, spec] of Object.entries(SPECS)) {
      const n = spec.equip(jointsAt(spec, 0), 0).length;
      for (const u of [0.3, 0.7, 1]) expect(spec.equip(jointsAt(spec, u), u).length, name).toBe(n);
    }
  });
  it("elevação lateral e crucifixo abrem os braços para o lado (plano frontal), não para a frente", () => {
    for (const n of ["Elevação lateral", "Crucifixo"]) {
      const j = jointsAt(SPECS[n], 1);
      expect(Math.abs(j.wrist[0][2] - j.shoulder[0][2]), n).toBeGreaterThan(0.4);   // distância lateral
      expect(Math.abs(j.wrist[0][0] - j.shoulder[0][0]), n).toBeLessThan(0.05);      // quase nada para frente
    }
  });
  it("repetição: pausa nas pontas, suave, volta ao início", () => {
    expect(repetition(0)).toBe(0); expect(repetition(0.5)).toBe(1); expect(repetition(1)).toBe(0); expect(repetition(0.3)).toBeGreaterThan(0.2);
    expect(repetition(0.06)).toBe(0); expect(repetition(0.56)).toBe(1);
  });
  it("url do modelo: ida e volta; nome desconhecido não vira modelo", () => {
    expect(nameFromModelUrl(modelUrl("Elevação lateral"))).toBe("Elevação lateral");
    expect(nameFromModelUrl("3d:inexistente")).toBeNull(); expect(nameFromModelUrl("https://x.com/a.mp4")).toBeNull();
  });
});

describe("registro das animações oficiais no banco", () => {
  beforeAll(async () => { await resetDb(); });
  it("cria uma por exercício, uma vez só, e migra registros antigos em SVG 2D para 3D", async () => {
    const db = await getDb();
    expect(await ensureOfficialMedia(db)).toBe(OFFICIAL_EXERCISES.length);
    expect(await ensureOfficialMedia(db)).toBe(0);
    const ex = (await db.query<{ id: string }>("select id from exercises where consultancy_id is null and name = 'Stiff'")).rows[0].id;
    await db.query("update exercise_media set url = '/media/animations/stiff.svg' where exercise_id = $1", [ex]);
    expect(await ensureOfficialMedia(db)).toBe(1);
    expect((await db.query<{ url: string }>("select url from exercise_media where exercise_id = $1", [ex])).rows.map((r) => r.url)).toEqual(["3d:stiff"]);
  });
  it("o aluno recebe a animação 3D oficial do exercício; outra consultoria vê a mesma (catálogo compartilhado), sem vazar mídia própria", async () => {
    const alfa = await registerTrainer("m3dA"); const beta = await registerTrainer("m3dB");
    const a1 = await inviteStudent(alfa, "m3d1");
    const ex = ((await call(h.listExercises, { cookie: alfa })).body as any[]).find((e) => e.name === "Agachamento livre");
    await call(h4.addExerciseMedia, { cookie: alfa, params: { id: ex.id }, body: { title: "Meu agachamento", url: "https://exemplo.com/a.mp4" } });
    const r = await call(h4.getExerciseMedia, { cookie: a1.cookie, params: { id: ex.id } });
    expect(r.body.resolved.items.map((i: any) => [i.source, i.url])).toEqual([["official", "3d:agachamento-livre"]]);
    const t = await call(h4.getExerciseMedia, { cookie: beta, params: { id: ex.id } });
    expect(t.body.own).toEqual([]);
  });
});
