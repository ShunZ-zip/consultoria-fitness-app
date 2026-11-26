import { beforeAll, describe, expect, it } from "vitest";
import { analyze, applyProposal, MIN_SESSIONS, type AnalysisInput, type ExerciseObs, type SessionObs, type SetObs } from "../src/lib/suggestions";
import { getDb, resetDb } from "../src/server/db";
import * as h4 from "../src/server/handlers4";
import * as h7 from "../src/server/handlers7";
import { call, h, inviteStudent, registerTrainer, uuid } from "./helpers";

// ---------------------------------------------------------------- regras puras
const set = (o: Partial<SetObs> = {}): SetObs => ({ reps: 10, loadKg: 40, rir: 2, targetReps: 8, targetRepsMax: 10, targetRir: 2, targetLoadKg: 40, ...o });
const sess = (day: number, sets: SetObs[]): SessionObs => ({ logId: `l${day}`, date: new Date(Date.UTC(2026, 10, day)).toISOString(), sets });
const exo = (sessions: SessionObs[], o: Partial<ExerciseObs> = {}): ExerciseObs => ({ exerciseId: "e1", name: "Supino reto", prescribedWorkSets: 3, sessions, ...o });
const input = (exercises: ExerciseObs[], o: Partial<AnalysisInput> = {}): AnalysisInput => ({ finishedSessions: 3, exercises, checkins: [], muscles: [], ...o });
const kinds = (i: AnalysisInput) => analyze(i).suggestions.map((s) => s.kind);

