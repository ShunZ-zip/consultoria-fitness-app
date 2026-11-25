import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { dueDateFor, monthKey } from "../src/lib/billing";
import { getDb, resetDb } from "../src/server/db";
import * as h5 from "../src/server/handlers5";
import { sign } from "../src/server/payments";
import { call, h, inviteStudent, registerTrainer, uuid } from "./helpers";

const SECRET = "dev-webhook-secret"; // padrão fora de produção
const hook = (body: unknown, sig?: string | null) =>
  call(h5.paymentWebhook, { body, headers: sig === null ? {} : { "x-signature": sig ?? sign(SECRET, JSON.stringify(body)) } });
const ev = (ref: string, type: string, o: { id?: string; amount?: number; fee?: number; method?: string } = {}) =>
  ({ id: o.id ?? uuid(), type, data: { ref, amountCents: o.amount, feeCents: o.fee, method: o.method } });

let alfa: string, beta: string;
let a1: { cookie: string; id: string }, a2: { cookie: string; id: string }, b1: { cookie: string; id: string };
const month = monthKey(new Date());
const endOfMonth = dueDateFor(month, 31); // nunca "em atraso" dentro do mês corrente

const mkCharge = async (cookie: string, studentId: string, amountCents = 20000, dueDate = "2099-01-01") => {
  const r = await call(h5.createCharge, { cookie, params: { id: studentId }, body: { description: "Mensalidade", amountCents, dueDate } });
  return { id: r.body.id as string, ref: `sim_ch_${r.body.id}`, status: r.status };
};
const charges = async (cookie: string, studentId: string) => (await call(h5.listStudentBilling, { cookie, params: { id: studentId } })).body.charges as any[];
const find = async (cookie: string, studentId: string, id: string) => (await charges(cookie, studentId)).find((c) => c.id === id);
const countEvents = async (sql: string, p: unknown[] = []) => (await (await getDb()).query<{ n: number }>(`select count(*)::int n from payment_events ${sql}`, p)).rows[0].n;

beforeAll(async () => {
  await resetDb();
  alfa = await registerTrainer("alfa");
  beta = await registerTrainer("beta");
  a1 = await inviteStudent(alfa, "a1");
  a2 = await inviteStudent(alfa, "a2");
  b1 = await inviteStudent(beta, "b1");
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("webhook do intermediador: assinatura e validação", () => {
  it("recusa sem assinatura ou com assinatura errada (401)", async () => {
    const c = await mkCharge(alfa, a1.id);
    const body = ev(c.ref, "payment.confirmed", { amount: 20000 });
    expect((await hook(body, null)).status).toBe(401);
    expect((await hook(body, "00".repeat(32))).status).toBe(401);
    expect((await hook(body, sign("outro-segredo", JSON.stringify(body)))).status).toBe(401);
    expect((await find(alfa, a1.id, c.id)).status).toBe("pending"); // nada mudou
  });
  it("assinatura de um corpo não vale para outro corpo", async () => {
    const c = await mkCharge(alfa, a1.id);
    const sig = sign(SECRET, JSON.stringify(ev(c.ref, "payment.failed")));
    expect((await hook(ev(c.ref, "payment.confirmed", { amount: 20000 }), sig)).status).toBe(401);
  });
  it("sem segredo configurado em produção: 503", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await hook(ev("sim_ch_x", "payment.confirmed", { amount: 100 }))).status).toBe(503);
  });
  it("com segredo configurado em produção: aceita evento assinado", async () => {
    const c = await mkCharge(alfa, a1.id);
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("PAYMENT_WEBHOOK_SECRET", "segredo-de-producao");
    const body = ev(c.ref, "payment.confirmed", { amount: 20000 });
    expect((await hook(body, sign("segredo-de-producao", JSON.stringify(body)))).status).toBe(200);
    expect((await hook(ev(c.ref, "payment.canceled"), sign(SECRET, JSON.stringify(ev(c.ref, "payment.canceled"))))).status).toBe(401); // o padrão de dev não vale
  });
  it("payload inválido: 400", async () => {
    expect((await hook({ id: "x", type: "payment.inventado", data: { ref: "r" } })).status).toBe(400);
    expect((await hook({ type: "payment.confirmed", data: { ref: "r" } })).status).toBe(400);
    expect((await hook({ id: "x", type: "payment.confirmed", data: {} })).status).toBe(400);
  });
});

