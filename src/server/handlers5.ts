// Entrega 5: operação comercial — cobrança do aluno, assinatura da plataforma (SaaS), eventos do intermediador,
// despesas e painel financeiro básico. Sem provedor escolhido: nada aqui cobra de verdade (ver payments.ts).
import { z } from "zod";
import { brl, dateKey, EVENT_TYPES, firstDueDate, dueDateFor, isPastDue, monthKey, planById, PLANS, PLANS_ARE_PROPOSAL, TRIAL_DAYS, type ChargeStatus } from "../lib/billing";
import { summarizeMonth } from "../lib/finance";
import { uid } from "./auth";
import type { Actor } from "./auth";
import type { Db } from "./db";
import { assertStudent, audit } from "./handlers";
import { body, HttpError, json, notFound, requireActor, route } from "./http";
import { chargeProviderRef, invoiceProviderRef, isProduction, processPaymentEvent, SIMULATED, verifySignature, webhookSecret } from "./payments";

const uuid = z.string().uuid();
const cents = z.number().int().min(100).max(10_000_000);
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD");
const text = (max: number) => z.string().trim().min(1).max(max);

// =========================================================== Webhook do intermediador

/** Público (sem cookie), autenticado por assinatura HMAC do corpo. Responde 200 também para repetições. */
export const paymentWebhook = route(async (ctx) => {
  const secret = webhookSecret();
  if (!secret) throw new HttpError(503, "Webhook de pagamentos não configurado");
  const raw = await ctx.req.text();
  if (!verifySignature(secret, raw, ctx.req.headers.get("x-signature"))) throw new HttpError(401, "Assinatura inválida");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new HttpError(400, "JSON inválido"); }
  const ev = z.object({
    id: text(120), type: z.enum(EVENT_TYPES as [string, ...string[]]),
    data: z.object({ ref: text(200), amountCents: z.number().int().min(0).optional(), feeCents: z.number().int().min(0).optional(), method: z.enum(["pix", "boleto", "card"]).optional() }),
  }).parse(parsed);
  const out = await processPaymentEvent(ctx.db, { provider: ctx.req.headers.get("x-provider") ?? SIMULATED, eventId: ev.id, type: ev.type, ref: ev.data.ref, amountCents: ev.data.amountCents, feeCents: ev.data.feeCents, method: ev.data.method });
  return json(out);
});

// =============================================================== Cobrança do aluno

interface ChargeRow { id: string; student_id: string; student_name?: string; contract_id: string | null; period: string | null; description: string; amount_cents: number; fee_cents: number; due_date: string; status: ChargeStatus; method: string | null; source: string; provider_ref: string | null; created_at: string; paid_at: string | null; refunded_at: string | null }
const CH_COLS = "c.id, c.student_id, u.name as student_name, c.contract_id, c.period, c.description, c.amount_cents, c.fee_cents, c.due_date, c.status, c.method, c.source, c.provider_ref, c.created_at, c.paid_at, c.refunded_at";
const chargeOut = (r: ChargeRow) => ({
  id: r.id, studentId: r.student_id, studentName: r.student_name, contractId: r.contract_id, period: r.period, description: r.description,
  amountCents: r.amount_cents, feeCents: r.fee_cents, dueDate: r.due_date, status: r.status, method: r.method, source: r.source,
  createdAt: r.created_at, paidAt: r.paid_at, refundedAt: r.refunded_at, payable: !!r.provider_ref && ["pending", "overdue", "failed"].includes(r.status),
});

