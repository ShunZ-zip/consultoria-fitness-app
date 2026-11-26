"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Icon from "../../components/Icon";
import Shell from "../../components/Shell";
import { api, useMe } from "../../lib/client";

interface Student { id: string; name: string; email: string }
interface Version { id: string; name: string; status: "draft" | "published"; studentId: string; studentName: string; logCount: number; version: number; isCurrent: boolean }
interface Invite { id: string; studentName: string; expiresAt: string }
interface Template { id: string; name: string; exerciseCount: number; setCount: number }
interface Attn { studentId: string; name: string; priority: number; overdue: boolean; flags: { id: string; level: string; reason: string }[]; last: { createdAt: string } | null }
interface AuditEntry { id: string; action: string; detail: Record<string, any>; at: string; actorName: string }

const WEIGHTS = [0, 0.25, 0.5, 0.75, 1];
const auditText = (e: AuditEntry) => {
  if (e.action === "settings.indirect_weight") return `Peso das séries indiretas: ${e.detail.from} → ${e.detail.to}`;
  if (e.action === "version.publish") return `Publicou a versão ${e.detail.version} de um treino`;
  if (e.action === "student.permissions") return `Permissões de um aluno: ${Object.keys(e.detail.changed ?? {}).length} alteração(ões)`;
  if (e.action === "version.create") return `Criou a versão ${e.detail.version} (rascunho)${e.detail.suggestionId ? " a partir de uma sugestão" : ""}`;
  const plain: Record<string, string> = {
    "assessment.create": "Registrou ou enviou uma avaliação", "assessment.submit": "Um aluno respondeu a uma avaliação", "assessment.view": "Abriu uma avaliação de aluno",
    "billing.cycle": "Gerou as cobranças do mês", "charge.create": "Criou uma cobrança", "charge.cancel": "Cancelou uma cobrança", "charge.manual_paid": "Registrou um recebimento manual",
    "checkin.config": "Alterou a configuração de check-in", "contract.create": "Criou um contrato mensal", "contract.cancel": "Cancelou um contrato",
    "media.add": "Adicionou um vídeo próprio a um exercício", "media.preference": "Mudou a mídia mostrada aos alunos", "saas.plan": "Trocou o plano da plataforma",
    "suggestion.generate": "Analisou os registros de um aluno", "suggestion.approve": "Aprovou uma sugestão", "suggestion.reject": "Recusou uma sugestão",
    "task.create": "Criou uma tarefa", "task.delete": "Excluiu uma tarefa",
  };
  return plain[e.action] ?? e.action;
};