describe("regras puras", () => {
  it("dados insuficientes: não sugere nada e diz o que falta", () => {
    const r = analyze(input([exo([sess(1, [set()]), sess(2, [set()])])], { finishedSessions: 2 }));
    expect(r.suggestions).toEqual([]);
    expect(r.insufficient).toMatchObject({ have: 2, need: MIN_SESSIONS });
    expect(r.insufficient!.message).toMatch(/Dados insuficientes/);
    expect(r.disclaimer).toMatch(/hipertrofia/);
  });
  it("revisar carga: dispara com 3 sessões no topo da faixa e RIR >= meta; evidências batem", () => {
    const e = exo([sess(1, [set(), set()]), sess(2, [set(), set()]), sess(3, [set({ rir: 3 }), set()])]);
    const r = analyze(input([e]));
    const s = r.suggestions.find((x) => x.kind === "load_review")!;
    expect(s.proposal).toEqual({ type: "increase_load", exerciseId: "e1", exerciseName: "Supino reto", deltaKg: 2.5 });
    expect(s.evidence.rows).toHaveLength(3);
    expect(s.evidence.rows[2]).toEqual(["03/11", "10 / 10", "40 / 40", "3 / 2", "10 / 10", "2 / 2"]);
    expect(s.rationale).toMatch(/\+2,5 kg/);
  });
  it("revisar carga: NÃO dispara sem RIR registrado, com RIR abaixo da meta, reps abaixo do topo ou só 2 sessões", () => {
    const ok = [sess(1, [set()]), sess(2, [set()]), sess(3, [set()])];
    expect(kinds(input([exo(ok)]))).toContain("load_review");
    expect(kinds(input([exo([...ok.slice(0, 2), sess(3, [set({ rir: null })])])]))).not.toContain("load_review");
    expect(kinds(input([exo([...ok.slice(0, 2), sess(3, [set({ rir: 1 })])])]))).not.toContain("load_review");
    expect(kinds(input([exo([...ok.slice(0, 2), sess(3, [set({ reps: 9 })])])]))).not.toContain("load_review");
    expect(kinds(input([exo(ok.slice(1))]))).not.toContain("load_review");
    expect(kinds(input([exo(ok.map((s) => ({ ...s, sets: [set({ targetRir: null })] })))]))).not.toContain("load_review"); // sem meta de RIR não dá para julgar
  });
  it("carga prescrita em %: sugere revisar, mas sem proposta automática", () => {
    const pct = [1, 2, 3].map((d) => sess(d, [set({ targetLoadKg: null })]));
    const s = analyze(input([exo(pct)])).suggestions.find((x) => x.kind === "load_review")!;
    expect(s.proposal).toBeNull();
    expect(s.rationale).toMatch(/manualmente/);
  });
  it("revisar volume: 1RM caindo 2 vezes + check-in com fadiga/dor; sem o check-in ou sem a queda, não", () => {
    const falling = [sess(1, [set({ loadKg: 60, reps: 8 })]), sess(2, [set({ loadKg: 57.5, reps: 8 })]), sess(3, [set({ loadKg: 55, reps: 8 })])];
    const flag = [{ date: new Date(Date.UTC(2026, 10, 3)).toISOString(), flags: [{ id: "fadiga", level: "attention", reason: "Fadiga alta (9/10)" }] }];
    const r = analyze(input([exo(falling)], { checkins: flag })).suggestions.find((x) => x.kind === "volume_review")!;
    expect(r.proposal).toMatchObject({ type: "remove_work_set", exerciseId: "e1" });
    expect(r.evidence.rows.map((x) => x[1])).toEqual(["76", "72,8", "69,7"]);
    expect(r.evidence.notes![0]).toMatch(/Fadiga alta/);
    expect(kinds(input([exo(falling)]))).not.toContain("volume_review"); // sem sinais no check-in
    const flat = [sess(1, [set({ loadKg: 60, reps: 8 })]), sess(2, [set({ loadKg: 60, reps: 8 })]), sess(3, [set({ loadKg: 62, reps: 8 })])];
    expect(kinds(input([exo(flat)], { checkins: flag }))).not.toContain("volume_review");
    expect(analyze(input([exo(falling, { prescribedWorkSets: 1 })], { checkins: flag })).suggestions.find((x) => x.kind === "volume_review")!.proposal).toBeNull(); // nunca zera o exercício
  });
  it("inconsistências: nunca registrado, muito abaixo da prescrição e volume desbalanceado", () => {
    expect(kinds(input([exo([], { name: "Rosca" })]))).toEqual(["never_logged"]);
    const low = [1, 2, 3].map((d) => sess(d, [set({ reps: 4, targetReps: 10, rir: null })]));
    expect(kinds(input([exo(low)]))).toContain("off_prescription");
    const m = (muscle: string, weighted: number) => ({ muscle, direct: weighted, indirect: 0, weighted, warmup: 0, prep: 0 });
    expect(kinds(input([], { muscles: [m("Peitoral", 12), m("Dorsais", 6), m("Bíceps", 2)] }))).toEqual(["volume_imbalance"]);
    expect(kinds(input([], { muscles: [m("Peitoral", 12), m("Dorsais", 6), m("Bíceps", 4)] }))).toEqual([]);
    expect(kinds(input([], { muscles: [m("Peitoral", 12), m("Bíceps", 1)] }))).toEqual([]); // menos de 3 músculos
  });
  it("applyProposal: aumenta só as séries de trabalho com kg do exercício certo; remove a última série de trabalho; não zera", () => {
    const items = [
      { exerciseId: "e1", sets: [{ setType: "warmup", loadKg: 20 }, { setType: "work", loadKg: 40 }, { setType: "work", loadKg: 40 }, { setType: "work", loadKg: null, loadPct: 80 }] },
      { exerciseId: "e2", sets: [{ setType: "work", loadKg: 50 }] },
    ];
    const up = applyProposal(items, { type: "increase_load", exerciseId: "e1", exerciseName: "x", deltaKg: 2.5 });
    expect(up[0].sets.map((s) => s.loadKg)).toEqual([20, 42.5, 42.5, null]);
    expect(up[1]).toBe(items[1]);
    expect(items[0].sets[1].loadKg).toBe(40); // não muta a entrada
    const rm = applyProposal(items, { type: "remove_work_set", exerciseId: "e1", exerciseName: "x" });
    expect(rm[0].sets).toHaveLength(3);
    expect(applyProposal(items, { type: "remove_work_set", exerciseId: "e2", exerciseName: "x" })[1].sets).toHaveLength(1);
  });
});

