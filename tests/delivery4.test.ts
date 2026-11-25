import { beforeAll, describe, expect, it } from "vitest";
import * as h4 from "../src/server/handlers4";
import { getDb, resetDb } from "../src/server/db";
import { call, h, inviteStudent, registerTrainer, uuid } from "./helpers";

let alfa: string, beta: string;
let a1: { cookie: string; id: string }, a2: { cookie: string; id: string }, b1: { cookie: string; id: string };
let ex: Record<string, any> = {};
let officialId: string;

const media = (cookie: string, id: string, studentId?: string) =>
  call(h4.getExerciseMedia, { cookie, params: { id }, ...(studentId ? {} : {}) });
const addVideo = (cookie: string, id: string, body: any) => call(h4.addExerciseMedia, { cookie, params: { id }, body });
const pref = (cookie: string, id: string, body: any) => call(h4.putMediaPreference, { method: "PUT", cookie, params: { id }, body });
const itemsFor = async (cookie: string, id: string) => (await media(cookie, id)).body.resolved.items.map((i: any) => [i.source, i.title]);

beforeAll(async () => {
  await resetDb();
  alfa = await registerTrainer("alfa");
  beta = await registerTrainer("beta");
  a1 = await inviteStudent(alfa, "a1");
  a2 = await inviteStudent(alfa, "a2");
  b1 = await inviteStudent(beta, "b1");
  ex = Object.fromEntries(((await call(h.listExercises, { cookie: alfa })).body as any[]).map((e) => [e.name, e]));
  officialId = ex["Supino reto"].id;
  // Animação oficial (do catálogo compartilhado). Nesta entrega não há produção de animações: usamos um registro de teste.
  await (await getDb()).query("insert into exercise_media (id, exercise_id, consultancy_id, kind, title, url) values ($1,$2,null,'animation','Animação oficial','https://cdn.exemplo.test/supino.mp4')", [uuid(), officialId]);
});

describe("biblioteca: exercícios próprios", () => {
  it("o personal cria exercício na biblioteca privada; outra consultoria não o vê nem o usa", async () => {
    const r = await call(h4.createExercise, { cookie: alfa, body: { name: "Remada no TRX", equipment: "TRX", primaryMuscles: ["Dorsais"], secondaryMuscles: ["Bíceps"] } });
    expect(r.status).toBe(201);
    const mine = (await call(h.listExercises, { cookie: alfa })).body.find((e: any) => e.name === "Remada no TRX");
    expect(mine).toMatchObject({ official: false, primaryMuscles: ["Dorsais"], secondaryMuscles: ["Bíceps"] });
    expect((await call(h.listExercises, { cookie: beta })).body.some((e: any) => e.name === "Remada no TRX")).toBe(false);
    expect((await call(h.listExercises, { cookie: a1.cookie })).body.some((e: any) => e.name === "Remada no TRX")).toBe(true); // o aluno da consultoria enxerga
    expect((await call(h.listExercises, { cookie: b1.cookie })).body.some((e: any) => e.name === "Remada no TRX")).toBe(false);
    expect((await media(beta, r.body.id)).status).toBe(404);
  });
  it("nome repetido (inclusive do oficial) é recusado; aluno não cria", async () => {
    expect((await call(h4.createExercise, { cookie: alfa, body: { name: "supino RETO", primaryMuscles: ["Peitoral"] } })).status).toBe(409);
    expect((await call(h4.createExercise, { cookie: alfa, body: { name: "Remada no TRX", primaryMuscles: ["Dorsais"] } })).status).toBe(409);
    expect((await call(h4.createExercise, { cookie: a1.cookie, body: { name: "X", primaryMuscles: ["Y"] } })).status).toBe(403);
    expect((await call(h4.createExercise, { cookie: alfa, body: { name: "Sem músculo", primaryMuscles: [] } })).status).toBe(400);
  });
});

