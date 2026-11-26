import { beforeAll, describe, expect, it } from "vitest";
import { getDb, resetDb } from "../src/server/db";
import * as h4 from "../src/server/handlers4";
import * as h5 from "../src/server/handlers5";
import * as h6 from "../src/server/handlers6";
import { planMove, neighbor } from "../src/lib/tasks";
import { call, h, inviteStudent, publishWorkout, registerTrainer, uuid } from "./helpers";

let alfa: string, beta: string;
let a1: { cookie: string; id: string }, a2: { cookie: string; id: string }, b1: { cookie: string; id: string };

const list = async (cookie: string) => (await call(h6.listTasks, { cookie })).body as any[];
const make = (cookie: string, body: any) => call(h6.createTask, { cookie, body });
const sugg = async (cookie: string) => (await call(h6.listSuggestions, { cookie })).body as any[];
const accept = (cookie: string, key: string) => call(h6.acceptSuggestion, { cookie, body: { key } });

beforeAll(async () => {
  await resetDb();
  alfa = await registerTrainer("alfa");
  beta = await registerTrainer("beta");
  a1 = await inviteStudent(alfa, "a1");
  a2 = await inviteStudent(alfa, "a2");
  b1 = await inviteStudent(beta, "b1");
});

describe("regras puras do quadro", () => {
  const t = (id: string, status: any, position: number) => ({ id, status, position });
  it("planMove reposiciona dentro da coluna e entre colunas, com posições contínuas", () => {
    const tasks = [t("a", "todo", 0), t("b", "todo", 1), t("c", "todo", 2), t("d", "done", 0)];
    expect(planMove(tasks, "c", "todo", 0).map((x) => x.id)).toEqual(["c", "a", "b"]);
    const cross = planMove(tasks, "a", "done", 1);
    expect(cross.filter((x) => x.status === "done")).toEqual([{ id: "d", status: "done", position: 0 }, { id: "a", status: "done", position: 1 }]);
    expect(cross.filter((x) => x.status === "todo")).toEqual([{ id: "b", status: "todo", position: 0 }, { id: "c", status: "todo", position: 1 }]);
    expect(planMove(tasks, "zzz", "done", 0)).toEqual([]);
    expect(planMove(tasks, "a", "done", 99).find((x) => x.id === "a")!.position).toBe(1); // limita ao fim
  });
  it("neighbor respeita as pontas", () => {
    expect(neighbor("todo", -1)).toBeNull();
    expect(neighbor("todo", 1)).toBe("in-progress");
    expect(neighbor("done", 1)).toBeNull();
  });
});

describe("tarefas: criar, editar, mover, ordenar, excluir", () => {
  it("cria com padrões, valida campos e posiciona no fim da coluna", async () => {
    const r1 = await make(alfa, { title: "Ligar para a academia" });
    expect(r1.status).toBe(201);
    const r2 = await make(alfa, { title: "Montar treino", tag: "Treino", studentId: a1.id, dueDate: "2026-12-10" });
    expect(r2.status).toBe(201);
    const l = await list(alfa);
    expect(l.map((x) => [x.title, x.status, x.position])).toEqual([["Ligar para a academia", "todo", 0], ["Montar treino", "todo", 1]]);
    expect(l[1]).toMatchObject({ tag: "Treino", studentId: a1.id, studentName: "Aluno a1", dueDate: "2026-12-10" });
    for (const bad of [{ title: "  " }, { title: "x".repeat(141) }, { title: "x", tag: "Inventada" }, { title: "x", status: "feito" }, { title: "x", dueDate: "10/12/2026" }, { title: "x", studentId: "nao-uuid" }]) {
      expect((await make(alfa, bad)).status).toBe(400);
    }
  });
  it("editar título, etiqueta, prazo; mudar de status sem posição vai para o fim da nova coluna", async () => {
    const [t1] = await list(alfa);
    expect((await call(h6.updateTask, { method: "PUT", cookie: alfa, params: { id: t1.id }, body: { title: "Ligar para a academia hoje", dueDate: null, tag: "Outro" } })).status).toBe(200);
    expect((await call(h6.updateTask, { method: "PUT", cookie: alfa, params: { id: t1.id }, body: { status: "in-progress" } })).status).toBe(200);
    const l = await list(alfa);
    expect(l.find((x) => x.id === t1.id)).toMatchObject({ title: "Ligar para a academia hoje", status: "in-progress", position: 0 });
    expect((await call(h6.updateTask, { method: "PUT", cookie: alfa, params: { id: t1.id }, body: { campoNovo: 1 } })).status).toBe(400); // strict
  });
  it("reordenar preserva as posições informadas e atualiza as colunas", async () => {
    const l = await list(alfa);
    const [x, y] = [l.find((t) => t.status === "in-progress")!, l.find((t) => t.status === "todo")!];
    const plan = planMove(l, y.id, "in-progress", 0);
    expect((await call(h6.reorderTasks, { cookie: alfa, body: { items: plan } })).status).toBe(200);
    const after = await list(alfa);
    expect(after.filter((t) => t.status === "in-progress").map((t) => t.id)).toEqual([y.id, x.id]);
    expect(after.filter((t) => t.status === "in-progress").map((t) => t.position)).toEqual([0, 1]);
    expect((await call(h6.reorderTasks, { cookie: alfa, body: { items: [{ id: x.id, status: "done", position: 0 }, { id: x.id, status: "done", position: 1 }] } })).status).toBe(400); // repetido
    expect((await call(h6.reorderTasks, { cookie: alfa, body: { items: [] } })).status).toBe(400);
  });
  it("excluir remove e audita; não existe mais", async () => {
    const id = (await make(alfa, { title: "Descartável" })).body.id;
    expect((await call(h6.deleteTask, { method: "DELETE", cookie: alfa, params: { id } })).status).toBe(200);
    expect((await list(alfa)).some((t) => t.id === id)).toBe(false);
    expect((await call(h6.deleteTask, { method: "DELETE", cookie: alfa, params: { id } })).status).toBe(404);
    const actions = (await call(h.listAudit, { cookie: alfa })).body.map((x: any) => x.action);
    expect(actions).toEqual(expect.arrayContaining(["task.create", "task.delete"]));
  });
});

