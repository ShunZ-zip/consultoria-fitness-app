"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Shell from "../../../components/Shell";
import { brl, type Plan } from "../../../lib/billing";
import { api, useMe } from "../../../lib/client";

interface Saas {
  plans: Plan[]; plansAreProposal: boolean; trialDays: number; simulated: boolean; note: string;
  subscription: { planId: string; status: string; trialUsed: boolean; trialEndsAt: string | null; currentPeriodEnd: string | null };
  usage: { students: number; limit: number | null; overLimit: boolean };
  invoices: { id: string; planId: string; amountCents: number; status: string; periodStart: string; periodEnd: string; paidAt: string | null; payable: boolean }[];
}
const STATUS: Record<string, string> = { trialing: "Em teste", active: "Ativa", pending: "Aguardando pagamento", past_due: "Em atraso", canceled: "Cancelada" };
const INV: Record<string, string> = { pending: "Pendente", paid: "Paga", overdue: "Em atraso", failed: "Falhou", canceled: "Cancelada", refunded: "Estornada" };
const d = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");

export default function Assinatura() {
  const { me, logout } = useMe("trainer");
  const [s, setS] = useState<Saas | null>(null);
  const [msg, setMsg] = useState(""); const [error, setError] = useState("");
  const load = useCallback(async () => { const r = await api("/saas"); if (r.ok) setS(r.data); }, []);
  useEffect(() => { if (me) load(); }, [me, load]);

  async function change(planId: string) {
    setError(""); setMsg("");
    const r = await api("/saas/plan", "POST", { planId });
    if (!r.ok) return setError(r.data?.error ?? "Não foi possível trocar o plano.");
    setMsg("Plano atualizado."); load();
  }
  async function pay(id: string, outcome: "paid" | "failed") {
    setError(""); setMsg("");
    const r = await api(`/saas/invoices/${id}/simulate`, "POST", { outcome });
    if (!r.ok) return setError("Simulação indisponível.");
    setMsg(outcome === "paid" ? "Pagamento simulado confirmado." : "Falha de pagamento simulada."); load();
  }

  return (
    <Shell me={me} logout={logout}>
      <p><Link href="/personal/financeiro">← Financeiro</Link></p>
      <h1>Assinatura</h1>
      {s && (
        <>
          <p className="muted"><span className="tag">Planos: proposta</span> {s.note}</p>
          {error && <p className="err flash" role="alert">{error}</p>}{msg && <p className="okmsg flash" role="status">{msg}</p>}
          <div className="card" data-testid="subscription">
            <div className="row between">
              <span><b>Plano atual: {s.plans.find((p) => p.id === s.subscription.planId)?.name}</b> <span className={`tag ${s.subscription.status === "active" || s.subscription.status === "trialing" ? "pub" : ""}`}>{STATUS[s.subscription.status]}</span></span>
              <span className="muted">
                {s.subscription.status === "trialing" && `Teste até ${d(s.subscription.trialEndsAt)}`}
                {s.subscription.status === "active" && s.subscription.currentPeriodEnd && `Período até ${d(s.subscription.currentPeriodEnd)}`}
              </span>
            </div>
            <p className="muted" style={{ marginBottom: 0 }}>Alunos: <b style={{ color: "var(--g)" }}>{s.usage.students}</b>{s.usage.limit != null ? ` de ${s.usage.limit} no plano` : " (sem limite no plano)"}{s.usage.overLimit ? " · acima do limite proposto do plano (o uso ainda não é bloqueado)" : ""}</p>
          </div>

          <h2>Planos</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            {s.plans.map((p) => {
              const cur = p.id === s.subscription.planId;
              return (
                <div className="card" key={p.id} style={{ margin: 0, borderColor: cur ? "var(--v)" : undefined }}>
                  <b style={{ fontSize: 18 }}>{p.name}</b>
                  <div style={{ fontSize: 26, fontWeight: 800, margin: "6px 0" }}>{p.monthlyCents === 0 ? "R$ 0" : brl(p.monthlyCents)}<span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>/mês</span></div>
                  <p className="muted" style={{ margin: "0 0 10px" }}>{p.studentLimit == null ? "Alunos ilimitados" : `Até ${p.studentLimit} aluno(s)`}{p.brand ? " · marca própria" : ""}</p>
                  <button className="btn small" disabled={cur} onClick={() => change(p.id)}>{cur ? "Plano atual" : p.monthlyCents === 0 ? "Voltar ao gratuito" : s.subscription.trialUsed ? "Assinar" : `Testar ${s.trialDays} dias`}</button>
                </div>
              );
            })}
          </div>

          <h2>Faturas da plataforma</h2>
          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead><tr><th>Plano</th><th>Período</th><th className="num">Valor</th><th>Status</th><th>Ações</th></tr></thead>
              <tbody>
                {s.invoices.map((i) => (
                  <tr key={i.id}>
                    <td>{s.plans.find((p) => p.id === i.planId)?.name}</td><td>{d(i.periodStart)} a {d(i.periodEnd)}</td><td className="num">{brl(i.amountCents)}</td>
                    <td><span className={`tag ${i.status === "paid" ? "pub" : ""}`}>{INV[i.status]}</span></td>
                    <td>{s.simulated && i.payable && ["pending", "failed", "overdue"].includes(i.status)
                      ? <span className="row"><button className="btn small" onClick={() => pay(i.id, "paid")}>Simular pagamento</button><button className="btn ghost small" onClick={() => pay(i.id, "failed")}>Simular falha</button></span>
                      : i.payable ? "" : <span className="muted">Pagamento online indisponível: provedor ainda não configurado</span>}</td>
                  </tr>
                ))}
                {s.invoices.length === 0 && <tr><td colSpan={5} className="muted">Nenhuma fatura até agora. O plano gratuito e o período de teste não geram cobrança.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="muted">A assinatura da plataforma e a cobrança dos seus alunos são registros separados. {s.simulated ? "Ambiente simulado: nenhum valor real é cobrado." : ""}</p>
        </>
      )}
    </Shell>
  );
}