// ---------------------------------------------------------------- API
let alfa: string, beta: string;
let ex: Record<string, any> = {};
type W = { s: { cookie: string; id: string }; v: string; sets: string[] };

const targets = { reps: 8, repsMax: 10, loadKg: 40, rir: 2 };
async function world(label: string, studentSets = [targets, targets, targets]): Promise<W> {
  const s = await inviteStudent(alfa, label);
  const v = (await call(h.createVersion, { cookie: alfa, body: { studentId: s.id, name: "Treino A", publish: true, exercises: [
    { exerciseId: ex["Supino reto"].id, sets: studentSets }, { exerciseId: ex["Remada curvada"].id, sets: [{ reps: 10, loadKg: 50 }] }] } })).body.id as string;
  const d = (await call(h.getVersion, { cookie: s.cookie, params: { id: v } })).body;
  return { s, v, sets: d.exercises[0].sets.map((x: any) => x.id) };
}
async function session(w: W, daysAgo: number, o: { reps?: number; loadKg?: number; rir?: number | null } = {}) {
  const log = (await call(h.startLog, { body: {}, cookie: w.s.cookie, params: { id: w.v } })).body.id as string;
  for (const sid of w.sets) {
    const body: any = { versionSetId: sid, reps: o.reps ?? 10, loadKg: o.loadKg ?? 40 };
    if (o.rir !== null) body.rir = o.rir ?? 2;
    await call(h.putLoggedSet, { method: "PUT", cookie: w.s.cookie, params: { id: log, setId: uuid() }, body });
  }
  await call(h.finishLog, { cookie: w.s.cookie, params: { id: log }, body: {} });
  await (await getDb()).query("update workout_logs set started_at = now() - ($2 || ' days')::interval where id = $1", [log, String(daysAgo)]);
}
const gen = (cookie: string, id: string) => call(h7.generateSuggestions, { cookie, params: { id }, body: {} });
const list = async (cookie: string, id: string) => (await call(h7.listStudentSuggestions, { cookie, params: { id } })).body as any[];
const approve = (cookie: string, id: string) => call(h7.approveSuggestion, { cookie, params: { id }, body: {} });
const reject = (cookie: string, id: string) => call(h7.rejectSuggestion, { cookie, params: { id }, body: {} });
const versionsOf = async (studentId: string) => (await (await getDb()).query<{ version: number; status: string }>(
  "select pv.version, pv.status from program_versions pv join programs p on p.id = pv.program_id where p.student_id = $1 order by pv.version", [studentId])).rows;

beforeAll(async () => {
  await resetDb();
  alfa = await registerTrainer("alfa");
  beta = await registerTrainer("beta");
  ex = Object.fromEntries(((await call(h.listExercises, { cookie: alfa })).body as any[]).map((e) => [e.name, e]));
});

