import { describe, expect, it } from "vitest";
import { dateKey, dueDateFor, firstDueDate, isPastDue, monthKey, nextStatus, PLANS, brl, type ChargeStatus, type EventType } from "../src/lib/billing";
import { summarizeMonth, type FinCharge } from "../src/lib/finance";

describe("planos (proposta do documento)", () => {
  it("quatro planos com os valores e limites propostos", () => {
    expect(PLANS.map((p) => [p.id, p.monthlyCents, p.studentLimit, p.brand])).toEqual([
      ["free", 0, 1, false], ["starter", 990, 5, false], ["professional", 3990, null, false], ["premium", 6990, null, true],
    ]);
  });
  it("formata em reais", () => expect(brl(3990).replace(/\s/g, " ")).toBe("R$ 39,90"));
});

describe("estados da cobrança", () => {
  const all: ChargeStatus[] = ["pending", "paid", "overdue", "failed", "canceled", "refunded"];
  const evs: EventType[] = ["payment.pending", "payment.confirmed", "payment.failed", "payment.canceled", "payment.refunded"];
  it("caminhos válidos", () => {
    expect(nextStatus("pending", "payment.confirmed")).toBe("paid");
    expect(nextStatus("overdue", "payment.confirmed")).toBe("paid");
    expect(nextStatus("failed", "payment.confirmed")).toBe("paid");
    expect(nextStatus("pending", "payment.failed")).toBe("failed");
    expect(nextStatus("pending", "payment.canceled")).toBe("canceled");
    expect(nextStatus("paid", "payment.refunded")).toBe("refunded");
  });
  it("evento repetido, fora de ordem ou sem efeito não muda nada", () => {
    expect(nextStatus("paid", "payment.confirmed")).toBeNull();      // confirmação repetida
    expect(nextStatus("paid", "payment.failed")).toBeNull();         // falha chegando depois do pagamento
    expect(nextStatus("pending", "payment.refunded")).toBeNull();    // estorno de algo não pago
    expect(nextStatus("canceled", "payment.confirmed")).toBeNull();
    expect(nextStatus("refunded", "payment.confirmed")).toBeNull();
    for (const s of all) expect(nextStatus(s, "payment.pending")).toBeNull();
  });
  it("estados finais não saem do lugar", () => {
    for (const e of evs) { expect(nextStatus("canceled", e)).toBeNull(); expect(nextStatus("refunded", e)).toBeNull(); }
  });
});

describe("datas de vencimento", () => {
  it("limita o dia ao fim do mês", () => {
    expect(dueDateFor("2026-02", 31)).toBe("2026-02-28");
    expect(dueDateFor("2028-02", 31)).toBe("2028-02-29");
    expect(dueDateFor("2026-04", 31)).toBe("2026-04-30");
    expect(dueDateFor("2026-11", 5)).toBe("2026-11-05");
  });
  it("primeiro vencimento: neste mês se o dia não passou, senão no próximo", () => {
    const today = new Date("2026-11-25T12:00:00Z");
    expect(firstDueDate(today, 28)).toEqual({ period: "2026-11", dueDate: "2026-11-28" });
    expect(firstDueDate(today, 25)).toEqual({ period: "2026-11", dueDate: "2026-11-25" });
    expect(firstDueDate(today, 10)).toEqual({ period: "2026-12", dueDate: "2026-12-10" });
    expect(firstDueDate(new Date("2026-12-20T00:00:00Z"), 5)).toEqual({ period: "2027-01", dueDate: "2027-01-05" });
  });
  it("atraso: só depois do dia do vencimento", () => {
    const today = new Date("2026-11-25T12:00:00Z");
    expect(isPastDue("2026-11-25", today)).toBe(false);
    expect(isPastDue("2026-11-24", today)).toBe(true);
    expect(monthKey(today)).toBe("2026-11"); expect(dateKey(today)).toBe("2026-11-25");
  });
});

describe("painel financeiro do mês", () => {
  const C = (o: Partial<FinCharge>): FinCharge => ({ amountCents: 20000, feeCents: 0, status: "pending", method: null, dueDate: "2026-11-10", paidAt: null, ...o });
  const charges: FinCharge[] = [
    C({ status: "paid", method: "pix", paidAt: "2026-11-05T10:00:00Z", feeCents: 518 }),
    C({ status: "paid", method: "card", paidAt: "2026-11-12T10:00:00Z", amountCents: 30000, feeCents: 1000 }),
    C({ status: "paid", method: "pix", paidAt: "2026-10-30T10:00:00Z", dueDate: "2026-10-30" }), // mês anterior: não conta
    C({ status: "refunded", paidAt: "2026-11-06T10:00:00Z" }),                                   // estornado: não conta
    C({ status: "pending", dueDate: "2026-11-28" }),
    C({ status: "overdue", dueDate: "2026-11-02" }),
    C({ status: "overdue", dueDate: "2026-09-02", amountCents: 10000 }),                         // atraso antigo: entra na inadimplência acumulada
    C({ status: "canceled", dueDate: "2026-11-15" }),
  ];
  const s = summarizeMonth(charges, [{ amountCents: 15000, date: "2026-11-03" }, { amountCents: 9999, date: "2026-10-03" }], [{ amountCents: 20000, active: true }, { amountCents: 30000, active: true }, { amountCents: 5000, active: false }], "2026-11");
  it("recebido, taxas, líquido e por método", () => {
    expect(s.receivedCents).toBe(50000); expect(s.feesCents).toBe(1518); expect(s.netReceivedCents).toBe(48482);
    expect(s.paidCount).toBe(2); expect(s.byMethod).toEqual({ pix: 20000, card: 30000 });
  });
  it("a receber, inadimplência e taxa de inadimplência do mês", () => {
    expect(s.pendingCents).toBe(20000); expect(s.pendingCount).toBe(1);
    expect(s.overdueCents).toBe(30000); expect(s.overdueCount).toBe(2);        // 20000 + 10000 (acumulada)
    expect(s.billedCents).toBe(20000 + 30000 + 20000 + 20000);                    // pagas + pendente + atrasada do mês (sem cancelada)
    expect(s.defaultRatePct).toBe(Math.round((20000 / 90000) * 1000) / 10);
  });
  it("despesas, resultado, ticket médio e receita recorrente", () => {
    expect(s.expensesCents).toBe(15000); expect(s.resultCents).toBe(50000 - 1518 - 15000);
    expect(s.ticketAvgCents).toBe(25000); expect(s.mrrCents).toBe(50000);
  });
  it("mês vazio não divide por zero", () => {
    const e = summarizeMonth([], [], [], "2026-11");
    expect(e).toMatchObject({ receivedCents: 0, defaultRatePct: null, ticketAvgCents: null, resultCents: 0 });
  });
});
