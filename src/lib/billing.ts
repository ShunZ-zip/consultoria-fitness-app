// Cobrança. Valores em centavos (inteiros).
// PLANOS: preços e limites são PROPOSTA do documento (validar custos, taxas e condições das lojas antes de fixar).
export const PLANS_ARE_PROPOSAL = true;
export const TRIAL_DAYS = 30;

export interface Plan { id: "free" | "starter" | "professional" | "premium"; name: string; monthlyCents: number; studentLimit: number | null; brand: boolean }
export const PLANS: Plan[] = [
  { id: "free", name: "Gratuito", monthlyCents: 0, studentLimit: 1, brand: false },
  { id: "starter", name: "Starter", monthlyCents: 990, studentLimit: 5, brand: false },
  { id: "professional", name: "Professional", monthlyCents: 3990, studentLimit: null, brand: false },
  { id: "premium", name: "Premium", monthlyCents: 6990, studentLimit: null, brand: true },
];
export const planById = (id: string) => PLANS.find((p) => p.id === id) ?? null;

export type ChargeStatus = "pending" | "paid" | "overdue" | "failed" | "canceled" | "refunded";
export type EventType = "payment.pending" | "payment.confirmed" | "payment.failed" | "payment.canceled" | "payment.refunded";
export const EVENT_TYPES: EventType[] = ["payment.pending", "payment.confirmed", "payment.failed", "payment.canceled", "payment.refunded"];

const TRANSITIONS: Record<ChargeStatus, Partial<Record<EventType, ChargeStatus>>> = {
  pending: { "payment.confirmed": "paid", "payment.failed": "failed", "payment.canceled": "canceled" },
  overdue: { "payment.confirmed": "paid", "payment.failed": "failed", "payment.canceled": "canceled" },
  failed: { "payment.confirmed": "paid" },       // nova tentativa aprovada
  paid: { "payment.refunded": "refunded" },
  canceled: {}, refunded: {},
};

/** Próximo estado, ou null quando o evento não muda nada (repetido, fora de ordem ou sem efeito). */
export function nextStatus(current: ChargeStatus, type: EventType): ChargeStatus | null {
  return TRANSITIONS[current][type] ?? null;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const monthKey = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
export const dateKey = (d: Date) => `${monthKey(d)}-${pad(d.getUTCDate())}`;
export const daysInMonth = (y: number, m1: number) => new Date(Date.UTC(y, m1, 0)).getUTCDate();

/** Vencimento no mês: o dia pedido, limitado ao último dia do mês (dia 31 em fevereiro vira 28/29). */
export function dueDateFor(month: string, day: number): string {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${pad(Math.min(day, daysInMonth(y, m)))}`;
}

/** Primeiro vencimento de um contrato mensal: neste mês se o dia ainda não passou, senão no próximo. */
export function firstDueDate(today: Date, day: number): { period: string; dueDate: string } {
  const month = monthKey(today);
  if (day >= today.getUTCDate()) return { period: month, dueDate: dueDateFor(month, day) };
  const next = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
  const nm = monthKey(next);
  return { period: nm, dueDate: dueDateFor(nm, day) };
}

/** Em atraso = venceu antes de hoje (a data de vencimento em si ainda é prazo). */
export const isPastDue = (dueDate: string, today: Date) => dueDate < dateKey(today);

export const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
