"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Shell from "../../../components/Shell";
import Skeleton from "../../../components/Skeleton";
import { formatDuration, matchesQuery, type FeedbackItem } from "../../../lib/feedback";
import { api, useMe } from "../../../lib/client";

type Tab = "open" | "resolved";
const PAGE = 20;
const day = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");
const clock = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export default function Feedbacks() {
  const { me, logout } = useMe("trainer");
  const [tab, setTab] = useState<Tab>("open");
  const [items, setItems] = useState<FeedbackItem[] | null>(null);
  const [counts, setCounts] = useState({ open: 0, resolved: 0 });
  const [q, setQ] = useState(""); const [shown, setShown] = useState(PAGE);
  const [info, setInfo] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);

  const reqId = useRef(0);   // só a resposta do pedido mais recente vale (evita lista antiga sobrescrever a nova)
  const load = useCallback(async (t: Tab) => {
    const mine = ++reqId.current;
    const r = await api(`/feedbacks?status=${t}`);
    if (mine !== reqId.current) return;
    window.dispatchEvent(new Event("cf-feedbacks-changed"));   // atualiza o selo da navegação
    if (!r.ok) { setError("Não foi possível carregar os feedbacks."); setItems([]); return; }
    setItems(r.data.items); setCounts(r.data.counts);
  }, []);
  useEffect(() => { if (me) { setItems(null); setShown(PAGE); load(tab); } }, [me, tab, load]);

  const visible = useMemo(() => (items ?? []).filter((i) => matchesQuery(i, q)), [items, q]);

  async function toggle(it: FeedbackItem) {
    setError(""); setInfo(""); setBusy(true);
    const r = await api(`/feedbacks/${it.id}/resolve`, "POST", { resolved: !it.resolved });
    setBusy(false);
    if (!r.ok) return setError("Não foi possível atualizar este feedback.");
    setInfo(it.resolved ? "Feedback reaberto." : "Feedback resolvido. Ele está na aba Resolvidos.");
    load(tab);
  }
  async function toggleAll() {
    if (!visible.length) return;
    setError(""); setInfo(""); setBusy(true);
    const resolved = tab === "open";
    const r = await api("/feedbacks/resolve", "POST", { ids: visible.slice(0, 200).map((i) => i.id), resolved });
    setBusy(false);
    if (!r.ok) return setError("Não foi possível atualizar os feedbacks.");
    const n = r.data.changed as number;
    setInfo(n === 0 ? "Nada a alterar." : `${n} ${n === 1 ? "feedback" : "feedbacks"} ${resolved ? (n === 1 ? "resolvido" : "resolvidos") : (n === 1 ? "reaberto" : "reabertos")}.`);
    load(tab);
  }

  return (
    <Shell me={me} logout={logout}>
      <p><Link href="/personal">← Alunos</Link></p>
      <h1>Feedbacks</h1>
      <p className="muted">Sessões que os alunos concluíram, com o esforço e o comentário de cada uma. Resolver tira da fila; esse estado é só seu e o aluno não vê.</p>
      {error && <p className="err" role="alert">{error}</p>}{info && <p className="okmsg" role="status">{info}</p>}

      <div role="tablist" aria-label="Estado dos feedbacks" className="pk-tabs">
        {([["open", "Abertos"], ["resolved", "Resolvidos"]] as [Tab, string][]).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`pk-tab${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>
            {l} <span className="pk-n">{counts[k]}</span>
          </button>
        ))}
      </div>
      <div className="row" style={{ margin: "8px 0 12px" }}>
        <input style={{ flex: 1, minWidth: 200 }} type="search" placeholder="Pesquisar por aluno ou treino" aria-label="Pesquisar por aluno ou treino" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} />
        <button type="button" className="btn small" disabled={busy || visible.length === 0} onClick={toggleAll}>
          {tab === "open" ? `Resolver todos (${visible.length})` : `Reabrir todos (${visible.length})`}
        </button>
      </div>

      {items === null ? <Skeleton /> : visible.length === 0 ? (
        <p className="muted">{q ? "Nenhum feedback encontrado para essa busca." : tab === "open" ? "Tudo em dia: nenhum feedback aberto." : "Nenhum feedback resolvido ainda."}</p>
      ) : (
        <>
          <ul className="fb-list">
            {visible.slice(0, shown).map((it) => (
              <li key={it.id} className="card fb-card">
                <div className="row between">
                  <b className="fb-name">{it.studentName}</b>
                  <span className="tag">Treino</span>
                </div>
                <div className="muted">{it.workoutName} · {day(it.finishedAt)} às {clock(it.finishedAt)}</div>
                <p className="fb-line"><b>Esforço:</b> {it.effortLabel ?? <span className="muted">não informado</span>}</p>
                <p className="fb-line"><b>Comentário:</b> {it.note ? it.note : <span className="muted">O aluno não deixou um comentário</span>}</p>
                <dl className="fb-box">
                  <div><dt>Início</dt><dd>{clock(it.startedAt)}</dd></div>
                  <div><dt>Fim</dt><dd>{clock(it.finishedAt)}</dd></div>
                  <div><dt>Tempo de treino</dt><dd>{formatDuration(it.durationMin)}</dd></div>
                  <div><dt>Séries registradas</dt><dd>{it.setsDone} de {it.setsPrescribed}{it.completionPct != null ? ` (${it.completionPct}%)` : ""}</dd></div>
                  {it.avgRir != null && <div><dt>RIR médio</dt><dd>{String(it.avgRir).replace(".", ",")}</dd></div>}
                </dl>
                <div className="row" style={{ marginTop: 10 }}>
                  <Link className="btn small" href={`/personal/chat/${it.studentId}`}>Responder</Link>
                  <Link className="btn ghost small" href={`/personal/treinos/${it.versionId}`}>Ver treino</Link>
                  <button type="button" className="btn ghost small" disabled={busy} onClick={() => toggle(it)}>{it.resolved ? "Reabrir" : "Resolver"}</button>
                </div>
              </li>
            ))}
          </ul>
          {visible.length > shown && <button type="button" className="btn ghost" onClick={() => setShown((n) => n + PAGE)}>Mostrar mais ({visible.length - shown})</button>}
        </>
      )}
    </Shell>
  );
}