/** Pendentes vencidas viram "em atraso". Cada transição fica em payment_events (idempotente por cobrança). */
async function markOverdue(db: Db, consultancyId: string, today: Date): Promise<number> {
  const due = (await db.query<{ id: string }>(
    "select id from student_charges where consultancy_id = $1 and status = 'pending' and due_date < $2", [consultancyId, dateKey(today)])).rows;
  for (const c of due) {
    await db.transaction(async (tx) => {
      const ins = await tx.query("insert into payment_events (id, provider, event_id, type, payload, result, scope, target_id, from_status, to_status, processed_at) values ($1,'system',$2,'system.overdue','{}'::jsonb,'applied','student_charge',$3,'pending','overdue', now()) on conflict (provider, event_id) do nothing returning id", [uid(), `overdue:${c.id}`, c.id]);
      if (ins.rows.length) await tx.query("update student_charges set status = 'overdue' where id = $1 and status = 'pending'", [c.id]);
    });
  }
  return due.length;
}

/** Gera as cobranças do mês dos contratos ativos (uma por contrato/mês) e atualiza atrasos. Pronto para rodar em agendador. */
export async function runBillingCycle(db: Db, a: Actor, today: Date) {
  const period = monthKey(today);
  const contracts = (await db.query<{ id: string; student_id: string; description: string; amount_cents: number; due_day: number; start_month: string }>(
    "select id, student_id, description, amount_cents, due_day, start_month from student_contracts where consultancy_id = $1 and active and start_month <= $2", [a.consultancyId, period])).rows;
  let generated = 0;
  for (const c of contracts) {
    const id = uid();
    const ins = await db.query(
      `insert into student_charges (id, consultancy_id, student_id, contract_id, period, description, amount_cents, due_date, status, provider_ref, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,$10) on conflict (contract_id, period) where contract_id is not null do nothing returning id`,
      [id, a.consultancyId, c.student_id, c.id, period, c.description, c.amount_cents, dueDateFor(period, c.due_day), chargeProviderRef(id), a.userId]);
    generated += ins.rows.length;
  }
  const overdue = await markOverdue(db, a.consultancyId, today);
  return { period, generated, overdue };
}

export const billingCycle = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const r = await runBillingCycle(ctx.db, a, new Date());
  if (r.generated > 0) await audit(ctx.db, a, "billing.cycle", r);
  return json(r);
});

export const createContract = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  if (!uuid.safeParse(ctx.params.id).success) notFound();
  await assertStudent(ctx.db, a, ctx.params.id);
  const input = await body(ctx, z.object({ description: text(120), amountCents: cents, dueDay: z.number().int().min(1).max(31) }));
  const today = new Date();
  const first = firstDueDate(today, input.dueDay);
  const id = uid(), chargeId = uid();
  await ctx.db.transaction(async (tx) => {
    await tx.query("insert into student_contracts (id, consultancy_id, student_id, description, amount_cents, due_day, start_month, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8)",
      [id, a.consultancyId, ctx.params.id, input.description, input.amountCents, input.dueDay, first.period, a.userId]);
    await tx.query(
      "insert into student_charges (id, consultancy_id, student_id, contract_id, period, description, amount_cents, due_date, status, provider_ref, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,$10)",
      [chargeId, a.consultancyId, ctx.params.id, id, first.period, input.description, input.amountCents, first.dueDate, chargeProviderRef(chargeId), a.userId]);
    await audit(tx, a, "contract.create", { contractId: id, studentId: ctx.params.id, amountCents: input.amountCents });
  });
  return json({ id, firstChargeId: chargeId, firstDueDate: first.dueDate }, 201);
});

export const cancelContract = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  if (!uuid.safeParse(ctx.params.id).success) notFound();
  const r = await ctx.db.query("update student_contracts set active = false where id = $1 and consultancy_id = $2 and active returning id", [ctx.params.id, a.consultancyId]);
  if (r.rows.length === 0) notFound();
  await audit(ctx.db, a, "contract.cancel", { contractId: ctx.params.id });
  return json({ ok: true });
});