describe("mídia: oficial, própria ou ambas, por escopo", () => {
  let own1: string, own2: string;
  it("padrão: o aluno vê a animação oficial", async () => {
    expect(await itemsFor(a1.cookie, officialId)).toEqual([["official", "Animação oficial"]]);
  });
  it("o personal adiciona vídeo próprio (só https, máx. 5)", async () => {
    const ok = await addVideo(alfa, officialId, { title: "Meu supino", url: "https://exemplo.com/meu.mp4" });
    expect(ok.status).toBe(201); own1 = ok.body.id;
    own2 = (await addVideo(alfa, officialId, { title: "Supino pegada fechada", url: "https://exemplo.com/outro.mp4" })).body.id;
    for (const url of ["http://exemplo.com/a.mp4", "javascript:alert(1)", "data:text/html,x", "nada"]) {
      expect((await addVideo(alfa, officialId, { title: "x", url })).status).toBe(400);
    }
    for (let i = 0; i < 3; i++) await addVideo(alfa, officialId, { title: `v${i}`, url: `https://exemplo.com/${i}.mp4` });
    expect((await addVideo(alfa, officialId, { title: "sexto", url: "https://exemplo.com/6.mp4" })).status).toBe(400);
  });
  it("vídeo próprio só aparece se o personal configurar", async () => {
    expect(await itemsFor(a1.cookie, officialId)).toEqual([["official", "Animação oficial"]]); // adicionar não muda o que o aluno vê
  });
  it("para todos os alunos: ambas as mídias", async () => {
    expect((await pref(alfa, officialId, { mode: "both", ownMediaId: own1 })).status).toBe(200);
    expect(await itemsFor(a1.cookie, officialId)).toEqual([["official", "Animação oficial"], ["own", "Meu supino"]]);
    expect(await itemsFor(a2.cookie, officialId)).toEqual([["official", "Animação oficial"], ["own", "Meu supino"]]);
  });
  it("para um aluno específico: prevalece sobre a regra geral", async () => {
    expect((await pref(alfa, officialId, { mode: "own", ownMediaId: own2, studentId: a1.id })).status).toBe(200);
    expect(await itemsFor(a1.cookie, officialId)).toEqual([["own", "Supino pegada fechada"]]); // substitui a animação
    expect(await itemsFor(a2.cookie, officialId)).toEqual([["official", "Animação oficial"], ["own", "Meu supino"]]); // outro aluno segue a regra geral
  });
  it("outra consultoria não recebe essa personalização", async () => {
    expect(await itemsFor(b1.cookie, officialId)).toEqual([["official", "Animação oficial"]]);
    const t = (await media(beta, officialId)).body;
    expect(t.own).toEqual([]);
    expect(t.preferences).toEqual([]);
    // E não consegue usar vídeo de outra consultoria numa regra.
    expect((await pref(beta, officialId, { mode: "own", ownMediaId: own1 })).status).toBe(400);
  });
  it("o aluno vê só o resultado: sem lista de vídeos próprios nem regras", async () => {
    const r = (await media(a1.cookie, officialId)).body;
    expect(Object.keys(r).sort()).toEqual(["exercise", "resolved"]);
  });
  it("validações das regras", async () => {
    const own = (await call(h4.createExercise, { cookie: alfa, body: { name: "Sem vídeo ainda", primaryMuscles: ["Abdômen"] } })).body.id;
    expect((await pref(alfa, own, { mode: "own" })).status).toBe(400); // sem vídeo próprio
    expect((await pref(alfa, own, { mode: "official" })).status).toBe(200);
    expect((await pref(alfa, officialId, { mode: "own", ownMediaId: uuid() })).status).toBe(400);
    expect((await pref(alfa, officialId, { mode: "both", ownMediaId: own1, studentId: b1.id })).status).toBe(404); // aluno de outra consultoria
    expect((await pref(alfa, officialId, { mode: "ambos" })).status).toBe(400);
  });
  it("aluno não altera mídia nem regras; tudo fica na auditoria", async () => {
    expect((await addVideo(a1.cookie, officialId, { title: "x", url: "https://x.com/a.mp4" })).status).toBe(403);
    expect((await pref(a1.cookie, officialId, { mode: "own", ownMediaId: own1 })).status).toBe(403);
    expect((await media(alfa, officialId, a1.id)).status).toBe(200);
    const actions = (await call(h.listAudit, { cookie: alfa })).body.map((x: any) => x.action);
    expect(actions).toEqual(expect.arrayContaining(["media.add", "media.preference"]));
    expect((await call(h.listAudit, { cookie: beta })).body.some((x: any) => x.action === "media.preference")).toBe(false);
  });
});