export default function Personal() {
  const { me, logout } = useMe("trainer");
  const [students, setStudents] = useState<Student[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [attn, setAttn] = useState<Attn[]>([]);
  const [weight, setWeight] = useState(0.5);
  const [name, setName] = useState("");
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const load = useCallback(async () => {
    const [s, v, i, t, a, st, ck] = await Promise.all([api("/students"), api("/versions"), api("/invites"), api("/templates"), api("/audit"), api("/settings"), api("/checkins")]);
    if (s.ok) setStudents(s.data);
    if (v.ok) setVersions(v.data);
    if (i.ok) setInvites(i.data);
    if (t.ok) setTemplates(t.data);
    if (a.ok) setAudit(a.data);
    if (st.ok) setWeight(st.data.indirectWeight);
    if (ck.ok) setAttn(ck.data);
  }, []);
  useEffect(() => { if (me) load(); }, [me, load]);

  async function invite(e: FormEvent) {
    e.preventDefault(); setError(""); setLink("");
    const r = await api("/invites", "POST", { studentName: name });
    if (!r.ok) return setError(r.data?.error ?? "Falha ao criar convite");
    setLink(`${window.location.origin}${r.data.path}`);
    setName(""); load();
  }

  async function saveWeight(value: number) {
    setError(""); setSaved("");
    const r = await api("/settings", "PUT", { indirectWeight: value });
    if (!r.ok) return setError(r.data?.error ?? "Falha ao salvar");
    setWeight(value); setSaved("Configuração salva e registrada na auditoria."); load();
  }

  return (
    <Shell me={me} logout={logout}>
      <h1>Seus alunos</h1>
      {attn.some((x) => x.priority > 0 || x.overdue) && (
        <div className="card" data-testid="attention">
          <b className="hf" style={{ fontSize: 12, letterSpacing: ".1em" }}>Check-ins que pedem atenção</b>
          {attn.filter((x) => x.priority > 0 || x.overdue).map((x) => (
            <div className="row between" key={x.studentId} style={{ padding: "6px 0", borderTop: "1px solid var(--line)", marginTop: 6 }}>
              <Link href={`/personal/alunos/${x.studentId}`}>{x.name}</Link>
              <span className="row">
                {x.flags.map((f) => <span key={f.id} className={`tag ${f.level === "alert" ? "pub" : ""}`}>{f.reason}</span>)}
                {x.priority === 0 && x.overdue && <span className="muted">{x.last ? "check-in atrasado" : "ainda não respondeu"}</span>}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <form onSubmit={invite}>
          <label htmlFor="sn">Convidar aluno (nome)</label>
          <div className="row">
            <input id="sn" style={{ flex: 1, minWidth: 180 }} required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Maria Souza" />
            <button className="btn">Gerar convite</button>
          </div>
        </form>
        {error && <p className="err">{error}</p>}
        {link && (
          <div style={{ marginTop: 12 }}>
            <p className="okmsg">Convite criado. Envie este link ao aluno (válido por 7 dias; ele só aparece agora):</p>
            <div className="link" data-testid="invite-link">{link}</div>
            <button className="btn ghost small" style={{ marginTop: 8 }} onClick={() => navigator.clipboard?.writeText(link)}>Copiar link</button>
          </div>
        )}
        {invites.length > 0 && (
          <p className="muted" style={{ marginTop: 12 }}>
            Convites pendentes: {invites.map((i) => i.studentName).join(", ")}
          </p>
        )}
      </div>

      <h2>Alunos ({students.length})</h2>
      {students.length === 0 && <p className="muted">Nenhum aluno ainda. Gere um convite acima.</p>}
      {students.map((s) => (
        <div className="card" key={s.id}>
          <div className="row between">
            <div><b>{s.name}</b><div className="muted">{s.email}</div></div>
            <span className="row">
              <Link className="btn ghost small" href={`/personal/alunos/${s.id}`}><Icon name="shield" />Permissões</Link>
              <Link className="btn small" href={`/personal/treinos/novo?aluno=${s.id}`}><Icon name="plus" />Novo treino</Link>
            </span>
          </div>
          {versions.filter((v) => v.studentId === s.id).map((v) => (
            <div className="row between" key={v.id} style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
              <span><Link href={`/personal/treinos/${v.id}`}>{v.name}</Link> <span className="muted">v{v.version}</span></span>
              <span className="row">
                <span className={`tag ${v.status === "published" && v.isCurrent ? "pub" : ""}`}>
                  {v.status === "draft" ? "Rascunho" : v.isCurrent ? "Publicado" : "Anterior"}
                </span>
                {v.status === "published" && <span className="muted">{v.logCount} registro(s)</span>}
              </span>
            </div>
          ))}
        </div>
      ))}

      <h2>Modelos ({templates.length})</h2>
      <div className="card">
        {templates.length === 0
          ? <p className="muted" style={{ margin: 0 }}>Nenhum modelo. Salve um treino como modelo para reaproveitar.</p>
          : templates.map((t) => (
            <div className="row between" key={t.id} style={{ padding: "4px 0" }}>
              <span>{t.name} <span className="muted">· {t.exerciseCount} exercício(s), {t.setCount} série(s)</span></span>
              <Link className="btn ghost small" href={`/personal/treinos/novo?modelo=${t.id}`}>Usar</Link>
            </div>
          ))}
      </div>

      <h2>Configuração de volume</h2>
      <div className="card">
        <label htmlFor="w">Peso das séries indiretas no volume ponderado</label>
        <div className="row">
          <select id="w" style={{ maxWidth: 160 }} value={weight} onChange={(e) => saveWeight(Number(e.target.value))}>
            {WEIGHTS.map((w) => <option key={w} value={w}>{String(w).replace(".", ",")}</option>)}
          </select>
          {saved && <span className="okmsg">{saved}</span>}
        </div>
        <p className="muted">Ponderado = diretas + indiretas × peso. Convenção de monitoramento proposta; valide o critério por exercício antes de adotar.</p>
        {audit.length > 0 && (
          <>
            <label style={{ marginTop: 14 }}>Últimas alterações (auditoria)</label>
            <table>
              <thead><tr><th scope="col">Alteração</th><th scope="col">Quem</th><th scope="col">Quando</th></tr></thead>
              <tbody>
                {audit.slice(0, 8).map((e) => (
                  <tr key={e.id}><td>{auditText(e)}</td><td className="muted">{e.actorName}</td><td className="num muted">{new Date(e.at).toLocaleString("pt-BR")}</td></tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </Shell>
  );
}
