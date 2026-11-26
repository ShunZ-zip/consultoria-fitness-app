"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Icon from "../../../components/Icon";
import FinanceChart from "../../../components/FinanceChart";
import Shell from "../../../components/Shell";
import { brl, monthKey } from "../../../lib/billing";
import { api, useMe } from "../../../lib/client";

interface Dash { month: string; receivedCents: number; feesCents: number; netReceivedCents: number; paidCount: number; pendingCents: number; pendingCount: number; overdueCents: number; overdueCount: number; defaultRatePct: number | null; expensesCents: number; resultCents: number; ticketAvgCents: number | null; mrrCents: number; byMethod: Record<string, number>; activeContracts: number; students: number; notIncluded: string }
interface Charge { id: string; studentId: string; studentName: string; description: string; amountCents: number; dueDate: string; status: string; method: string | null; source: string }
interface Expense { id: string; description: string; category: string; amountCents: number; date: string }
interface Ev { id: string; type: string; result: string; reason: string | null; scope: string; from: string | null; to: string | null; receivedAt: string }
interface Student { id: string; name: string }

export const STATUS_LABEL: Record<string, string> = { pending: "Pendente", paid: "Paga", overdue: "Em atraso", failed: "Falhou", canceled: "Cancelada", refunded: "Estornada" };
const EVENT_LABEL: Record<string, string> = { "payment.pending": "Pagamento pendente", "payment.confirmed": "Pagamento confirmado", "payment.failed": "Pagamento falhou", "payment.canceled": "Pagamento cancelado", "payment.refunded": "Pagamento estornado", "system.overdue": "Marcada em atraso (sistema)" };
const RESULT_LABEL: Record<string, string> = { applied: "Aplicado", duplicate: "Repetido (sem efeito)", ignored: "Ignorado", rejected: "Rejeitado" };
const METHOD_LABEL: Record<string, string> = { pix: "Pix", boleto: "Boleto", card: "Cartão", cash: "Dinheiro", outro: "Outro" };
const toCents = (v: string) => Math.round(Number(v.replace(/\./g, "").replace(",", ".")) * 100);
const dt = (d: string) => d.split("-").reverse().join("/");

