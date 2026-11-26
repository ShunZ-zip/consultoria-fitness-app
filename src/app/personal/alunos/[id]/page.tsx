"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Shell from "../../../../components/Shell";
import Icon from "../../../../components/Icon";
import StudentFollowUp from "../../../../components/StudentFollowUp";
import StudentSuggestions from "../../../../components/StudentSuggestions";
import EvolutionPanel, { type EvolutionData } from "../../../../components/EvolutionPanel";
import { api, useMe } from "../../../../lib/client";
import { PERMISSIONS, type Permissions } from "../../../../lib/permissions";

interface Student { id: string; name: string; email: string }
interface Version { id: string; name: string; status: "draft" | "published"; studentId: string; version: number; isCurrent: boolean; logCount: number }

export default function PerfilAluno() {
  const { id } = useParams<{ id: string }>();
  const { me, logout } = useMe("trainer");
  const [student, setStudent] = useState<Student | null | undefined>(undefined);
  const [perms, setPerms] = useState<Permissions | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [evo, setEvo] = useState<EvolutionData | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const load = useCallback(async () => {
    const [s, p, v, e] = await Promise.all([api("/students"), api(`/students/${id}/permissions`), api("/versions"), api(`/students/${id}/evolution`)]);
    setStudent(s.ok ? (s.data as Student[]).find((x) => x.id === id) ?? null : null);
    if (p.ok) setPerms(p.data);
    if (e.ok) setEvo(e.data);
    if (v.ok) setVersions((v.data as Version[]).filter((x) => x.studentId === id));
  }, [id]);
  useEffect(() => { if (me) load(); }, [me, load]);

  async function toggle(key: keyof Permissions) {
    if (!perms) return;
    setError(""); setSaved("");
    const next = { ...perms, [key]: !perms[key] };
    setPerms(next); // otimista
    const r = await api(`/students/${id}/permissions`, "PUT", next);
    if (!r.ok) { setPerms(perms); return setError(r.data?.error ?? "Falha ao salvar"); }
    setSaved("Salvo e registrado na auditoria.");
  }

  const enabled = perms ? Object.values(perms).filter(Boolean).length : 0;
  return (
    <Shell me={me} logout={logout}>
      <p><Link href="/personal">← Alunos</Link></p>
      {student === null && <p className="err">Aluno não encontrado.</p>}
      {student && perms && (
        <>
          <div className="row between">
            <h1>{student.name}</h1>
            <span className="row">
              <Link className="btn ghost small" href={`/personal/chat/${student.id}`}><Icon name="chat" />Conversa</Link>
              <Link className="btn ghost small" href="/personal/financeiro"><Icon name="card" />Cobranças</Link>
              <Link className="btn small" href={`/personal/treinos/novo?aluno=${student.id}`}>Novo treino</Link>
            </span>
          </div>
          <p className="muted">{student.email}</p>

          <h2>Evolução</h2>
          {evo && <EvolutionPanel data={evo} />}

          <StudentFollowUp studentId={student.id} />

          <StudentSuggestions studentId={student.id} />

          <h2>Permissões do aluno</h2>
          <div className="card" data-testid="permissions">
            <p className="muted" style={{ marginTop: 0 }}>Configuração individual. Independentemente das permissões, o aluno sempre poderá registrar o que efetivamente realizou; a prescrição original permanece preservada para comparação.</p>
            {PERMISSIONS.map((p) => (
              <label key={p.key} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 0", borderTop: "1px solid var(--line)", margin: 0, cursor: "pointer", color: "var(--g)", fontSize: 14 }}>
                <input type="checkbox" role="switch" checked={perms[p.key]} onChange={() => toggle(p.key)} style={{ width: 20, height: 20, marginTop: 2, accentColor: "#2AC38B" }} />
                <span><b style={{ fontSize: 15 }}>{p.label}</b><br /><span className="muted">{p.help}</span></span>
              </label>
            ))}
            <p className="muted" style={{ marginBottom: 0 }}><b>{enabled} de {PERMISSIONS.length}</b> permissões habilitadas. Padrão proposto do protótipo; ajuste por aluno.</p>
            {error && <p className="err">{error}</p>}
            {saved && <p className="okmsg">{saved}</p>}
          </div>

          <h2>Treinos</h2>
          {versions.length === 0 && <p className="muted">Nenhum treino ainda.</p>}
          {versions.map((v) => (
            <div className="card row between" key={v.id}>
              <span><Link href={`/personal/treinos/${v.id}`}>{v.name}</Link> <span className="muted">v{v.version}</span></span>
              <span className="row">
                <span className={`tag ${v.status === "published" && v.isCurrent ? "pub" : ""}`}>{v.status === "draft" ? "Rascunho" : v.isCurrent ? "Publicado" : "Anterior"}</span>
                {v.status === "published" && <span className="muted">{v.logCount} registro(s)</span>}
              </span>
            </div>
          ))}
        </>
      )}
    </Shell>
  );
}