/** Cobrança avulsa (fora de contrato recorrente). */
export const createCharge = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  if (!uuid.safeParse(ctx.params.id).success) notFound();
  await assertStudent(ctx.db, a, ctx.params.id);
  const input = await body(ctx, z.object({ description: text(120), amountCents: cents, dueDate: ymd }));
  const id = uid();
  await ctx.db.transaction(async (tx) => {
    await tx.query("insert into student_charges (id, consultancy_id, student_id, description, amount_cents, due_date, status, provider_ref, created_by) values ($1,$2,$3,$4,$5,$6,'pending',$7,$8)",
      [id, a.consultancyId, ctx.params.id, input.description, input.amountCents, input.dueDate, chargeProviderRef(id), a.userId]);
    await audit(tx, a, "charge.create", { chargeId: id, studentId: ctx.params.id, amountCents: input.amountCents });
  });
  return json({ id }, 201);
});

async function ownCharge(db: Db, a: Actor, id: string) {
  if (!uuid.safeParse(id).success) notFound();
  const r = (await db.query<{ id: string; status: ChargeStatus; amount_cents: number }>("select id, status, amount_cents from student_charges where id = $1 and consultancy_id = $2", [id, a.consultancyId])).rows[0];
  if (!r) notFound();
  return r;
}

export const cancelCharge = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const c = await ownCharge(ctx.db, a, ctx.params.id);
  if (!["pending", "overdue", "failed"].includes(c.status)) throw new HttpError(409, "Só cobranças em aberto podem ser canceladas");
  await ctx.db.transaction(async (tx) => {
    await tx.query("update student_charges set status = 'canceled' where id = $1", [c.id]);
    await audit(tx, a, "charge.cancel", { chargeId: c.id, from: c.status });
  });
  return json({ id: c.id, status: "canceled" });
});

/** Recebimento por fora do aplicativo (dinheiro, Pix direto). Fica marcado como "manual" e auditado. */
export const markChargePaid = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const c = await ownCharge(ctx.db, a, ctx.params.id);
  const input = await body(ctx, z.object({ method: z.enum(["pix", "boleto", "card", "cash"]) }));
  if (!["pending", "overdue", "failed"].includes(c.status)) throw new HttpError(409, "Esta cobrança não está em aberto");
  await ctx.db.transaction(async (tx) => {
    await tx.query("update student_charges set status = 'paid', paid_at = now(), method = $2, source = 'manual' where id = $1", [c.id, input.method]);
    await audit(tx, a, "charge.manual_paid", { chargeId: c.id, from: c.status, method: input.method });
  });
  return json({ id: c.id, status: "paid" });
});

export const listCharges = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  await markOverdue(ctx.db, a.consultancyId, new Date());
  const status = ctx.url.searchParams.get("status");
  const { rows } = await ctx.db.query<ChargeRow>(
    `select ${CH_COLS} from student_charges c join users u on u.id = c.student_id
      where c.consultancy_id = $1 and ($2::text is null or c.status = $2) order by c.due_date desc, c.created_at desc limit 300`, [a.consultancyId, status]);
  return json(rows.map(chargeOut));
});

export const listStudentBilling = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  if (!uuid.safeParse(ctx.params.id).success) notFound();
  await assertStudent(ctx.db, a, ctx.params.id);
  await markOverdue(ctx.db, a.consultancyId, new Date());
  const charges = (await ctx.db.query<ChargeRow>(`select ${CH_COLS} from student_charges c join users u on u.id = c.student_id where c.consultancy_id = $1 and c.student_id = $2 order by c.due_date desc`, [a.consultancyId, ctx.params.id])).rows;
  const contracts = (await ctx.db.query(`select id, description, amount_cents as "amountCents", due_day as "dueDay", active from student_contracts where consultancy_id = $1 and student_id = $2 order by created_at desc`, [a.consultancyId, ctx.params.id])).rows;
  return json({ contracts, charges: charges.map(chargeOut) });
});