describe("eventos: efeito financeiro único e estados", () => {
  it("confirmação aplica pago, método, taxa e data", async () => {
    const c = await mkCharge(alfa, a1.id, 20000);
    const r = await hook(ev(c.ref, "payment.confirmed", { amount: 20000, fee: 518, method: "pix" }));
    expect(r.body).toMatchObject({ result: "applied", scope: "student_charge", targetId: c.id });
    expect(await find(alfa, a1.id, c.id)).toMatchObject({ status: "paid", method: "pix", feeCents: 518, source: "provider" });
    expect((await find(alfa, a1.id, c.id)).paidAt).toBeTruthy();
  });

  it("o MESMO evento repetido 5 vezes aplica uma única vez", async () => {
    const c = await mkCharge(alfa, a1.id, 30000);
    const body = ev(c.ref, "payment.confirmed", { amount: 30000, fee: 1000, method: "card" });
    const results = [];
    for (let i = 0; i < 5; i++) results.push((await hook(body)).body.result);
    expect(results).toEqual(["applied", "duplicate", "duplicate", "duplicate", "duplicate"]);
    expect(await countEvents("where event_id = $1", [body.id])).toBe(1);
    const first = await find(alfa, a1.id, c.id);
    await new Promise((r) => setTimeout(r, 15));
    await hook(body);
    expect((await find(alfa, a1.id, c.id)).paidAt).toBe(first.paidAt); // data de pagamento intacta
    expect(first.feeCents).toBe(1000);                                  // taxa contada uma vez
  });

  it("valor diferente do cobrado é rejeitado e não altera o estado", async () => {
    const c = await mkCharge(alfa, a1.id, 20000);
    expect((await hook(ev(c.ref, "payment.confirmed", { amount: 1 }))).body.result).toBe("rejected");
    expect((await hook(ev(c.ref, "payment.confirmed", {}))).body.result).toBe("rejected"); // sem valor
    expect((await find(alfa, a1.id, c.id)).status).toBe("pending");
  });

  it("ordem dos eventos: falha depois de pago é ignorada; estorno funciona; confirmar depois de estornar é ignorado", async () => {
    const c = await mkCharge(alfa, a1.id, 20000);
    await hook(ev(c.ref, "payment.confirmed", { amount: 20000, method: "pix" }));
    expect((await hook(ev(c.ref, "payment.failed"))).body.result).toBe("ignored");
    expect((await find(alfa, a1.id, c.id)).status).toBe("paid");
    expect((await hook(ev(c.ref, "payment.refunded"))).body.result).toBe("applied");
    expect((await find(alfa, a1.id, c.id)).status).toBe("refunded");
    expect((await hook(ev(c.ref, "payment.confirmed", { amount: 20000 }))).body.result).toBe("ignored");
    expect((await find(alfa, a1.id, c.id)).status).toBe("refunded");
  });

  it("falha e nova tentativa aprovada", async () => {
    const c = await mkCharge(alfa, a1.id, 20000);
    expect((await hook(ev(c.ref, "payment.failed"))).body.result).toBe("applied");
    expect((await find(alfa, a1.id, c.id)).status).toBe("failed");
    expect((await hook(ev(c.ref, "payment.confirmed", { amount: 20000, method: "boleto" }))).body.result).toBe("applied");
    expect((await find(alfa, a1.id, c.id)).status).toBe("paid");
  });

  it("referência desconhecida é registrada e ignorada, sem erro", async () => {
    const r = await hook(ev("sim_ch_inexistente", "payment.confirmed", { amount: 100 }));
    expect(r.status).toBe(200); expect(r.body.result).toBe("ignored");
  });

  it("toda mudança de estado fica na trilha (de → para)", async () => {
    const c = await mkCharge(alfa, a1.id, 20000);
    await hook(ev(c.ref, "payment.confirmed", { amount: 20000, method: "pix" }));
    const evs = (await call(h5.listPaymentEvents, { cookie: alfa })).body as any[];
    expect(evs.find((e) => e.targetId === c.id)).toMatchObject({ result: "applied", from: "pending", to: "paid", scope: "student_charge" });
  });
});