describe("avaliações", () => {
  let tplMedidas: string, tplTriagem: string;
  it("modelos prontos e personalizados", async () => {
    const list = (await call(h4.listAssessmentTemplates, { cookie: alfa })).body;
    expect(list.builtins.map((b: any) => b.key)).toEqual(expect.arrayContaining(["medidas", "anamnese", "triagem", "testes"]));
    tplMedidas = (await call(h4.createAssessmentTemplate, { cookie: alfa, body: { key: "medidas" } })).body.id;
    tplTriagem = (await call(h4.createAssessmentTemplate, { cookie: alfa, body: { key: "triagem" } })).body.id;
    expect((await call(h4.createAssessmentTemplate, { cookie: alfa, body: { key: "nao-existe" } })).status).toBe(400);
    const custom = await call(h4.createAssessmentTemplate, { cookie: alfa, body: { name: "Meu questionário", fields: [{ id: "humor", label: "Humor", type: "scale" }, { id: "obs", label: "Obs", type: "text" }] } });
    expect(custom.status).toBe(201);
    const bad = (fields: any[]) => call(h4.createAssessmentTemplate, { cookie: alfa, body: { name: "x", fields } }).then((r) => r.status);
    expect(await bad([{ id: "a", label: "A", type: "text" }, { id: "a", label: "B", type: "text" }])).toBe(400);
    expect(await bad([{ id: "a", label: "A", type: "choice" }])).toBe(400);
    expect(await bad([{ id: "Maiúscula!", label: "A", type: "text" }])).toBe(400);
    expect(await bad([])).toBe(400);
    expect((await call(h4.listAssessmentTemplates, { cookie: beta })).body.templates).toEqual([]); // modelos são por consultoria
    expect((await call(h4.listAssessmentTemplates, { cookie: a1.cookie })).status).toBe(403);
  });

  it("o personal registra medidas e vê a variação entre avaliações", async () => {
    const reg = (peso: number) => call(h4.requestAssessment, { cookie: alfa, params: { id: a1.id }, body: { templateId: tplMedidas, answers: { peso, cintura: 80 } } });
    const first = await reg(80.5);
    expect(first.status).toBe(201); expect(first.body.status).toBe("done");
    await new Promise((r) => setTimeout(r, 15));
    const second = await reg(79);
    const d = (await call(h4.getAssessment, { cookie: alfa, params: { id: second.body.id } })).body;
    expect(d.answers.peso).toBe(79);
    expect(d.deltas).toMatchObject({ peso: -1.5, cintura: 0 });
    expect((await call(h4.requestAssessment, { cookie: alfa, params: { id: a1.id }, body: { templateId: tplMedidas, answers: { cintura: 80 } } })).status).toBe(400); // peso obrigatório
    expect((await call(h4.requestAssessment, { cookie: alfa, params: { id: a1.id }, body: { templateId: tplMedidas, answers: { peso: 80, invasor: 1 } } })).status).toBe(400);
    expect((await call(h4.listStudentAssessments, { cookie: alfa, params: { id: a1.id } })).body.length).toBeGreaterThanOrEqual(2);
  });

  it("o personal envia ao aluno; o aluno responde uma vez", async () => {
    const sent = await call(h4.requestAssessment, { cookie: alfa, params: { id: a2.id }, body: { templateId: tplTriagem } });
    expect(sent.body.status).toBe("pending");
    const mine = (await call(h4.myAssessments, { cookie: a2.cookie })).body;
    expect(mine.map((x: any) => x.status)).toEqual(["pending"]);
    const answers = { dor_peito: false, tontura: false, pressao: false, cronica: false, lesao_atual: true, detalhes: "joelho direito" };
    expect((await call(h4.submitAssessment, { cookie: a2.cookie, params: { id: sent.body.id }, body: { answers: { dor_peito: "não" } } })).status).toBe(400);
    expect((await call(h4.submitAssessment, { cookie: a2.cookie, params: { id: sent.body.id }, body: { answers } })).status).toBe(200);
    expect((await call(h4.submitAssessment, { cookie: a2.cookie, params: { id: sent.body.id }, body: { answers } })).status).toBe(409);
    const d = (await call(h4.getAssessment, { cookie: a2.cookie, params: { id: sent.body.id } })).body;
    expect(d).toMatchObject({ status: "done", filledBy: "student" });
    expect(d.answers.lesao_atual).toBe(true);
  });

  it("dado de saúde isolado: outro aluno e outra consultoria não acessam", async () => {
    const mine = (await call(h4.listStudentAssessments, { cookie: alfa, params: { id: a1.id } })).body[0].id;
    expect((await call(h4.getAssessment, { cookie: a2.cookie, params: { id: mine } })).status).toBe(404);
    expect((await call(h4.submitAssessment, { cookie: a2.cookie, params: { id: mine }, body: { answers: {} } })).status).toBe(404);
    expect((await call(h4.getAssessment, { cookie: beta, params: { id: mine } })).status).toBe(404);
    expect((await call(h4.listStudentAssessments, { cookie: beta, params: { id: a1.id } })).status).toBe(404);
    expect((await call(h4.requestAssessment, { cookie: beta, params: { id: a1.id }, body: { templateId: tplMedidas } })).status).toBe(404);
    expect((await call(h4.requestAssessment, { cookie: alfa, params: { id: b1.id }, body: { templateId: tplMedidas } })).status).toBe(404);
    expect((await call(h4.listStudentAssessments, { cookie: a1.cookie, params: { id: a1.id } })).status).toBe(403);
    expect((await call(h4.myAssessments, { cookie: alfa })).status).toBe(403);
    expect((await call(h4.getAssessment, {})).status).toBe(401);
  });

  it("leitura pelo personal e criação ficam na auditoria; o aluno vendo o próprio dado não gera entrada", async () => {
    const aud = (await call(h.listAudit, { cookie: alfa })).body;
    expect(aud.some((x: any) => x.action === "assessment.view")).toBe(true);
    expect(aud.some((x: any) => x.action === "assessment.create")).toBe(true);
    expect(JSON.stringify(aud)).not.toMatch(/joelho/); // as respostas não vão para a auditoria
    const before = aud.filter((x: any) => x.action === "assessment.view").length;
    const id = (await call(h4.myAssessments, { cookie: a2.cookie })).body[0].id;
    await call(h4.getAssessment, { cookie: a2.cookie, params: { id } });
    expect((await call(h.listAudit, { cookie: alfa })).body.filter((x: any) => x.action === "assessment.view").length).toBe(before);
  });
});