/** O aluno consulta as próprias cobranças, pagamentos e contratação (nunca as de outro aluno). */
export const myBilling = route(async (ctx) => {
  const a = await requireActor(ctx, "student");
  await markOverdue(ctx.db, a.consultancyId, new Date());
  const charges = (await ctx.db.query<ChargeRow>(`select ${CH_COLS} from student_charges c join users u on u.id = c.student_id where c.student_id = $1 order by c.due_date desc`, [a.userId])).rows;
  const contracts = (await ctx.db.query(`select id, description, amount_cents as "amountCents", due_day as "dueDay", active from student_contracts where student_id = $1 order by created_at desc`, [a.userId])).rows;
  return json({ contracts, charges: charges.map(chargeOut), simulated: !isProduction() });
});

/** Só fora de produção: simula o intermediador enviando um evento assinado e o processa pelo mesmo caminho do webhook. */
export const simulateMyPayment = route(async (ctx) => {
  if (isProduction()) notFound();
  const a = await requireActor(ctx, "student");
  if (!uuid.safeParse(ctx.params.id).success) notFound();
  const input = await body(ctx, z.object({ outcome: z.enum(["paid", "failed"]), method: z.enum(["pix", "boleto", "card"]).default("pix") }));
  const c = (await ctx.db.query<{ provider_ref: string | null; amount_cents: number }>("select provider_ref, amount_cents from student_charges where id = $1 and student_id = $2", [ctx.params.id, a.userId])).rows[0];
  if (!c || !c.provider_ref) notFound();
  const out = await processPaymentEvent(ctx.db, { provider: SIMULATED, eventId: `sim:${uid()}`, type: input.outcome === "paid" ? "payment.confirmed" : "payment.failed", ref: c.provider_ref, amountCents: c.amount_cents, method: input.method });
  return json(out);
});

// ====================================================================== Despesas

export const createExpense = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const input = await body(ctx, z.object({ description: text(120), category: text(40), amountCents: z.number().int().min(1).max(10_000_000), date: ymd }));
  const id = uid();
  await ctx.db.query("insert into expenses (id, consultancy_id, description, category, amount_cents, date, created_by) values ($1,$2,$3,$4,$5,$6,$7)",
    [id, a.consultancyId, input.description, input.category, input.amountCents, input.date, a.userId]);
  return json({ id }, 201);
});

export const listExpenses = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const month = ctx.url.searchParams.get("month");
  const { rows } = await ctx.db.query(`select id, description, category, amount_cents as "amountCents", date from expenses where consultancy_id = $1 and ($2::text is null or substr(date, 1, 7) = $2) order by date desc limit 300`, [a.consultancyId, month]);
  return json(rows);
});

// ================================================================ Painel financeiro

export const dashboard = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const month = ctx.url.searchParams.get("month") ?? monthKey(new Date());
  if (!/^\d{4}-\d{2}$/.test(month)) throw new HttpError(400, "Mês no formato AAAA-MM");
  await markOverdue(ctx.db, a.consultancyId, new Date());
  const ch = (await ctx.db.query<{ amount_cents: number; fee_cents: number; status: ChargeStatus; method: string | null; due_date: string; paid_at: string | null }>(
    "select amount_cents, fee_cents, status, method, due_date, paid_at from student_charges where consultancy_id = $1", [a.consultancyId])).rows;
  const ex = (await ctx.db.query<{ amount_cents: number; date: string }>("select amount_cents, date from expenses where consultancy_id = $1", [a.consultancyId])).rows;
  const co = (await ctx.db.query<{ amount_cents: number; active: boolean }>("select amount_cents, active from student_contracts where consultancy_id = $1", [a.consultancyId])).rows;
  const summary = summarizeMonth(
    ch.map((c) => ({ amountCents: c.amount_cents, feeCents: c.fee_cents, status: c.status, method: c.method, dueDate: c.due_date, paidAt: c.paid_at ? new Date(c.paid_at).toISOString() : null })),
    ex.map((e) => ({ amountCents: e.amount_cents, date: e.date })), co.map((c) => ({ amountCents: c.amount_cents, active: c.active })), month);
  const students = (await ctx.db.query<{ n: number }>("select count(*)::int as n from memberships where consultancy_id = $1 and role = 'student'", [a.consultancyId])).rows[0].n;
  return json({ ...summary, activeContracts: co.filter((c) => c.active).length, students,
    notIncluded: "Fluxo de caixa, DRE, margem, pró-labore, churn, CAC, LTV, metas e projeções ficam para evolução futura." });
});

