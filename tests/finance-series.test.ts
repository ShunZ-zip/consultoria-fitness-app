import { beforeAll, describe, expect, it } from "vitest";
import { monthsEnding } from "../src/lib/finance";
import { monthKey } from "../src/lib/billing";
import * as h5 from "../src/server/handlers5";
import { call, inviteStudent, registerTrainer } from "./helpers";

describe("monthsEnding", () => {
  it("devolve N meses do mais antigo ao mais recente, atravessando o ano", () => {
    expect(monthsEnding("2026-02", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(monthsEnding("2026-11", 1)).toEqual(["2026-11"]);
  });
});

describe("série mensal do painel financeiro", () => {
  let alfa: string, beta: string, a1: { cookie: string; id: string };
  const month = monthKey(new Date());
  const series = (cookie?: string, query = "") => call(h5.financeSeries, { cookie, query });
  beforeAll(async () => {
    alfa = await registerTrainer("serieA"); beta = await registerTrainer("serieB");
    a1 = await inviteStudent(alfa, "serie1");
  });

  it("6 meses por padrão, terminando no mês pedido, com recebido, despesas e resultado coerentes", async () => {
    const ch = await call(h5.createCharge, { cookie: alfa, params: { id: a1.id }, body: { description: "Mensal", amountCents: 20000, dueDate: "2099-01-10" } });
    await call(h5.markChargePaid, { cookie: alfa, params: { id: ch.body.id }, body: { method: "pix" } });
    await call(h5.createExpense, { cookie: alfa, body: { description: "Aluguel", category: "Espaço", amountCents: 5000, date: `${month}-02` } });
    const r = await series(alfa);
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(6);
    expect(r.body.at(-1)).toMatchObject({ month, receivedCents: 20000, expensesCents: 5000, resultCents: 15000 });
    expect(r.body[0].receivedCents).toBe(0);
    expect((await series(alfa, `end=2026-02&months=3`)).body.map((p: any) => p.month)).toEqual(["2025-12", "2026-01", "2026-02"]);
  });
  it("valida parâmetros e limita o tamanho", async () => {
    expect((await series(alfa, "end=2026-13x")).status).toBe(400);
    expect((await series(alfa, "months=999")).body).toHaveLength(24);
    expect((await series(alfa, "months=0")).body).toHaveLength(6); // inválido volta ao padrão
  });
  it("isolamento: outra consultoria não vê os valores; aluno 403; sem sessão 401", async () => {
    expect((await series(beta)).body.every((p: any) => p.receivedCents === 0 && p.expensesCents === 0)).toBe(true);
    expect((await series(a1.cookie)).status).toBe(403);
    expect((await series()).status).toBe(401);
  });
});