describe("check-ins", () => {
  const good = { sono: 7, fadiga: 4, estresse: 3, motivacao: 8, dor: "Não" };
  it("o aluno vê as perguntas e responde; depois fica em dia", async () => {
    const c = (await call(h4.getMyCheckin, { cookie: a1.cookie })).body;
    expect(c.questions).toHaveLength(6); expect(c.due).toBe(true); expect(c.disclaimer).toMatch(/sem finalidade diagnóstica/);
    expect((await call(h4.postMyCheckin, { cookie: a1.cookie, body: { answers: good } })).status).toBe(201);
    const after = (await call(h4.getMyCheckin, { cookie: a1.cookie })).body;
    expect(after.due).toBe(false); expect(after.last.answers.sono).toBe(7);
  });
  it("valida respostas", async () => {
    const post = (answers: any) => call(h4.postMyCheckin, { cookie: a2.cookie, body: { answers } }).then((r) => r.status);
    expect(await post({ sono: 7 })).toBe(400);                         // faltam obrigatórias
    expect(await post({ ...good, sono: 11 })).toBe(400);               // fora da escala
    expect(await post({ ...good, dor: "Talvez" })).toBe(400);
    expect(await post({ ...good, extra: 1 })).toBe(400);
  });
  it("reenviar com o mesmo id não duplica; id de outro aluno não vale", async () => {
    const id = uuid();
    await call(h4.postMyCheckin, { cookie: a2.cookie, body: { id, answers: { ...good, fadiga: 9, dor: "Sim, desconforto significativo" } } });
    await call(h4.postMyCheckin, { cookie: a2.cookie, body: { id, answers: { ...good, fadiga: 9, dor: "Sim, desconforto significativo" } } });
    const n = (await (await getDb()).query<{ n: number }>("select count(*)::int n from checkins where id = $1", [id])).rows[0].n;
    expect(n).toBe(1);
    expect((await call(h4.postMyCheckin, { cookie: a1.cookie, body: { id, answers: good } })).status).toBe(404);
  });
  it("painel do personal: alerta primeiro, depois atenção e atrasados", async () => {
    const c3 = await inviteStudent(alfa, "c3"); // nunca respondeu
    const panel = (await call(h4.listCheckins, { cookie: alfa })).body;
    expect(panel[0]).toMatchObject({ studentId: a2.id, priority: 2 });
    expect(panel[0].flags.map((f: any) => f.id)).toEqual(expect.arrayContaining(["dor", "fadiga"]));
    expect(panel.find((p: any) => p.studentId === a1.id)).toMatchObject({ priority: 0, overdue: false });
    expect(panel.find((p: any) => p.studentId === c3.id)).toMatchObject({ last: null, overdue: true });
    expect(panel.some((p: any) => p.studentId === b1.id)).toBe(false); // só a própria consultoria
  });
  it("configuração por aluno e padrão da consultoria; isolada", async () => {
    const put = (cookie: string, body: any, id?: string) => call(h4.putCheckinConfig, { method: "PUT", cookie, params: id ? { id } : {}, body });
    expect((await put(alfa, { frequencyDays: 3, questionIds: ["sono", "dor"] }, a1.id)).status).toBe(200);
    const c = (await call(h4.getMyCheckin, { cookie: a1.cookie })).body;
    expect(c.questions.map((q: any) => q.id)).toEqual(["sono", "dor"]); expect(c.frequencyDays).toBe(3);
    expect((await call(h4.postMyCheckin, { cookie: a1.cookie, body: { answers: { sono: 5, dor: "Não" } } })).status).toBe(201); // só o que foi configurado
    expect((await call(h4.postMyCheckin, { cookie: a1.cookie, body: { answers: { sono: 5, dor: "Não", fadiga: 1 } } })).status).toBe(400);
    expect((await put(alfa, { frequencyDays: 14, questionIds: ["sono", "fadiga", "dor"] })).status).toBe(200);
    expect((await call(h4.getMyCheckin, { cookie: a2.cookie })).body.frequencyDays).toBe(14);   // segue o padrão
    expect((await call(h4.getMyCheckin, { cookie: a1.cookie })).body.frequencyDays).toBe(3);    // aluno mantém a própria
    expect((await call(h4.getMyCheckin, { cookie: b1.cookie })).body.frequencyDays).toBe(7);    // outra consultoria: padrão do sistema
    expect((await put(alfa, { frequencyDays: 0, questionIds: ["sono"] })).status).toBe(400);
    expect((await put(alfa, { frequencyDays: 7, questionIds: ["inventada"] })).status).toBe(400);
    expect((await put(a1.cookie, { frequencyDays: 1, questionIds: ["sono"] })).status).toBe(403);
    expect((await put(beta, { frequencyDays: 1, questionIds: ["sono"] }, a1.id)).status).toBe(404);
    expect((await call(h4.listStudentCheckins, { cookie: beta, params: { id: a1.id } })).status).toBe(404);
    expect((await call(h4.listStudentCheckins, { cookie: alfa, params: { id: a1.id } })).body.checkins.length).toBeGreaterThan(0);
    expect((await call(h4.listCheckins, { cookie: a1.cookie })).status).toBe(403);
  });
});