describe("geração, evidências e aprovação", () => {
  let w: W;
  beforeAll(async () => { w = await world("sg1"); });

  it("dados insuficientes: nada é criado e a resposta explica quantas sessões existem", async () => {
    expect((await gen(alfa, w.s.id)).body.versions[0].insufficient).toMatchObject({ have: 0, need: 3 });
    await session(w, 14); await session(w, 7);
    const r = await gen(alfa, w.s.id);
    expect(r.body).toMatchObject({ created: 0 });
    expect(r.body.versions[0].insufficient).toMatchObject({ have: 2 });
    expect(await list(alfa, w.s.id)).toEqual([]);
  });
  it("aluno sem treino publicado: avisa, sem erro", async () => {
    const none = await inviteStudent(alfa, "sg0");
    expect((await gen(alfa, none.id)).body).toMatchObject({ created: 0, noPublishedWorkout: true });
  });
  it("com 3 sessões no topo da faixa e RIR na meta: sugere aumento de carga; evidências batem com os registros", async () => {
    await session(w, 0);
    const r = await gen(alfa, w.s.id);
    expect(r.body.created).toBeGreaterThanOrEqual(1);
    const s = (await list(alfa, w.s.id)).find((x) => x.kind === "load_review");
    expect(s).toMatchObject({ status: "pending", versionId: w.v, proposal: { type: "increase_load", deltaKg: 2.5 } });
    expect(s.evidence.rows).toHaveLength(3);
    expect(s.evidence.rows.every((row: string[]) => row[1] === "10 / 10 / 10" && row[2] === "40 / 40 / 40" && row[3] === "2 / 2 / 2")).toBe(true);
    expect((await list(alfa, w.s.id)).some((x) => x.kind === "never_logged" && /Remada curvada/.test(x.title))).toBe(true); // remada nunca registrada
  });
  it("gerar de novo não duplica", async () => {
    const before = (await list(alfa, w.s.id)).length;
    expect((await gen(alfa, w.s.id)).body.created).toBe(0);
    expect((await list(alfa, w.s.id)).length).toBe(before);
  });
  it("SEM aprovação nada muda: versão publicada intacta e nenhum rascunho", async () => {
    expect(await versionsOf(w.s.id)).toEqual([{ version: 1, status: "published" }]);
    const d = (await call(h.getVersion, { cookie: alfa, params: { id: w.v } })).body;
    expect(d.exercises[0].sets.map((x: any) => x.loadKg)).toEqual([40, 40, 40]);
  });
  it("aprovar cria apenas um RASCUNHO v2 com +2,5 kg no exercício certo; a v1 publicada segue intacta", async () => {
    const s = (await list(alfa, w.s.id)).find((x) => x.kind === "load_review");
    const r = await approve(alfa, s.id);
    expect(r.status).toBe(200);
    expect(await versionsOf(w.s.id)).toEqual([{ version: 1, status: "published" }, { version: 2, status: "draft" }]);
    const draft = (await call(h.getVersion, { cookie: alfa, params: { id: r.body.draftVersionId } })).body;
    expect(draft.status).toBe("draft");
    expect(draft.exercises[0].sets.map((x: any) => x.loadKg)).toEqual([42.5, 42.5, 42.5]);
    expect(draft.exercises[1].sets[0].loadKg).toBe(50);
    expect((await call(h.getVersion, { cookie: alfa, params: { id: w.v } })).body.exercises[0].sets.map((x: any) => x.loadKg)).toEqual([40, 40, 40]);
    expect((await call(h.getVersion, { cookie: w.s.cookie, params: { id: r.body.draftVersionId } })).status).toBe(404); // o aluno não vê o rascunho
    expect((await list(alfa, w.s.id)).find((x) => x.id === s.id)).toMatchObject({ status: "approved", resultVersionId: r.body.draftVersionId });
    expect((await approve(alfa, s.id)).status).toBe(409); // decidida
    const actions = (await call(h.listAudit, { cookie: alfa })).body.map((x: any) => x.action);
    expect(actions).toEqual(expect.arrayContaining(["suggestion.generate", "suggestion.approve", "version.create"]));
  });
  it("com rascunho aberto, aprovar outra sugestão com proposta é recusado (409) e nada muda", async () => {
    // a sugestão sem proposta (never_logged) pode ser aprovada: só registra que o personal viu
    const info = (await list(alfa, w.s.id)).find((x) => x.kind === "never_logged");
    expect(info.proposal).toBeNull();
    const r = await approve(alfa, info.id);
    expect(r.status).toBe(200); expect(r.body.draftVersionId).toBeNull();
    expect((await versionsOf(w.s.id)).length).toBe(2);
  });
  it("recusar não cria rascunho e a sugestão não volta ao gerar de novo", async () => {
    const w2 = await world("sg2");
    for (const d of [14, 7, 0]) await session(w2, d);
    await gen(alfa, w2.s.id);
    const s = (await list(alfa, w2.s.id)).find((x) => x.kind === "load_review");
    expect((await reject(alfa, s.id)).status).toBe(200);
    expect((await reject(alfa, s.id)).status).toBe(409);
    expect((await approve(alfa, s.id)).status).toBe(409);
    expect((await gen(alfa, w2.s.id)).body.created).toBe(0);
    expect((await list(alfa, w2.s.id)).find((x) => x.id === s.id).status).toBe("rejected");
    expect(await versionsOf(w2.s.id)).toEqual([{ version: 1, status: "published" }]);
  });
  it("não dispara sem RIR registrado nem com reps abaixo do topo", async () => {
    const wa = await world("sg3");
    for (const d of [14, 7, 0]) await session(wa, d, { rir: null });
    await gen(alfa, wa.s.id);
    expect((await list(alfa, wa.s.id)).some((x) => x.kind === "load_review")).toBe(false);
    const wb = await world("sg4");
    for (const d of [14, 7, 0]) await session(wb, d, { reps: 8 });
    await gen(alfa, wb.s.id);
    expect((await list(alfa, wb.s.id)).some((x) => x.kind === "load_review")).toBe(false);
  });
  it("desempenho caindo + check-in com fadiga: sugere rever volume; aprovar remove a última série no rascunho", async () => {
    const wc = await world("sg5");
    await session(wc, 14, { loadKg: 60, reps: 8 }); await session(wc, 7, { loadKg: 57.5, reps: 8 }); await session(wc, 0, { loadKg: 55, reps: 8 });
    await call(h4.postMyCheckin, { cookie: wc.s.cookie, body: { answers: { sono: 5, fadiga: 9, estresse: 4, motivacao: 6, dor: "Não" } } });
    await gen(alfa, wc.s.id);
    const s = (await list(alfa, wc.s.id)).find((x) => x.kind === "volume_review");
    expect(s.evidence.notes[0]).toMatch(/Fadiga alta/);
    const r = await approve(alfa, s.id);
    const draft = (await call(h.getVersion, { cookie: alfa, params: { id: r.body.draftVersionId } })).body;
    expect(draft.exercises[0].sets).toHaveLength(2);
    expect((await call(h.getVersion, { cookie: alfa, params: { id: wc.v } })).body.exercises[0].sets).toHaveLength(3);
  });
  it("treino mudou depois da sugestão: aprovar é recusado (409)", async () => {
    const wd = await world("sg6");
    for (const d of [14, 7, 0]) await session(wd, d);
    await gen(alfa, wd.s.id);
    const s = (await list(alfa, wd.s.id)).find((x) => x.kind === "load_review");
    const nv = await call(h.newVersion, { body: {}, cookie: alfa, params: { id: wd.v } });
    await call(h.publishVersion, { body: {}, cookie: alfa, params: { id: nv.body.id } });
    expect((await approve(alfa, s.id)).status).toBe(409);
    expect((await versionsOf(wd.s.id)).map((v) => v.status)).toEqual(["published", "published"]); // nenhum rascunho novo
  });
});

