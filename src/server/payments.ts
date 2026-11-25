// Camada de pagamentos. O provedor real AINDA NÃO FOI ESCOLHIDO (decisão pendente): nada aqui move dinheiro de verdade.
// - "simulated": provedor de desenvolvimento (só fora de produção); gera eventos assinados como um provedor real faria.
// - Eventos do intermediador chegam por webhook assinado (HMAC-SHA256) e passam por UM único processamento,
//   idempotente pelo id do evento: repetir o evento não repete a atualização financeira.
// - Assinatura da plataforma (SaaS) e cobrança do aluno são registros separados; o evento só afeta o que sua referência indica.
import { createHmac, timingSafeEqual } from "node:crypto";
import { nextStatus, TRIAL_DAYS, type ChargeStatus, type EventType } from "../lib/billing";
import { uid } from "./auth";
import type { Db } from "./db";

export const SIMULATED = "simulated";
export const isProduction = () => process.env.NODE_ENV === "production";

/** Segredo do webhook. Em produção só existe se configurado; em desenvolvimento há um padrão local. */
export function webhookSecret(): string | null {
  if (process.env.PAYMENT_WEBHOOK_SECRET) return process.env.PAYMENT_WEBHOOK_SECRET;
  return isProduction() ? null : "dev-webhook-secret";
}

export const sign = (secret: string, raw: string) => createHmac("sha256", secret).update(raw).digest("hex");

export function verifySignature(secret: string, raw: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = Buffer.from(sign(secret, raw), "hex");
  let given: Buffer;
  try { given = Buffer.from(signature.trim(), "hex"); } catch { return false; }
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export const chargeProviderRef = (chargeId: string) => (isProduction() ? null : `sim_ch_${chargeId}`);
export const invoiceProviderRef = (invoiceId: string) => (isProduction() ? null : `sim_inv_${invoiceId}`);

export interface PaymentEvent {
  provider: string; eventId: string; type: EventType | string; ref: string;
  amountCents?: number; feeCents?: number; method?: "pix" | "boleto" | "card";
}
export interface EventOutcome { result: "applied" | "duplicate" | "ignored" | "rejected"; reason?: string; scope?: "student_charge" | "saas_invoice"; targetId?: string }

/**
 * Processa um evento do intermediador (webhook ou simulador). Idempotente por (provedor, id do evento).
 * Toda mudança de estado fica registrada em payment_events (de → para), que é a trilha de conciliação.
 */
export async function processPaymentEvent(db: Db, ev: PaymentEvent): Promise<EventOutcome> {
  return db.transaction(async (tx) => {
    const ins = await tx.query<{ id: string }>(
      `insert into payment_events (id, provider, event_id, type, ref, payload) values ($1,$2,$3,$4,$5,$6::jsonb)
       on conflict (provider, event_id) do nothing returning id`,
      [uid(), ev.provider, ev.eventId, ev.type, ev.ref, JSON.stringify(ev)]);
    if (ins.rows.length === 0) return { result: "duplicate" as const };
    const evId = ins.rows[0].id;
    const finish = async (o: EventOutcome, from?: string, to?: string) => {
      await tx.query("update payment_events set result = $2, reason = $3, scope = $4, target_id = $5, from_status = $6, to_status = $7, processed_at = now() where id = $1",
        [evId, o.result, o.reason ?? null, o.scope ?? null, o.targetId ?? null, from ?? null, to ?? null]);
      return o;
    };

    // A referência decide a que registro o evento pertence (cobrança do aluno OU fatura da plataforma).
    const ch = (await tx.query<{ id: string; status: ChargeStatus; amount_cents: number }>("select id, status, amount_cents from student_charges where provider_ref = $1", [ev.ref])).rows[0];
    const inv = ch ? undefined : (await tx.query<{ id: string; status: ChargeStatus; amount_cents: number; consultancy_id: string }>("select id, status, amount_cents, consultancy_id from saas_invoices where provider_ref = $1", [ev.ref])).rows[0];
    const target = ch ?? inv;
    if (!target) return finish({ result: "ignored", reason: "referência desconhecida" });
    const scope = ch ? "student_charge" as const : "saas_invoice" as const;
    const base = { scope, targetId: target.id };

    if (ev.type === "payment.confirmed" && ev.amountCents !== target.amount_cents) {
      return finish({ ...base, result: "rejected", reason: `valor do evento (${ev.amountCents ?? "ausente"}) difere do cobrado (${target.amount_cents})` });
    }
    const next = nextStatus(target.status, ev.type as EventType);
    if (!next) return finish({ ...base, result: "ignored", reason: "evento sem efeito neste estado" }, target.status, target.status);

    const paid = next === "paid";
    if (ch) {
      await tx.query(
        `update student_charges set status = $2,
           paid_at = case when $3 then now() else paid_at end, method = case when $3 then $4 else method end,
           fee_cents = case when $3 then $5 else fee_cents end, refunded_at = case when $2 = 'refunded' then now() else refunded_at end
         where id = $1`, [ch.id, next, paid, ev.method ?? null, ev.feeCents ?? 0]);
    } else if (inv) {
      await tx.query("update saas_invoices set status = $2, paid_at = case when $3 then now() else paid_at end, fee_cents = case when $3 then $4 else fee_cents end where id = $1", [inv.id, next, paid, ev.feeCents ?? 0]);
      if (paid) {
        await tx.query(
          `update saas_subscriptions set status = 'active', trial_ends_at = null,
             current_period_end = greatest(now(), coalesce(current_period_end, now())) + ($2 || ' days')::interval, updated_at = now()
           where consultancy_id = $1`, [inv.consultancy_id, String(TRIAL_DAYS)]);
      } else if (next === "failed") {
        await tx.query("update saas_subscriptions set status = 'past_due', updated_at = now() where consultancy_id = $1 and status in ('active','pending','trialing')", [inv.consultancy_id]);
      }
    }
    return finish({ ...base, result: "applied" }, target.status, next);
  });
}