describe("chat privado", () => {
  const send = (cookie: string, body: any, params: any = {}) => call(h4.postMessage, { cookie, params, body });
  it("conversa individual: aluno e personal trocam mensagens, com contagem de não lidas", async () => {
    expect((await send(a1.cookie, { body: "Oi, treino de hoje ficou pesado" })).status).toBe(201);
    expect((await call(h4.unreadCount, { cookie: alfa })).body.count).toBe(1);
    const conv = (await call(h4.listConversations, { cookie: alfa })).body;
    expect(conv.find((c: any) => c.studentId === a1.id)).toMatchObject({ unread: 1, lastBody: "Oi, treino de hoje ficou pesado" });
    expect((await call(h4.getThread, { cookie: alfa, params: { studentId: a1.id } })).body[0]).toMatchObject({ mine: false, body: "Oi, treino de hoje ficou pesado" });
    await call(h4.markThreadRead, { cookie: alfa, params: { studentId: a1.id }, body: {} });
    expect((await call(h4.unreadCount, { cookie: alfa })).body.count).toBe(0);
    expect((await send(alfa, { body: "Vamos reduzir a carga" }, { studentId: a1.id })).status).toBe(201);
    expect((await call(h4.unreadCount, { cookie: a1.cookie })).body.count).toBe(1);
    const t = (await call(h4.getThread, { cookie: a1.cookie })).body;
    expect(t.map((m: any) => [m.mine, m.body])).toEqual([[true, "Oi, treino de hoje ficou pesado"], [false, "Vamos reduzir a carga"]]);
    await call(h4.markThreadRead, { cookie: a1.cookie, body: {} });
    expect((await call(h4.unreadCount, { cookie: a1.cookie })).body.count).toBe(0);
  });
  it("vínculo com exercício da ficha; reenvio com o mesmo id não duplica", async () => {
    const id = uuid();
    await send(a1.cookie, { id, body: "Dúvida na execução", exerciseId: officialId });
    await send(a1.cookie, { id, body: "Dúvida na execução", exerciseId: officialId });
    const t = (await call(h4.getThread, { cookie: a1.cookie })).body.filter((m: any) => m.id === id);
    expect(t).toHaveLength(1); expect(t[0].exercise).toMatchObject({ name: "Supino reto" });
    expect((await send(a1.cookie, { body: "x", exerciseId: uuid() })).status).toBe(404);
  });
  it("limites: vazio, longo e excesso por minuto", async () => {
    expect((await send(a2.cookie, { body: "   " })).status).toBe(400);
    expect((await send(a2.cookie, { body: "x".repeat(2001) })).status).toBe(400);
    let last = 0;
    for (let i = 0; i < 32; i++) last = (await send(a2.cookie, { body: `m${i}` })).status;
    expect(last).toBe(429);
  });
  it("isolamento: um aluno nunca lê nem escreve na conversa de outro", async () => {
    await send(a1.cookie, { body: "segredo do a1" });
    // a2 chamando a rota do personal ou tentando endereçar a conversa do a1 só atinge a própria
    expect((await call(h4.listConversations, { cookie: a2.cookie })).status).toBe(403);
    const t2 = (await call(h4.getThread, { cookie: a2.cookie, params: { studentId: a1.id } })).body;
    expect(JSON.stringify(t2)).not.toMatch(/segredo do a1/);
    await send(a2.cookie, { body: "mensagem do a2" }, { studentId: a1.id });
    const t1 = (await call(h4.getThread, { cookie: a1.cookie })).body;
    expect(JSON.stringify(t1)).not.toMatch(/mensagem do a2/);
    // id de mensagem alheio não pode ser reaproveitado
    const mid = t1[0].id;
    expect((await send(a2.cookie, { id: mid, body: "sequestro" })).status).toBe(404);
  });
  it("outra consultoria não vê conversas nem envia a alunos alheios", async () => {
    expect((await call(h4.getThread, { cookie: beta, params: { studentId: a1.id } })).status).toBe(404);
    expect((await send(beta, { body: "oi" }, { studentId: a1.id })).status).toBe(404);
    expect((await call(h4.markThreadRead, { cookie: beta, params: { studentId: a1.id }, body: {} })).status).toBe(404);
    expect((await call(h4.listConversations, { cookie: beta })).body.map((c: any) => c.studentId)).toEqual([b1.id]);
    expect((await call(h4.unreadCount, { cookie: beta })).body.count).toBe(0);
    expect((await call(h4.getThread, {})).status).toBe(401);
  });
});