describe("isolamento e papéis", () => {
  let w: W, sid: string;
  beforeAll(async () => {
    w = await world("sg7");
    for (const d of [14, 7, 0]) await session(w, d);
    await gen(alfa, w.s.id);
    sid = (await list(alfa, w.s.id))[0].id;
  });
  it("outra consultoria: 404 em listar, gerar, aprovar e recusar; nada muda", async () => {
    expect((await call(h7.listStudentSuggestions, { cookie: beta, params: { id: w.s.id } })).status).toBe(404);
    expect((await gen(beta, w.s.id)).status).toBe(404);
    expect((await approve(beta, sid)).status).toBe(404);
    expect((await reject(beta, sid)).status).toBe(404);
    expect((await list(alfa, w.s.id)).find((x) => x.id === sid).status).toBe("pending");
  });
  it("aluno não vê nem decide sugestões (403); sem sessão 401; ids inválidos 404", async () => {
    for (const fn of [h7.listStudentSuggestions, h7.generateSuggestions]) expect((await call(fn, { cookie: w.s.cookie, params: { id: w.s.id }, body: {} })).status).toBe(403);
    expect((await approve(w.s.cookie, sid)).status).toBe(403);
    expect((await reject(w.s.cookie, sid)).status).toBe(403);
    expect((await call(h7.listStudentSuggestions, { params: { id: w.s.id } })).status).toBe(401);
    expect((await approve("", sid)).status).toBe(401);
    expect((await approve(alfa, "nao-uuid")).status).toBe(404);
    expect((await approve(alfa, uuid())).status).toBe(404);
  });
});