describe("isolamento", () => {
  let mine: string;
  beforeAll(async () => { mine = (await make(alfa, { title: "Tarefa da Alfa" })).body.id; });
  it("outra consultoria não vê, edita, move nem exclui", async () => {
    expect((await list(beta)).some((t) => t.id === mine)).toBe(false);
    expect((await call(h6.updateTask, { method: "PUT", cookie: beta, params: { id: mine }, body: { title: "invasão" } })).status).toBe(404);
    expect((await call(h6.deleteTask, { method: "DELETE", cookie: beta, params: { id: mine } })).status).toBe(404);
    expect((await call(h6.reorderTasks, { cookie: beta, body: { items: [{ id: mine, status: "done", position: 0 }] } })).status).toBe(404);
    expect((await list(alfa)).find((t) => t.id === mine)).toMatchObject({ title: "Tarefa da Alfa", status: "todo" });
  });
  it("reordenar com um cartão alheio no meio não altera nenhum (tudo ou nada)", async () => {
    const own = (await make(beta, { title: "Da Beta" })).body.id;
    const r = await call(h6.reorderTasks, { cookie: beta, body: { items: [{ id: own, status: "done", position: 5 }, { id: mine, status: "done", position: 0 }] } });
    expect(r.status).toBe(404);
    expect((await list(beta)).find((t) => t.id === own)).toMatchObject({ status: "todo" });
  });
  it("aluno de outra consultoria não pode ser vinculado (404); aluno nas rotas do personal: 403; sem sessão: 401", async () => {
    expect((await make(alfa, { title: "x", studentId: b1.id })).status).toBe(404);
    expect((await call(h6.updateTask, { method: "PUT", cookie: alfa, params: { id: mine }, body: { studentId: b1.id } })).status).toBe(404);
    for (const fn of [h6.listTasks, h6.listSuggestions]) {
      expect((await call(fn, { cookie: a1.cookie })).status).toBe(403);
      expect((await call(fn, {})).status).toBe(401);
    }
    expect((await make(a1.cookie, { title: "x" })).status).toBe(403);
    expect((await call(h6.updateTask, { method: "PUT", cookie: a1.cookie, params: { id: mine }, body: { title: "x" } })).status).toBe(403);
    expect((await call(h6.deleteTask, { method: "DELETE", cookie: a1.cookie, params: { id: mine } })).status).toBe(403);
    expect((await call(h6.reorderTasks, { cookie: a1.cookie, body: { items: [{ id: mine, status: "done", position: 0 }] } })).status).toBe(403);
    expect((await call(h6.acceptSuggestion, { cookie: a1.cookie, body: { key: "notrain:x" } })).status).toBe(403);
    expect((await call(h6.listTasks, { cookie: undefined })).status).toBe(401);
    expect((await call(h6.updateTask, { method: "PUT", cookie: alfa, params: { id: "nao-uuid" }, body: { title: "x" } })).status).toBe(404);
  });
});

