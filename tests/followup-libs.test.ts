import { describe, expect, it } from "vitest";
import { BUILTIN_TEMPLATES, numericDeltas, validateAnswers, type Field } from "../src/lib/assessment";
import { CHECKIN_QUESTIONS, computeFlags, dueStatus, priority, questionsFor } from "../src/lib/checkin";
import { isDirectVideoFile, isSafeMediaUrl, pickPref, resolveMedia, type MediaItem } from "../src/lib/media";

const M = (id: string, kind: "animation" | "video" = "animation"): MediaItem => ({ id, kind, title: id, url: `https://x.test/${id}`, license: null });

describe("mídia do exercício (oficial, própria ou ambas)", () => {
  const official = [M("anim")], own = [M("meu1", "video"), M("meu2", "video")];
  it("padrão: animação oficial", () => expect(resolveMedia(official, own, null)).toMatchObject({ mode: "official", items: [{ id: "anim", source: "official" }] }));
  it("própria substitui a oficial (a escolhida)", () => {
    const r = resolveMedia(official, own, { studentId: null, mode: "own", ownMediaId: "meu2" });
    expect(r.items.map((i) => [i.id, i.source])).toEqual([["meu2", "own"]]);
  });
  it("ambas exibe as duas mídias", () => {
    const r = resolveMedia(official, own, { studentId: null, mode: "both", ownMediaId: "meu1" });
    expect(r.items.map((i) => i.source)).toEqual(["official", "own"]);
  });
  it("sem oficial, usa a própria (e avisa que é reserva); sem nenhuma, vazio", () => {
    expect(resolveMedia([], own, null)).toMatchObject({ fallback: true, items: [{ id: "meu1" }] });
    expect(resolveMedia([], [], null).items).toEqual([]);
    expect(resolveMedia(official, [], { studentId: null, mode: "own", ownMediaId: null })).toMatchObject({ fallback: true, items: [{ id: "anim" }] });
  });
  it("preferência do aluno prevalece sobre a geral", () => {
    const prefs = [{ studentId: null, mode: "official" as const, ownMediaId: null }, { studentId: "s1", mode: "both" as const, ownMediaId: "meu1" }];
    expect(pickPref(prefs, "s1")?.mode).toBe("both");
    expect(pickPref(prefs, "s2")?.mode).toBe("official");
    expect(pickPref(prefs, null)?.mode).toBe("official");
    expect(pickPref([], "s1")).toBeNull();
  });
  it("só aceita links https", () => {
    expect(isSafeMediaUrl("https://exemplo.com/v.mp4")).toBe(true);
    for (const bad of ["http://exemplo.com", "javascript:alert(1)", "data:text/html,x", "ftp://x.com/a", "not a url", ""]) expect(isSafeMediaUrl(bad)).toBe(false);
    expect(isDirectVideoFile("https://x.com/a.MP4?t=1")).toBe(true);
    expect(isDirectVideoFile("https://youtube.com/watch?v=1")).toBe(false);
  });
});

describe("validação de avaliações", () => {
  const fields: Field[] = [
    { id: "peso", label: "Peso", type: "number", unit: "kg", required: true },
    { id: "nivel", label: "Nível", type: "choice", options: ["A", "B"] },
    { id: "ok", label: "Ok?", type: "yesno" },
    { id: "nota", label: "Nota", type: "scale", min: 1, max: 5 },
    { id: "obs", label: "Obs", type: "text" },
  ];
  it("aceita respostas válidas e limpa o texto", () => {
    const r = validateAnswers(fields, { peso: 80.5, nivel: "A", ok: true, nota: 3, obs: "  oi  " });
    expect(r.ok).toBe(true);
    expect(r.clean).toMatchObject({ peso: 80.5, obs: "oi" });
  });
  it("campos obrigatórios, tipos, intervalos e opções", () => {
    expect(validateAnswers(fields, {}).errors.peso).toBe("Obrigatório");
    expect(validateAnswers(fields, { peso: "80" }).errors.peso).toBeDefined();
    expect(validateAnswers(fields, { peso: -1 }).errors.peso).toBeDefined();
    expect(validateAnswers(fields, { peso: 1, nivel: "Z" }).errors.nivel).toBeDefined();
    expect(validateAnswers(fields, { peso: 1, ok: "sim" }).errors.ok).toBeDefined();
    expect(validateAnswers(fields, { peso: 1, nota: 6 }).errors.nota).toBeDefined();
    expect(validateAnswers(fields, { peso: 1, nota: 2.5 }).errors.nota).toBeDefined();
    expect(validateAnswers(fields, { peso: 1, obs: "x".repeat(2001) }).errors.obs).toBeDefined();
  });
  it("recusa campos que não existem no modelo", () => {
    expect(validateAnswers(fields, { peso: 1, invasor: 1 }).errors.invasor).toBe("Campo desconhecido");
  });
  it("variação entre avaliações (medidas)", () => {
    expect(numericDeltas(fields, { peso: 79, obs: "x" }, { peso: 80.5 })).toEqual({ peso: -1.5 });
    expect(numericDeltas(fields, { peso: 79 }, null)).toEqual({ peso: null });
  });
  it("modelos prontos são válidos e a triagem avisa que não é o PAR-Q+", () => {
    for (const t of BUILTIN_TEMPLATES) {
      expect(new Set(t.fields.map((f) => f.id)).size).toBe(t.fields.length);
      expect(validateAnswers(t.fields, {}).errors).toBeDefined();
    }
    expect(BUILTIN_TEMPLATES.find((t) => t.key === "triagem")!.note).toMatch(/NÃO é o PAR-Q\+/);
  });
});

describe("check-ins: sinais de atenção e frequência", () => {
  const base = { sono: 7, fadiga: 4, estresse: 3, motivacao: 8, dor: "Não" };
  it("sem sinais quando está tudo bem", () => expect(computeFlags(base)).toEqual([]));
  it("dor significativa é alerta; leve é atenção", () => {
    expect(computeFlags({ ...base, dor: "Sim, desconforto significativo" })).toEqual([expect.objectContaining({ id: "dor", level: "alert" })]);
    expect(computeFlags({ ...base, dor: "Sim, desconforto leve" })[0].level).toBe("attention");
  });
  it("limiares de fadiga, estresse, sono e motivação", () => {
    expect(computeFlags({ ...base, fadiga: 8 }).map((f) => f.id)).toEqual(["fadiga"]);
    expect(computeFlags({ ...base, fadiga: 7 })).toEqual([]);
    expect(computeFlags({ ...base, estresse: 8, sono: 3, motivacao: 3 }).map((f) => f.id).sort()).toEqual(["estresse", "motivacao", "sono"]);
  });
  it("prioridade do painel", () => {
    expect(priority([])).toBe(0);
    expect(priority(computeFlags({ ...base, fadiga: 9 }))).toBe(1);
    expect(priority(computeFlags({ ...base, dor: "Sim, desconforto significativo" }))).toBe(2);
  });
  it("perguntas configuráveis e vencimento", () => {
    expect(questionsFor(["sono", "dor"]).map((q) => q.id)).toEqual(["sono", "dor"]);
    expect(questionsFor(null)).toHaveLength(CHECKIN_QUESTIONS.length);
    const now = new Date("2026-11-25T12:00:00Z");
    expect(dueStatus(null, 7, now).due).toBe(true);
    expect(dueStatus("2026-11-20T12:00:00Z", 7, now).due).toBe(false);
    expect(dueStatus("2026-11-18T12:00:00Z", 7, now).due).toBe(true);
  });
});