export default function Financeiro() {
  const { me, logout } = useMe("trainer");
  const [month, setMonth] = useState(monthKey(new Date()));
  const [dash, setDash] = useState<Dash | null>(null);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [events, setEvents] = useState<Ev[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [filter, setFilter] = useState("");
  const [msg, setMsg] = useState(""); const [error, setError] = useState("");
  const [paid, setPaid] = useState<Record<string, string>>({});
  const [ct, setCt] = useState({ studentId: "", description: "Acompanhamento mensal", amount: "", dueDay: "10" });
  const [ch, setCh] = useState({ studentId: "", description: "", amount: "", dueDate: "" });
  const [ex, setEx] = useState({ description: "", category: "", amount: "", date: "" });

  const load = useCallback(async () => {
    const [d, c, e, v, s] = await Promise.all([api(`/billing/dashboard?month=${month}`), api(`/billing/charges${filter ? `?status=${filter}` : ""}`), api(`/expenses?month=${month}`), api("/billing/events"), api("/students")]);
    if (d.ok) setDash(d.data); if (c.ok) setCharges(c.data); if (e.ok) setExpenses(e.data); if (v.ok) setEvents(v.data); if (s.ok) setStudents(s.data);
  }, [month, filter]);
  useEffect(() => { if (me) load(); }, [me, load]);

  async function run(fn: () => Promise<{ ok: boolean; data: any }>, ok: string) {
    setError(""); setMsg("");
    const r = await fn();
    if (!r.ok) return setError(r.data?.issues?.[0]?.message ?? r.data?.error ?? "Não foi possível concluir. Confira os campos.");
    setMsg(ok); load();
  }
  const submit = (e: FormEvent, fn: () => Promise<{ ok: boolean; data: any }>, ok: string) => { e.preventDefault(); void run(fn, ok); };

  const card = (label: string, value: string, hint?: string) => (
    <div className="card" style={{ margin: 0 }}><div className="muted">{label}</div><div style={{ fontSize: 24, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{value}</div>{hint && <div className="muted">{hint}</div>}</div>
  );
  const studentSelect = (value: string, on: (v: string) => void, id: string) => (
    <select id={id} required value={value} onChange={(e) => on(e.target.value)}>
      <option value="">Aluno…</option>{students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  );

  return (
    <Shell me={me} logout={logout}>
      <div className="row between">
        <h1>Financeiro</h1>
        <input type="month" aria-label="Mês" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} style={{ width: "auto" }} />
      </div>
      <p className="muted"><span className="tag">Ambiente simulado</span> Nenhum valor real é cobrado: o provedor de pagamentos ainda não foi escolhido. <Link href="/personal/assinatura">Assinatura da plataforma</Link></p>
      {error && <p className="err flash" role="alert">{error}</p>}{msg && <p className="okmsg flash" role="status">{msg}</p>}

      {dash && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }} data-testid="finance-dashboard">
            {card("Recebido no mês", brl(dash.receivedCents), `${dash.paidCount} pagamento(s)`)}
            {card("Taxas do intermediador", brl(dash.feesCents), "repassadas, sem comissão da plataforma")}
            {card("Líquido recebido", brl(dash.netReceivedCents))}
            {card("A receber no mês", brl(dash.pendingCents), `${dash.pendingCount} cobrança(s)`)}
            {card("Inadimplência", brl(dash.overdueCents), `${dash.overdueCount} em atraso (acumulado)${dash.defaultRatePct != null ? ` · ${String(dash.defaultRatePct).replace(".", ",")}% do faturado deste mês` : ""}`)}
            {card("Despesas", brl(dash.expensesCents))}
            {card("Resultado", brl(dash.resultCents), "líquido recebido − despesas")}
            {card("Ticket médio", dash.ticketAvgCents == null ? "—" : brl(dash.ticketAvgCents))}
            {card("Receita recorrente", brl(dash.mrrCents), `${dash.activeContracts} contrato(s) ativo(s)`)}
          </div>
          {Object.keys(dash.byMethod).length > 0 && <p className="muted">Por método: {Object.entries(dash.byMethod).map(([m, v]) => `${METHOD_LABEL[m] ?? m} ${brl(v)}`).join(" · ")}</p>}
          <p className="muted">{dash.notIncluded}</p>
          <FinanceChart endMonth={month} refreshKey={charges.length + expenses.length} />
        </>
      )}

      <h2>Cobranças</h2>
      <div className="row" style={{ marginBottom: 10 }}>
        <select aria-label="Filtrar por status" style={{ maxWidth: 200 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Todos os status</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="btn small" onClick={() => run(() => api("/billing/cycle", "POST"), "Cobranças do mês geradas (uma por contrato) e atrasos atualizados.")}><Icon name="refresh" />Gerar cobranças do mês</button>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Aluno</th><th>Descrição</th><th>Vencimento</th><th className="num">Valor</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>
            {charges.map((c) => {
              const open = ["pending", "overdue", "failed"].includes(c.status);
              return (
                <tr key={c.id}>
                  <td><Link href={`/personal/alunos/${c.studentId}`}>{c.studentName}</Link></td><td>{c.description}</td><td>{dt(c.dueDate)}</td>
                  <td className="num">{brl(c.amountCents)}</td>
                  <td><span className={`tag ${c.status === "paid" ? "pub" : ""}`}>{STATUS_LABEL[c.status]}</span>{c.method && <span className="muted"> {METHOD_LABEL[c.method]}{c.source === "manual" ? " (manual)" : ""}</span>}</td>
                  <td>{open && (
                    <span className="row">
                      <select aria-label="Método do recebimento" style={{ width: 110, padding: 6 }} value={paid[c.id] ?? "pix"} onChange={(e) => setPaid({ ...paid, [c.id]: e.target.value })}>
                        {["pix", "boleto", "card", "cash"].map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
                      </select>
                      <button className="btn small" onClick={() => run(() => api(`/charges/${c.id}/mark-paid`, "POST", { method: paid[c.id] ?? "pix" }), "Recebimento registrado como manual.")}>Marcar paga</button>
                      <button className="btn ghost small" onClick={() => run(() => api(`/charges/${c.id}/cancel`, "POST"), "Cobrança cancelada.")}>Cancelar</button>
                    </span>
                  )}</td>
                </tr>
              );
            })}
            {charges.length === 0 && <tr><td colSpan={6} className="muted">Nenhuma cobrança. Crie um contrato mensal ou uma cobrança avulsa abaixo.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2>Novo contrato mensal</h2>
      <form className="card" onSubmit={(e) => submit(e, () => api(`/students/${ct.studentId}/contracts`, "POST", { description: ct.description, amountCents: toCents(ct.amount), dueDay: Number(ct.dueDay) }), "Contrato criado e primeira cobrança gerada.")}>
        <div className="row">
          <div style={{ flex: 1, minWidth: 180 }}><label htmlFor="ct-s">Aluno</label>{studentSelect(ct.studentId, (v) => setCt({ ...ct, studentId: v }), "ct-s")}</div>
          <div style={{ flex: 2, minWidth: 200 }}><label htmlFor="ct-d">Descrição</label><input id="ct-d" required value={ct.description} onChange={(e) => setCt({ ...ct, description: e.target.value })} /></div>
          <div style={{ width: 130 }}><label htmlFor="ct-a">Valor (R$)</label><input id="ct-a" required inputMode="decimal" placeholder="200,00" value={ct.amount} onChange={(e) => setCt({ ...ct, amount: e.target.value })} /></div>
          <div style={{ width: 120 }}><label htmlFor="ct-v">Vence no dia</label><input id="ct-v" required inputMode="numeric" value={ct.dueDay} onChange={(e) => setCt({ ...ct, dueDay: e.target.value })} /></div>
          <button className="btn" style={{ alignSelf: "flex-end" }}>Criar contrato</button>
        </div>
      </form>

      <h2>Cobrança avulsa</h2>
      <form className="card" onSubmit={(e) => submit(e, () => api(`/students/${ch.studentId}/charges`, "POST", { description: ch.description, amountCents: toCents(ch.amount), dueDate: ch.dueDate }), "Cobrança criada.")}>
        <div className="row">
          <div style={{ flex: 1, minWidth: 180 }}><label htmlFor="ch-s">Aluno</label>{studentSelect(ch.studentId, (v) => setCh({ ...ch, studentId: v }), "ch-s")}</div>
          <div style={{ flex: 2, minWidth: 200 }}><label htmlFor="ch-d">Descrição</label><input id="ch-d" required value={ch.description} onChange={(e) => setCh({ ...ch, description: e.target.value })} /></div>
          <div style={{ width: 130 }}><label htmlFor="ch-a">Valor (R$)</label><input id="ch-a" required inputMode="decimal" value={ch.amount} onChange={(e) => setCh({ ...ch, amount: e.target.value })} /></div>
          <div style={{ width: 160 }}><label htmlFor="ch-v">Vencimento</label><input id="ch-v" type="date" required value={ch.dueDate} onChange={(e) => setCh({ ...ch, dueDate: e.target.value })} /></div>
          <button className="btn" style={{ alignSelf: "flex-end" }}>Criar cobrança</button>
        </div>
      </form>

      <h2>Despesas do mês</h2>
      <form className="card" onSubmit={(e) => submit(e, () => api("/expenses", "POST", { description: ex.description, category: ex.category, amountCents: toCents(ex.amount), date: ex.date }), "Despesa registrada.")}>
        <div className="row">
          <div style={{ flex: 2, minWidth: 200 }}><label htmlFor="ex-d">Descrição</label><input id="ex-d" required value={ex.description} onChange={(e) => setEx({ ...ex, description: e.target.value })} /></div>
          <div style={{ flex: 1, minWidth: 140 }}><label htmlFor="ex-c">Categoria</label><input id="ex-c" required value={ex.category} onChange={(e) => setEx({ ...ex, category: e.target.value })} /></div>
          <div style={{ width: 130 }}><label htmlFor="ex-a">Valor (R$)</label><input id="ex-a" required inputMode="decimal" value={ex.amount} onChange={(e) => setEx({ ...ex, amount: e.target.value })} /></div>
          <div style={{ width: 160 }}><label htmlFor="ex-t">Data</label><input id="ex-t" type="date" required value={ex.date} onChange={(e) => setEx({ ...ex, date: e.target.value })} /></div>
          <button className="btn" style={{ alignSelf: "flex-end" }}>Registrar</button>
        </div>
        {expenses.length > 0 && <table style={{ marginTop: 12 }}><thead><tr><th scope="col">Despesa</th><th scope="col">Categoria</th><th scope="col">Data</th><th scope="col">Valor</th></tr></thead><tbody>{expenses.map((x) => <tr key={x.id}><td>{x.description}</td><td className="muted">{x.category}</td><td>{dt(x.date)}</td><td className="num">{brl(x.amountCents)}</td></tr>)}</tbody></table>}
      </form>

      <details style={{ marginTop: 18 }}>
        <summary style={{ cursor: "pointer" }}>Conciliação: eventos do intermediador ({events.length})</summary>
        <div className="card" style={{ marginTop: 8, padding: 0 }}>
          <table>
            <thead><tr><th>Quando</th><th>Evento</th><th>Resultado</th><th>Estado</th></tr></thead>
            <tbody>
              {events.map((v) => <tr key={v.id}><td>{new Date(v.receivedAt).toLocaleString("pt-BR")}</td><td>{EVENT_LABEL[v.type] ?? v.type}</td><td>{RESULT_LABEL[v.result] ?? v.result}{v.reason ? ` · ${v.reason}` : ""}</td><td>{v.from && v.to ? `${STATUS_LABEL[v.from] ?? v.from} → ${STATUS_LABEL[v.to] ?? v.to}` : "—"}</td></tr>)}
              {events.length === 0 && <tr><td colSpan={4} className="muted">Nenhum evento recebido ainda.</td></tr>}
            </tbody>
          </table>
        </div>
      </details>
    </Shell>
  );
}