/** Conciliação: eventos recebidos do intermediador (e mudanças de estado) ligados às cobranças da consultoria. */
export const listPaymentEvents = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const { rows } = await ctx.db.query(
    `select e.id, e.provider, e.event_id as "eventId", e.type, e.result, e.reason, e.scope, e.from_status as "from", e.to_status as "to", e.received_at as "receivedAt", e.target_id as "targetId"
       from payment_events e
      where (e.scope = 'student_charge' and e.target_id in (select id from student_charges where consultancy_id = $1))
         or (e.scope = 'saas_invoice' and e.target_id in (select id from saas_invoices where consultancy_id = $1))
      order by e.received_at desc limit 100`, [a.consultancyId]);
  return json(rows);
});

// ============================================================== Assinatura (SaaS)

interface SubRow { id: string; plan_id: string; status: "trialing" | "active" | "pending" | "past_due" | "canceled"; trial_used: boolean; trial_ends_at: string | null; current_period_end: string | null }

async function ensureSubscription(db: Db, consultancyId: string): Promise<SubRow> {
  await db.query("insert into saas_subscriptions (id, consultancy_id, plan_id, status) values ($1,$2,'free','active') on conflict (consultancy_id) do nothing", [uid(), consultancyId]);
  return (await db.query<SubRow>("select id, plan_id, status, trial_used, trial_ends_at, current_period_end from saas_subscriptions where consultancy_id = $1", [consultancyId])).rows[0];
}

async function createInvoice(db: Db, consultancyId: string, sub: SubRow, planId: string, start: Date) {
  const plan = planById(planId)!;
  const exists = await db.query("select 1 from saas_invoices where subscription_id = $1 and status in ('pending','overdue','failed')", [sub.id]);
  if (exists.rows.length) return;
  const id = uid();
  await db.query(
    "insert into saas_invoices (id, consultancy_id, subscription_id, plan_id, amount_cents, status, provider_ref, period_start, period_end) values ($1,$2,$3,$4,$5,'pending',$6,$7,$8)",
    [id, consultancyId, sub.id, planId, plan.monthlyCents, invoiceProviderRef(id), start, new Date(start.getTime() + 30 * 86400000)]);
}

/** Fim do teste ou do período => nova fatura da plataforma (separada das cobranças dos alunos). */
export async function runSaasCycle(db: Db, consultancyId: string, now: Date) {
  const sub = await ensureSubscription(db, consultancyId);
  const plan = planById(sub.plan_id);
  if (!plan || plan.monthlyCents === 0) return sub;
  if (sub.status === "trialing" && sub.trial_ends_at && new Date(sub.trial_ends_at) <= now) {
    await db.query("update saas_subscriptions set status = 'pending', updated_at = now() where id = $1", [sub.id]);
    await createInvoice(db, consultancyId, sub, sub.plan_id, now);
  } else if (sub.status === "active" && sub.current_period_end && new Date(sub.current_period_end) <= now) {
    await createInvoice(db, consultancyId, sub, sub.plan_id, now);
  }
  return ensureSubscription(db, consultancyId);
}

