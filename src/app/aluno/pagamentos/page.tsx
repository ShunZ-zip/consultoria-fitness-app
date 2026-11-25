"use client";
import { useCallback, useEffect, useState } from "react";
import Shell from "../../../components/Shell";
import { brl } from "../../../lib/billing";
import { api, useMe } from "../../../lib/client";

interface Charge { id: string; description: string; amountCents: number; dueDate: string; status: string; method: string | null; paidAt: string | null; payable: boolean }
interface Contract { id: string; description: string; amountCents: number; dueDay: number; active: boolean }
const STATUS: Record<string, string> = { pending: "Pendente", paid: "Paga", overdue: "Em atraso", failed: "Falhou", canceled: "Cancelada", refunded: "Estornada" };
const METHOD: Record<string, string> = { pix: "Pix", boleto: "Boleto", card: "Cartão", cash: "Dinheiro" };
const dt = (d: string) => d.split("-").reverse().join("/");

export default function Pagamentos() {
  const { me, logout } = useMe("student");
  const [charges, setCharges] = useState<Charge[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [simulated, setSimulated] = useState(false);
  const [msg, setMsg] = useState(""); const [error, setError] = useState("");

  const load = useCallback(async () => {
    const r = await api("/me/billing");
    if (r.ok) { setCharges(r.data.charges); setContracts(r.data.contracts); setSimulated(r.data.simulated); }
  }, []);
  useEffect(() => { if (me) load(); }, [me, load]);

  async function pay(id: string) {
    setError(""); setMsg("");
    const r = await api(`/me/charges/${id}/simulate`, "POST", { outcome: "paid", method: "pix" });
    if (!r.ok) return setError("Não foi possível simular o pagamento.");
    setMsg("Pagamento simulado confirmado. Nenhum valor real foi cobrado."); load();
  }

  return (
    <Shell me={me} logout={logout}>
      <h1>Pagamentos</h1>
      <p className="muted">Aqui você acompanha a sua contratação e as cobranças do seu personal. {simulated && <><span className="tag">Ambiente simulado</span> Nenhum valor real é cobrado.</>}</p>
      {error && <p className="err" role="alert">{error}</p>}{msg && <p className="okmsg" role="status">{msg}</p>}

      <h2>Contratação</h2>
      {contracts.length === 0 && <p className="muted">Nenhum contrato recorrente.</p>}
      {contracts.map((c) => (
        <div className="card row between" key={c.id}>
          <span><b>{c.description}</b><div className="muted">Vence todo dia {c.dueDay}</div></span>
          <span className="row"><b>{brl(c.amountCents)}/mês</b><span className={`tag ${c.active ? "pub" : ""}`}>{c.active ? "Ativo" : "Encerrado"}</span></span>
        </div>
      ))}

      <h2>Cobranças</h2>
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Descrição</th><th>Vencimento</th><th className="num">Valor</th><th>Status</th><th>Ação</th></tr></thead>
          <tbody>
            {charges.map((c) => (
              <tr key={c.id}>
                <td>{c.description}</td><td>{dt(c.dueDate)}</td><td className="num">{brl(c.amountCents)}</td>
                <td><span className={`tag ${c.status === "paid" ? "pub" : ""}`}>{STATUS[c.status]}</span>{c.method && <span className="muted"> {METHOD[c.method] ?? c.method}</span>}</td>
                <td>{["pending", "overdue", "failed"].includes(c.status) && (c.payable && simulated
                  ? <button className="btn small" onClick={() => pay(c.id)}>Simular pagamento</button>
                  : <span className="muted">Pagamento online indisponível: provedor ainda não configurado. Combine com o seu personal.</span>)}</td>
              </tr>
            ))}
            {charges.length === 0 && <tr><td colSpan={5} className="muted">Nenhuma cobrança.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
