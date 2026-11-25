// Painel financeiro básico (PROPOSTA do documento): recebimentos, inadimplência, despesas, resultado.
// Fluxo de caixa, DRE, margem, pró-labore, churn, CAC, LTV e projeções ficam para evolução futura.
import type { ChargeStatus } from "./billing";

export interface FinCharge { amountCents: number; feeCents: number; status: ChargeStatus; method: string | null; dueDate: string; paidAt: string | null }
export interface FinExpense { amountCents: number; date: string }
export interface FinContract { amountCents: number; active: boolean }

export interface MonthSummary {
  month: string;
  receivedCents: number; feesCents: number; netReceivedCents: number; paidCount: number;
  pendingCents: number; pendingCount: number;
  overdueCents: number; overdueCount: number; billedCents: number; defaultRatePct: number | null;
  expensesCents: number; resultCents: number;
  ticketAvgCents: number | null; mrrCents: number;
  byMethod: Record<string, number>;
}

const inMonth = (iso: string | null, month: string) => !!iso && iso.slice(0, 7) === month;

export function summarizeMonth(charges: FinCharge[], expenses: FinExpense[], contracts: FinContract[], month: string): MonthSummary {
  // Recebido: pago, com pagamento dentro do mês. Estornados saem do total.
  const paid = charges.filter((c) => c.status === "paid" && inMonth(c.paidAt, month));
  const received = paid.reduce((n, c) => n + c.amountCents, 0);
  const fees = paid.reduce((n, c) => n + c.feeCents, 0);
  const byMethod: Record<string, number> = {};
  for (const c of paid) byMethod[c.method ?? "outro"] = (byMethod[c.method ?? "outro"] ?? 0) + c.amountCents;

  const dueThisMonth = charges.filter((c) => c.dueDate.slice(0, 7) === month && c.status !== "canceled" && c.status !== "refunded");
  const pending = dueThisMonth.filter((c) => c.status === "pending");
  const overdueAll = charges.filter((c) => c.status === "overdue"); // inadimplência acumulada, de qualquer mês
  const overdueMonth = dueThisMonth.filter((c) => c.status === "overdue");
  const billed = dueThisMonth.reduce((n, c) => n + c.amountCents, 0);
  const expensesTotal = expenses.filter((e) => e.date.slice(0, 7) === month).reduce((n, e) => n + e.amountCents, 0);

  return {
    month, receivedCents: received, feesCents: fees, netReceivedCents: received - fees, paidCount: paid.length,
    pendingCents: pending.reduce((n, c) => n + c.amountCents, 0), pendingCount: pending.length,
    overdueCents: overdueAll.reduce((n, c) => n + c.amountCents, 0), overdueCount: overdueAll.length,
    billedCents: billed,
    defaultRatePct: billed > 0 ? Math.round((overdueMonth.reduce((n, c) => n + c.amountCents, 0) / billed) * 1000) / 10 : null,
    expensesCents: expensesTotal, resultCents: received - fees - expensesTotal,
    ticketAvgCents: paid.length ? Math.round(received / paid.length) : null,
    mrrCents: contracts.filter((c) => c.active).reduce((n, c) => n + c.amountCents, 0),
    byMethod,
  };
}
