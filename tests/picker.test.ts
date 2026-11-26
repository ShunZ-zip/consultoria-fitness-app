import { describe, expect, it } from "vitest";
import { APP_PRESETS, appPreset, cloneSets, DEFAULT_PRESET_ID, describeSets } from "../src/lib/setPresets";
import * as h4 from "../src/server/handlers4";
import * as h8 from "../src/server/handlers8";
import { call, firstExercises, inviteStudent, registerTrainer } from "./helpers";

describe("presets do app (puros)", () => {
  it("o preset padrão existe e é 3×12", () => {
    const p = appPreset(DEFAULT_PRESET_ID)!;
    expect(p.sets).toHaveLength(3);
    expect(p.sets.every((s) => s.reps === 12 && s.setType === "work")).toBe(true);
  });
  it("ids e nomes únicos; toda série respeita os limites da prescrição", () => {
    expect(new Set(APP_PRESETS.map((p) => p.id)).size).toBe(APP_PRESETS.length);
    expect(new Set(APP_PRESETS.map((p) => p.name.toLowerCase())).size).toBe(APP_PRESETS.length);
    for (const p of APP_PRESETS) for (const s of p.sets) {
      expect(s.reps == null || (s.reps >= 1 && s.reps <= 100), p.id).toBe(true);
      expect(s.repsMax == null || (s.reps != null && s.repsMax >= s.reps), p.id).toBe(true);
      expect(!(s.rir != null && s.rpe != null), p.id).toBe(true);
      expect(!(s.loadKg != null && s.loadPct != null), p.id).toBe(true);
    }
  });
  it("pirâmides têm direções opostas e o descanso vem preenchido", () => {
    const up = appPreset("piramide-crescente")!.sets.map((s) => s.reps!);
    const down = appPreset("piramide-decrescente")!.sets.map((s) => s.reps!);
    expect(up).toEqual([...up].sort((a, b) => b - a));
    expect(down).toEqual([...down].sort((a, b) => a - b));
    expect(APP_PRESETS.every((p) => p.sets.every((s) => s.restS != null))).toBe(true);
  });
  it("cloneSets devolve cópias independentes; describeSets resume", () => {
    const base = appPreset("3x12")!.sets; const copy = cloneSets(base);
    copy[0].reps = 99;
    expect(base[0].reps).toBe(12);
    expect(describeSets(base)).toBe("3 séries · 12 reps");
    expect(describeSets(appPreset("piramide-crescente")!.sets)).toBe("4 séries · 12/10/8/6 reps");
  });
});

describe("favoritos e presets do personal (API)", () => {
  const sets = [{ setType: "work", reps: 8, repsMax: 10, restS: 90 }, { setType: "work", reps: 8, restS: 90 }];

  it("favoritar é por usuário, idempotente e reversível; outro personal não vê", async () => {
    const a = await registerTrainer("pk-a"); const b = await registerTrainer("pk-b");
    const [ex] = await firstExercises(a, 1);
    expect((await call(h8.setFavorite, { method: "PUT", params: { id: ex }, body: { favorite: true }, cookie: a })).status).toBe(200);
    await call(h8.setFavorite, { method: "PUT", params: { id: ex }, body: { favorite: true }, cookie: a });
    expect((await call(h8.listFavorites, { cookie: a })).body).toEqual([ex]);
    expect((await call(h8.listFavorites, { cookie: b })).body).toEqual([]);
    await call(h8.setFavorite, { method: "PUT", params: { id: ex }, body: { favorite: false }, cookie: a });
    expect((await call(h8.listFavorites, { cookie: a })).body).toEqual([]);
  });

  it("não favorita exercício próprio de outra consultoria (404), id inválido 404, aluno 403, sem sessão 401", async () => {
    const a = await registerTrainer("pk-c"); const b = await registerTrainer("pk-d");
    const own = await call(h4.createExercise, { body: { name: "Exercício só da C", primaryMuscles: ["Peito"] }, cookie: a });
    expect(own.status).toBe(201);
    expect((await call(h8.setFavorite, { method: "PUT", params: { id: own.body.id }, body: { favorite: true }, cookie: b })).status).toBe(404);
    expect((await call(h8.setFavorite, { method: "PUT", params: { id: "nao-e-uuid" }, body: { favorite: true }, cookie: a })).status).toBe(404);
    const stu = await inviteStudent(a, "pk-stu");
    expect((await call(h8.listFavorites, { cookie: stu.cookie })).status).toBe(403);
    expect((await call(h8.setFavorite, { method: "PUT", params: { id: own.body.id }, body: { favorite: true }, cookie: stu.cookie })).status).toBe(403);
    expect((await call(h8.listFavorites)).status).toBe(401);
  });

  it("presets próprios: cria, lista com os do app, nome repetido 409, inválido 400, escopo por consultoria, exclui", async () => {
    const a = await registerTrainer("pk-e"); const b = await registerTrainer("pk-f");
    const ok = await call(h8.createSetPreset, { body: { name: "Meu 8-10", sets }, cookie: a });
    expect(ok.status).toBe(201);
    expect((await call(h8.createSetPreset, { body: { name: "meu 8-10", sets }, cookie: a })).status).toBe(409);
    expect((await call(h8.createSetPreset, { body: { name: "3×12", sets }, cookie: a })).status).toBe(409); // não imita um preset do app
    expect((await call(h8.createSetPreset, { body: { name: "Vazio", sets: [] }, cookie: a })).status).toBe(400);
    expect((await call(h8.createSetPreset, { body: { name: "RIR e RPE", sets: [{ reps: 8, rir: 2, rpe: 8 }] }, cookie: a })).status).toBe(400);
    const la = (await call(h8.listSetPresets, { cookie: a })).body;
    expect(la.mine.map((p: any) => p.name)).toEqual(["Meu 8-10"]);
    expect(la.app.length).toBe(APP_PRESETS.length);
    expect((await call(h8.listSetPresets, { cookie: b })).body.mine).toEqual([]);
    expect((await call(h8.createSetPreset, { body: { name: "Meu 8-10", sets }, cookie: b })).status).toBe(201); // mesmo nome em outra consultoria é permitido
    expect((await call(h8.deleteSetPreset, { method: "DELETE", params: { id: ok.body.id }, cookie: b })).status).toBe(404); // de outra consultoria
    expect((await call(h8.deleteSetPreset, { method: "DELETE", params: { id: ok.body.id }, cookie: a })).status).toBe(200);
    expect((await call(h8.listSetPresets, { cookie: a })).body.mine).toEqual([]);
  });

  it("aluno não acessa presets (403)", async () => {
    const a = await registerTrainer("pk-g"); const stu = await inviteStudent(a, "pk-stu2");
    expect((await call(h8.listSetPresets, { cookie: stu.cookie })).status).toBe(403);
    expect((await call(h8.createSetPreset, { body: { name: "x", sets }, cookie: stu.cookie })).status).toBe(403);
  });
});