export const getSaas = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const sub = await runSaasCycle(ctx.db, a.consultancyId, new Date());
  const invoices = (await ctx.db.query(
    `select id, plan_id as "planId", amount_cents as "amountCents", fee_cents as "feeCents", status, period_start as "periodStart", period_end as "periodEnd", paid_at as "paidAt", (provider_ref is not null) as payable
       from saas_invoices where consultancy_id = $1 order by created_at desc limit 24`, [a.consultancyId])).rows;
  const used = (await ctx.db.query<{ n: number }>("select count(*)::int as n from memberships where consultancy_id = $1 and role = 'student'", [a.consultancyId])).rows[0].n;
  const plan = planById(sub.plan_id)!;
  return json({
    plans: PLANS, plansAreProposal: PLANS_ARE_PROPOSAL, trialDays: TRIAL_DAYS,
    subscription: { planId: sub.plan_id, status: sub.status, trialUsed: sub.trial_used, trialEndsAt: sub.trial_ends_at, currentPeriodEnd: sub.current_period_end },
    usage: { students: used, limit: plan.studentLimit, overLimit: plan.studentLimit != null && used > plan.studentLimit },
    invoices, simulated: !isProduction(),
    note: "Preços, limites e teste são propostas do documento, sujeitos a validação. Os limites ainda não bloqueiam o uso.",
  });
});

export const changePlan = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const input = await body(ctx, z.object({ planId: z.enum(["free", "starter", "professional", "premium"]) }));
  const sub = await runSaasCycle(ctx.db, a.consultancyId, new Date());
  if (sub.plan_id === input.planId) throw new HttpError(409, "Este já é o seu plano");
  const plan = planById(input.planId)!;
  await ctx.db.transaction(async (tx) => {
    if (plan.monthlyCents === 0) {
      await tx.query("update saas_subscriptions set plan_id = 'free', status = 'active', trial_ends_at = null, updated_at = now() where id = $1", [sub.id]);
      await tx.query("update saas_invoices set status = 'canceled' where subscription_id = $1 and status in ('pending','overdue','failed')", [sub.id]);
    } else if (sub.status === "trialing") {
      await tx.query("update saas_subscriptions set plan_id = $2, updated_at = now() where id = $1", [sub.id, plan.id]); // troca durante o teste mantém o teste
    } else if (!sub.trial_used) {
      await tx.query("update saas_subscriptions set plan_id = $2, status = 'trialing', trial_used = true, trial_ends_at = now() + ($3 || ' days')::interval, updated_at = now() where id = $1", [sub.id, plan.id, String(TRIAL_DAYS)]);
    } else {
      await tx.query("update saas_invoices set status = 'canceled' where subscription_id = $1 and status in ('pending','overdue','failed')", [sub.id]);
      await tx.query("update saas_subscriptions set plan_id = $2, status = 'pending', updated_at = now() where id = $1", [sub.id, plan.id]);
      await createInvoice(tx as unknown as Db, a.consultancyId, { ...sub, plan_id: plan.id }, plan.id, new Date());
    }
    await audit(tx, a, "saas.plan", { from: sub.plan_id, to: plan.id });
  });
  return json({ planId: plan.id });
});

export const simulateInvoicePayment = route(async (ctx) => {
  if (isProduction()) notFound();
  const a = await requireActor(ctx, "trainer");
  if (!uuid.safeParse(ctx.params.id).success) notFound();
  const input = await body(ctx, z.object({ outcome: z.enum(["paid", "failed"]) }));
  const inv = (await ctx.db.query<{ provider_ref: string | null; amount_cents: number }>("select provider_ref, amount_cents from saas_invoices where id = $1 and consultancy_id = $2", [ctx.params.id, a.consultancyId])).rows[0];
  if (!inv || !inv.provider_ref) notFound();
  return json(await processPaymentEvent(ctx.db, { provider: SIMULATED, eventId: `sim:${uid()}`, type: input.outcome === "paid" ? "payment.confirmed" : "payment.failed", ref: inv.provider_ref, amountCents: inv.amount_cents, method: "card" }));
});

export const _fmt = brl; // reexporta para a camada de telas/relatórios futuras (evita import duplicado)
void isPastDue;