describe("assinatura da plataforma (SaaS) separada da cobrança do aluno", () => {
  let delta: string;
  const saas = async (cookie = delta) => (await call(h5.getSaas, { cookie })).body;
  const sub = (cookie = delta) => saas(cookie).then((s) => s.subscription);
  beforeAll(async () => { delta = await registerTrainer("delta"); });

  it("consultoria nova: plano gratuito ativo, catálogo proposto e uso", async () => {
    const s = await saas();
    expect(s.subscription).toMatchObject({ planId: "free", status: "active", trialUsed: false });
    expect(s.plans.map((p: any) => [p.id, p.monthlyCents])).toEqual([["free", 0], ["starter", 990], ["professional", 3990], ["premium", 6990]]);
    expect(s.plansAreProposal).toBe(true);
    expect(s.usage.limit).toBe(1);
  });
  it("plano pago inicia teste de 30 dias (uma vez); mesmo plano é 409; troca no teste mantém o teste", async () => {
    expect((await call(h5.changePlan, { cookie: delta, body: { planId: "starter" } })).status).toBe(200);
    const s = await sub();
    expect(s).toMatchObject({ planId: "starter", status: "trialing", trialUsed: true });
    const days = (new Date(s.trialEndsAt).getTime() - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(29); expect(days).toBeLessThan(31);
    expect((await call(h5.changePlan, { cookie: delta, body: { planId: "starter" } })).status).toBe(409);
    expect((await call(h5.changePlan, { cookie: delta, body: { planId: "professional" } })).status).toBe(200);
    expect(await sub()).toMatchObject({ planId: "professional", status: "trialing" });
    expect((await call(h5.changePlan, { cookie: delta, body: { planId: "invalido" } })).status).toBe(400);
  });

  let invoice: { id: string; ref: string };
  it("fim do teste gera fatura da plataforma e aguarda pagamento", async () => {
    await (await getDb()).query("update saas_subscriptions set trial_ends_at = now() - interval '1 day' where status = 'trialing'");
    const s = await saas();
    expect(s.subscription.status).toBe("pending");
    expect(s.invoices[0]).toMatchObject({ status: "pending", amountCents: 3990, planId: "professional" });
    invoice = { id: s.invoices[0].id, ref: `sim_inv_${s.invoices[0].id}` };
  });

  it("pagamento da fatura ativa a assinatura e estende o período; o evento repetido não estende de novo", async () => {
    const c = await mkCharge(alfa, a1.id, 20000); // cobrança de aluno de OUTRA consultoria, para provar a separação
    const before = await find(alfa, a1.id, c.id);
    const e = ev(invoice.ref, "payment.confirmed", { amount: 3990, fee: 100, method: "card" });
    expect((await hook(e)).body).toMatchObject({ result: "applied", scope: "saas_invoice", targetId: invoice.id });
    const s = await saas();
    expect(s.subscription.status).toBe("active");
    expect(s.invoices[0]).toMatchObject({ status: "paid", feeCents: 100 });
    const end1 = s.subscription.currentPeriodEnd;
    const days = (new Date(end1).getTime() - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(29); expect(days).toBeLessThan(31);
    expect((await hook(e)).body.result).toBe("duplicate");
    expect((await sub()).currentPeriodEnd).toBe(end1);
    expect(await find(alfa, a1.id, c.id)).toEqual(before); // a cobrança do aluno não foi tocada
  });

  it("evento de cobrança de aluno não mexe na assinatura (e vice-versa)", async () => {
    const before = await sub();
    const c = await mkCharge(alfa, a2.id, 20000);
    await hook(ev(c.ref, "payment.confirmed", { amount: 20000, method: "pix" }));
    expect(await sub()).toEqual(before);
    expect((await find(alfa, a2.id, c.id)).status).toBe("paid");
  });

  it("fim do período gera nova fatura; falha leva a 'em atraso'; voltar ao gratuito cancela faturas em aberto", async () => {
    await (await getDb()).query("update saas_subscriptions set current_period_end = now() - interval '1 day' where status = 'active'");
    const s = await saas();
    expect(s.invoices[0].status).toBe("pending");
    expect((await hook(ev(`sim_inv_${s.invoices[0].id}`, "payment.failed"))).body.result).toBe("applied");
    expect((await sub()).status).toBe("past_due");
    expect((await call(h5.changePlan, { cookie: delta, body: { planId: "free" } })).status).toBe(200);
    const after = await saas();
    expect(after.subscription).toMatchObject({ planId: "free", status: "active" });
    expect(after.invoices.filter((i: any) => ["pending", "overdue", "failed"].includes(i.status))).toEqual([]);
  });

  it("depois de usado o teste, plano pago gera fatura imediata", async () => {
    expect((await call(h5.changePlan, { cookie: delta, body: { planId: "starter" } })).status).toBe(200);
    const s = await saas();
    expect(s.subscription).toMatchObject({ planId: "starter", status: "pending", trialUsed: true });
    expect(s.invoices[0]).toMatchObject({ status: "pending", amountCents: 990 });
  });

  it("simulador de fatura: só o dono, só fora de produção", async () => {
    const id = (await saas()).invoices[0].id;
    expect((await call(h5.simulateInvoicePayment, { cookie: beta, params: { id }, body: { outcome: "paid" } })).status).toBe(404);
    expect((await call(h5.simulateInvoicePayment, { cookie: a1.cookie, params: { id }, body: { outcome: "paid" } })).status).toBe(403);
    vi.stubEnv("NODE_ENV", "production");
    expect((await call(h5.simulateInvoicePayment, { cookie: delta, params: { id }, body: { outcome: "paid" } })).status).toBe(404);
    vi.unstubAllEnvs();
    expect((await call(h5.simulateInvoicePayment, { cookie: delta, params: { id }, body: { outcome: "paid" } })).body.result).toBe("applied");
    expect((await sub()).status).toBe("active");
  });

  it("assinatura é por consultoria e só do personal", async () => {
    expect((await sub(beta)).planId).toBe("free");
    expect((await call(h5.getSaas, { cookie: a1.cookie })).status).toBe(403);
    expect((await call(h5.changePlan, { cookie: a1.cookie, body: { planId: "premium" } })).status).toBe(403);
    expect((await call(h5.getSaas, {})).status).toBe(401);
  });
});

describe("contratos, ciclo de cobrança e atrasos", () => {
  it("contrato gera a primeira cobrança; validações e isolamento", async () => {
    const ok = await call(h5.createContract, { cookie: alfa, params: { id: a1.id }, body: { description: "Consultoria mensal", amountCents: 20000, dueDay: 10 } });
    expect(ok.status).toBe(201);
    const c = await find(alfa, a1.id, ok.body.firstChargeId);
    expect(c).toMatchObject({ status: "pending", amountCents: 20000, contractId: ok.body.id });
    expect(c.dueDate).toBe(ok.body.firstDueDate);
    const bad = (body: any, id = a1.id, cookie = alfa) => call(h5.createContract, { cookie, params: { id }, body }).then((r) => r.status);
    expect(await bad({ description: "x", amountCents: 99, dueDay: 10 })).toBe(400);
    expect(await bad({ description: "x", amountCents: 20000, dueDay: 0 })).toBe(400);
    expect(await bad({ description: "x", amountCents: 20000, dueDay: 32 })).toBe(400);
    expect(await bad({ description: "x", amountCents: 10_000_001, dueDay: 5 })).toBe(400);
    expect(await bad({ description: "x", amountCents: 20000, dueDay: 5 }, b1.id)).toBe(404);          // aluno de outra consultoria
    expect(await bad({ description: "x", amountCents: 20000, dueDay: 5 }, a1.id, beta)).toBe(404);    // personal de outra consultoria
    expect(await bad({ description: "x", amountCents: 20000, dueDay: 5 }, a1.id, a1.cookie)).toBe(403);
  });

  it("ciclo: no máximo uma cobrança por contrato e mês (rodar de novo gera zero)", async () => {
    await call(h5.createContract, { cookie: alfa, params: { id: a2.id }, body: { description: "Mensal", amountCents: 15000, dueDay: 28 } });
    const first = (await call(h5.billingCycle, { cookie: alfa, body: {} })).body;
    expect(first.period).toBe(month);
    expect((await call(h5.billingCycle, { cookie: alfa, body: {} })).body.generated).toBe(0);
    const dup = (await (await getDb()).query<{ n: number }>("select count(*)::int n from (select contract_id, period from student_charges where contract_id is not null group by 1,2 having count(*) > 1) t")).rows[0].n;
    expect(dup).toBe(0);
    expect((await call(h5.billingCycle, { cookie: a1.cookie, body: {} })).status).toBe(403);
  });

  it("contrato cancelado não gera mais cobranças; só da própria consultoria", async () => {
    const k = (await call(h5.createContract, { cookie: alfa, params: { id: a1.id }, body: { description: "Trimestral", amountCents: 9000, dueDay: 5 } })).body;
    expect((await call(h5.cancelContract, { cookie: beta, params: { id: k.id }, body: {} })).status).toBe(404);
    expect((await call(h5.cancelContract, { cookie: alfa, params: { id: k.id }, body: {} })).status).toBe(200);
    expect((await call(h5.cancelContract, { cookie: alfa, params: { id: k.id }, body: {} })).status).toBe(404); // já cancelado
  });

  it("cobrança vencida vira 'em atraso' com UMA linha de trilha, mesmo listando várias vezes", async () => {
    const c = await mkCharge(alfa, a1.id, 5000, "2020-01-15");
    for (let i = 0; i < 3; i++) await call(h5.listCharges, { cookie: alfa });
    expect((await find(alfa, a1.id, c.id)).status).toBe("overdue");
    expect(await countEvents("where event_id = $1", [`overdue:${c.id}`])).toBe(1);
    // e ainda dá para pagar
    expect((await hook(ev(c.ref, "payment.confirmed", { amount: 5000, method: "pix" }))).body.result).toBe("applied");
  });

  it("filtro por status e escopo da lista", async () => {
    const paid = (await call(h5.listCharges, { cookie: alfa, query: "status=paid" })).body as any[];
    expect(paid.length).toBeGreaterThan(0); expect(paid.every((c) => c.status === "paid")).toBe(true);
    expect((await call(h5.listCharges, { cookie: beta })).body).toEqual([]); // outra consultoria
    expect((await call(h5.listCharges, { cookie: a1.cookie })).status).toBe(403);
  });
});

describe("recebimento manual, cancelamento e auditoria", () => {
  it("manual: marca como paga (origem manual) e audita; só em aberto", async () => {
    const c = await mkCharge(alfa, a1.id, 12000);
    expect((await call(h5.markChargePaid, { cookie: alfa, params: { id: c.id }, body: { method: "cash" } })).status).toBe(200);
    expect(await find(alfa, a1.id, c.id)).toMatchObject({ status: "paid", method: "cash", source: "manual" });
    expect((await call(h5.markChargePaid, { cookie: alfa, params: { id: c.id }, body: { method: "pix" } })).status).toBe(409);
    expect((await call(h5.cancelCharge, { cookie: alfa, params: { id: c.id }, body: {} })).status).toBe(409); // paga não cancela
    expect((await call(h5.markChargePaid, { cookie: alfa, params: { id: c.id }, body: { method: "ouro" } })).status).toBe(400);
  });
  it("cancelar uma em aberto; depois não dá para marcar como paga nem confirmar por evento", async () => {
    const c = await mkCharge(alfa, a1.id, 7000);
    expect((await call(h5.cancelCharge, { cookie: alfa, params: { id: c.id }, body: {} })).status).toBe(200);
    expect((await call(h5.markChargePaid, { cookie: alfa, params: { id: c.id }, body: { method: "pix" } })).status).toBe(409);
    expect((await hook(ev(c.ref, "payment.confirmed", { amount: 7000 }))).body.result).toBe("ignored");
    expect((await find(alfa, a1.id, c.id)).status).toBe("canceled");
  });
  it("as ações ficam na auditoria", async () => {
    const actions = (await call(h.listAudit, { cookie: alfa })).body.map((x: any) => x.action);
    expect(actions).toEqual(expect.arrayContaining(["charge.create", "charge.manual_paid", "charge.cancel", "contract.create", "contract.cancel"]));
    expect(JSON.stringify((await call(h.listAudit, { cookie: beta })).body)).not.toMatch(/charge\./); // outra consultoria não enxerga
  });
});

describe("painel financeiro e despesas", () => {
  let gamma: string, g1: { cookie: string; id: string };
  beforeAll(async () => { gamma = await registerTrainer("gamma"); g1 = await inviteStudent(gamma, "g1"); });

  it("números do mês: recebido, taxas, líquido, a receber, atraso, despesas, resultado, ticket e método", async () => {
    const c1 = await mkCharge(gamma, g1.id, 20000, endOfMonth), c2 = await mkCharge(gamma, g1.id, 30000, endOfMonth);
    await mkCharge(gamma, g1.id, 10000, endOfMonth);              // continua a receber
    await mkCharge(gamma, g1.id, 5000, "2020-01-15");             // atraso antigo (inadimplência acumulada)
    await hook(ev(c1.ref, "payment.confirmed", { amount: 20000, fee: 518, method: "pix" }));
    await hook(ev(c2.ref, "payment.confirmed", { amount: 30000, fee: 1000, method: "card" }));
    expect((await call(h5.createExpense, { cookie: gamma, body: { description: "Aluguel do espaço", category: "Espaço", amountCents: 15000, date: `${month}-01` } })).status).toBe(201);
    const d = (await call(h5.dashboard, { cookie: gamma, query: `month=${month}` })).body;
    expect(d).toMatchObject({
      month, receivedCents: 50000, feesCents: 1518, netReceivedCents: 48482, paidCount: 2, pendingCents: 10000, pendingCount: 1,
      overdueCents: 5000, overdueCount: 1, expensesCents: 15000, resultCents: 33482, ticketAvgCents: 25000, mrrCents: 0,
      byMethod: { pix: 20000, card: 30000 }, students: 1,
    });
    expect(d.notIncluded).toMatch(/CAC/);
  });
  it("estorno sai do recebido; repetir o evento não altera o painel", async () => {
    const before = (await call(h5.dashboard, { cookie: gamma, query: `month=${month}` })).body.receivedCents;
    const c = await mkCharge(gamma, g1.id, 8000, endOfMonth);
    const e = ev(c.ref, "payment.confirmed", { amount: 8000, fee: 200, method: "pix" });
    await hook(e); await hook(e); await hook(e);
    expect((await call(h5.dashboard, { cookie: gamma, query: `month=${month}` })).body).toMatchObject({ receivedCents: before + 8000 });
    await hook(ev(c.ref, "payment.refunded"));
    expect((await call(h5.dashboard, { cookie: gamma, query: `month=${month}` })).body.receivedCents).toBe(before);
  });
  it("receita recorrente soma os contratos ativos", async () => {
    await call(h5.createContract, { cookie: gamma, params: { id: g1.id }, body: { description: "Plano", amountCents: 18000, dueDay: 10 } });
    expect((await call(h5.dashboard, { cookie: gamma, query: `month=${month}` })).body.mrrCents).toBe(18000);
  });
  it("mês inválido: 400; outra consultoria enxerga zeros; aluno não acessa", async () => {
    expect((await call(h5.dashboard, { cookie: gamma, query: "month=2026-13x" })).status).toBe(400);
    expect((await call(h5.dashboard, { cookie: beta, query: `month=${month}` })).body).toMatchObject({ receivedCents: 0, expensesCents: 0, overdueCents: 0, mrrCents: 0 });
    expect((await call(h5.dashboard, { cookie: g1.cookie })).status).toBe(403);
  });
  it("despesas: criar, listar por mês, validar e isolar", async () => {
    expect((await call(h5.createExpense, { cookie: gamma, body: { description: "x", category: "y", amountCents: 0, date: `${month}-01` } })).status).toBe(400);
    expect((await call(h5.createExpense, { cookie: gamma, body: { description: "x", category: "y", amountCents: 10, date: "01/11/2026" } })).status).toBe(400);
    await call(h5.createExpense, { cookie: gamma, body: { description: "Antiga", category: "Outros", amountCents: 100, date: "2020-02-01" } });
    expect(((await call(h5.listExpenses, { cookie: gamma, query: `month=${month}` })).body as any[]).map((e) => e.description)).toEqual(["Aluguel do espaço"]);
    expect((await call(h5.listExpenses, { cookie: beta })).body).toEqual([]);
    expect((await call(h5.createExpense, { cookie: g1.cookie, body: { description: "x", category: "y", amountCents: 10, date: `${month}-01` } })).status).toBe(403);
  });
});

describe("visão do aluno e isolamento", () => {
  it("o aluno vê só as próprias cobranças", async () => {
    const c = await mkCharge(alfa, a1.id, 11111);
    const mine = (await call(h5.myBilling, { cookie: a1.cookie })).body;
    expect(mine.simulated).toBe(true);
    expect(mine.charges.some((x: any) => x.id === c.id)).toBe(true);
    const others = (await call(h5.myBilling, { cookie: a2.cookie })).body.charges as any[];
    expect(others.some((x) => x.id === c.id)).toBe(false);
    expect((await call(h5.myBilling, { cookie: b1.cookie })).body.charges.some((x: any) => x.id === c.id)).toBe(false);
    expect((await call(h5.myBilling, { cookie: alfa })).status).toBe(403);
    expect((await call(h5.myBilling, {})).status).toBe(401);
  });
  it("simulador: paga a própria cobrança pelo mesmo caminho do webhook; alheia 404; produção 404", async () => {
    const c = await mkCharge(alfa, a1.id, 9900);
    expect((await call(h5.simulateMyPayment, { cookie: a2.cookie, params: { id: c.id }, body: { outcome: "paid" } })).status).toBe(404);
    expect((await call(h5.simulateMyPayment, { cookie: beta, params: { id: c.id }, body: { outcome: "paid" } })).status).toBe(403);
    vi.stubEnv("NODE_ENV", "production");
    expect((await call(h5.simulateMyPayment, { cookie: a1.cookie, params: { id: c.id }, body: { outcome: "paid" } })).status).toBe(404);
    vi.unstubAllEnvs();
    expect((await call(h5.simulateMyPayment, { cookie: a1.cookie, params: { id: c.id }, body: { outcome: "paid", method: "pix" } })).body.result).toBe("applied");
    expect((await find(alfa, a1.id, c.id))).toMatchObject({ status: "paid", method: "pix" });
    expect((await call(h5.simulateMyPayment, { cookie: a1.cookie, params: { id: c.id }, body: { outcome: "paid" } })).body.result).toBe("ignored"); // já paga
  });
  it("em produção a cobrança nasce sem referência do provedor (não é pagável) até haver provedor", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const c = await mkCharge(alfa, a1.id, 4000);
    vi.unstubAllEnvs();
    expect((await find(alfa, a1.id, c.id)).payable).toBe(false);
    expect((await call(h5.simulateMyPayment, { cookie: a1.cookie, params: { id: c.id }, body: { outcome: "paid" } })).status).toBe(404);
  });
  it("outra consultoria não cancela, marca paga, lista nem cria cobrança alheia", async () => {
    const c = await mkCharge(alfa, a1.id, 3000);
    expect((await call(h5.cancelCharge, { cookie: beta, params: { id: c.id }, body: {} })).status).toBe(404);
    expect((await call(h5.markChargePaid, { cookie: beta, params: { id: c.id }, body: { method: "pix" } })).status).toBe(404);
    expect((await call(h5.listStudentBilling, { cookie: beta, params: { id: a1.id } })).status).toBe(404);
    expect((await call(h5.createCharge, { cookie: beta, params: { id: a1.id }, body: { description: "x", amountCents: 500, dueDate: "2099-01-01" } })).status).toBe(404);
    expect((await call(h5.createCharge, { cookie: alfa, params: { id: b1.id }, body: { description: "x", amountCents: 500, dueDate: "2099-01-01" } })).status).toBe(404);
    expect(((await call(h5.listPaymentEvents, { cookie: beta })).body as any[]).length).toBe(0);
    expect((await find(alfa, a1.id, c.id)).status).toBe("pending");
  });
  it("aluno nas rotas do personal: 403; ids inválidos: 404", async () => {
    const c = await mkCharge(alfa, a1.id, 3000);
    for (const r of [
      await call(h5.cancelCharge, { cookie: a1.cookie, params: { id: c.id }, body: {} }),
      await call(h5.markChargePaid, { cookie: a1.cookie, params: { id: c.id }, body: { method: "pix" } }),
      await call(h5.listPaymentEvents, { cookie: a1.cookie }),
      await call(h5.createCharge, { cookie: a1.cookie, params: { id: a1.id }, body: { description: "x", amountCents: 500, dueDate: "2099-01-01" } }),
    ]) expect(r.status).toBe(403);
    expect((await call(h5.cancelCharge, { cookie: alfa, params: { id: "nao-e-uuid" }, body: {} })).status).toBe(404);
    expect((await call(h5.createCharge, { cookie: alfa, params: { id: a1.id }, body: { description: "x", amountCents: 500, dueDate: "amanha" } })).status).toBe(400);
  });
});