describe("sugestões a partir de dados reais", () => {
  it("aluno sem treino publicado gera sugestão; publicar remove", async () => {
    let s = await sugg(alfa);
    expect(s.filter((x) => x.key.startsWith("notrain:")).map((x) => x.studentId).sort()).toEqual([a1.id, a2.id].sort());
    await publishWorkout(alfa, a2.id);
    s = await sugg(alfa);
    expect(s.some((x) => x.key === `notrain:${a2.id}`)).toBe(false);
    expect(s.some((x) => x.key === `notrain:${a1.id}`)).toBe(true);
    expect((await sugg(beta)).every((x) => x.studentId === b1.id)).toBe(true); // só da própria consultoria
  });
  it("check-in com alerta; check-in tranquilo não", async () => {
    const calm = { sono: 7, fadiga: 3, estresse: 3, motivacao: 8, dor: "Não" };
    await call(h4.postMyCheckin, { cookie: a2.cookie, body: { answers: calm } });
    expect((await sugg(alfa)).some((x) => x.key.startsWith("checkin:"))).toBe(false);
    const id = uuid();
    await call(h4.postMyCheckin, { cookie: a1.cookie, body: { id, answers: { ...calm, fadiga: 9, dor: "Sim, desconforto significativo" } } });
    const s = (await sugg(alfa)).find((x) => x.key === `checkin:${id}`);
    expect(s).toMatchObject({ tag: "Check-in", studentId: a1.id });
    expect(s.reason).toMatch(/desconforto significativo/);
  });
  it("mensagem do aluno sem resposta só após 24 h, e some quando o personal responde", async () => {
    await call(h4.postMessage, { cookie: a1.cookie, body: { body: "Posso trocar o treino?" } });
    expect((await sugg(alfa)).some((x) => x.key.startsWith(`msg:${a1.id}`))).toBe(false); // recente
    await (await getDb()).query("update messages set created_at = now() - interval '30 hours' where student_id = $1", [a1.id]);
    const s = (await sugg(alfa)).find((x) => x.key.startsWith(`msg:${a1.id}:`));
    expect(s).toMatchObject({ tag: "Conversa", studentId: a1.id });
    await call(h4.postMessage, { cookie: alfa, params: { studentId: a1.id }, body: { body: "Pode sim" } });
    expect((await sugg(alfa)).some((x) => x.key.startsWith(`msg:${a1.id}`))).toBe(false);
  });
  it("avaliação pendente e cobrança em atraso", async () => {
    const tpl = (await call(h4.createAssessmentTemplate, { cookie: alfa, body: { key: "triagem" } })).body.id;
    const asm = await call(h4.requestAssessment, { cookie: alfa, params: { id: a1.id }, body: { templateId: tpl } });
    expect((await sugg(alfa)).some((x) => x.key === `assess:${asm.body.id}`)).toBe(true);
    const ch = await call(h5.createCharge, { cookie: alfa, params: { id: a2.id }, body: { description: "Mensal", amountCents: 20000, dueDate: "2020-01-10" } });
    const s = (await sugg(alfa)).find((x) => x.key === `overdue:${ch.body.id}`);
    expect(s).toMatchObject({ tag: "Financeiro", studentId: a2.id });
    expect(s.reason).toBe("Venceu em 10/01/2020");
    const future = await call(h5.createCharge, { cookie: alfa, params: { id: a2.id }, body: { description: "Futura", amountCents: 20000, dueDate: "2099-01-10" } });
    expect((await sugg(alfa)).some((x) => x.key === `overdue:${future.body.id}`)).toBe(false);
  });
  it("aceitar cria a tarefa (1 clique), não duplica e não volta depois de concluída (excluir a tarefa libera a sugestão de novo)", async () => {
    const key = `notrain:${a1.id}`;
    const r = await accept(alfa, key);
    expect(r.status).toBe(201);
    const t = (await list(alfa)).find((x) => x.id === r.body.id);
    expect(t).toMatchObject({ title: "Publicar treino para Aluno a1", tag: "Treino", status: "todo", studentId: a1.id });
    expect((await accept(alfa, key)).status).toBe(409);
    expect((await sugg(alfa)).some((x) => x.key === key)).toBe(false);
    await call(h6.updateTask, { method: "PUT", cookie: alfa, params: { id: t.id }, body: { status: "done" } });
    expect((await sugg(alfa)).some((x) => x.key === key)).toBe(false); // concluída: não volta
    await call(h6.deleteTask, { method: "DELETE", cookie: alfa, params: { id: t.id } });
    expect((await sugg(alfa)).some((x) => x.key === key)).toBe(true); // excluída: a condição real ainda existe, então a sugestão reaparece
  });
  it("não aceita chave inventada nem sugestão de outra consultoria", async () => {
    expect((await accept(alfa, "notrain:" + uuid())).status).toBe(409);
    expect((await accept(alfa, `notrain:${b1.id}`)).status).toBe(409);
    expect((await accept(beta, `notrain:${a2.id}`)).status).toBe(409);
    expect((await call(h6.acceptSuggestion, { cookie: alfa, body: {} })).status).toBe(400);
  });
  it("a mesma sugestão pode virar tarefa em consultorias diferentes (índice único é por consultoria)", async () => {
    const own = (await sugg(beta)).find((x) => x.key === `notrain:${b1.id}`)!;
    expect((await accept(beta, own.key)).status).toBe(201);
  });
});
