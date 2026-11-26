"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Shell from "../../../../components/Shell";
import Icon from "../../../../components/Icon";
import StudentFollowUp from "../../../../components/StudentFollowUp";
import StudentSuggestions from "../../../../components/StudentSuggestions";
import EvolutionPanel, { type EvolutionData } from "../../../../components/EvolutionPanel";
import EngagementPanel from "../../../../components/EngagementPanel";
import StudentInfoCard from "../../../../components/StudentInfoCard";
import RoutinesSection from "../../../../components/RoutinesSection";
import { api, useMe } from "../../../../lib/client";
import { PERMISSIONS, type Permissions } from "../../../../lib/permissions";

interface Student { id: string; name: string; email: string }
interface Version { id: string; programId: string; name: string; status: "draft" | "published"; studentId: string; version: number; isCurrent: boolean; logCount: number; routineId: string | null; routineName: string | null }
interface RoutineOpt { id: string; name: string; status: string }

export default function PerfilAluno() {
  const { id } = useParams<{ id: string }>();
  const { me, logout } = useMe("trainer");
  const [student, setStudent] = useState<Student | null | undefined>(undefined);
  const [perms, setPerms] = useState<Permissions | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [evo, setEvo] = useState<EvolutionData | null>(null);
  const [routines, setRoutines] = useState<RoutineOpt[]>([]);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const load = useCallback(async () => {
    const [s, p, v, e, rt] = await Promise.all([api("/students"), api(`/students/${id}/permissions`), api("/versions"), api(`/students/${id}/evolution`), api(`/students/${id}/routines`)]);
    if (rt.ok) setRoutines((rt.data as RoutineOpt[]).filter((r) => r.status !== "deleted"));
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

  async function moveWorkout(versionId: string, routineId: string) {
    setError(""); setSaved("");
    const r = await api(`/versions/${versionId}/routine`, "POST", { routineId: routineId || null });
    if (!r.ok) return setError("Não foi possível mover o treino de rotina.");
    setSaved("Treino movido. A prescrição não mudou."); load();
  }

  /** Sobe ou desce um treino (todas as versões dele andam juntas). A ordem vale para o aluno também. */
  async function moveProgram(programId: string, dir: -1 | 1) {
    const order = [...new Set(versions.map((v) => v.programId))];
    const i = order.indexOf(programId), j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    setError(""); setSaved("");
    const r = await api(`/students/${id}/workouts/order`, "POST", { programIds: order });
    if (!r.ok) return setError("Não foi possível reordenar os treinos.");
    setSaved("Ordem dos treinos atualizada."); load();
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
              <Link className="btn small" href={`/personal/treinos/novo?aluno=${student.id}`}><Icon name="plus" />Novo treino</Link>
            </span>
          </div>
          <p className="muted">{student.email}</p>
          <StudentInfoCard studentId={student.id} />
          <EngagementPanel path={`/students/${student.id}/engagement`} who="personal" />

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

          <RoutinesSection studentId={student.id} onChanged={load} />

          <h2>Treinos</h2>
          {versions.length === 0 && <p className="muted">Nenhum treino ainda.</p>}
          {versions.map((v, idx) => {
            const programOrder = [...new Set(versions.map((x) => x.programId))];
            const first = versions.findIndex((x) => x.programId === v.programId) === idx;   // setas só na 1ª linha de cada treino
            const pos = programOrder.indexOf(v.programId);
            return (
            <div className="card row between" key={v.id}>
              <span className="row" style={{ gap: 6 }}>
                {programOrder.length > 1 && (first ? (
                  <span className="row" style={{ gap: 4 }}>
                    <button type="button" className="btn ghost small" aria-label={`Subir o treino ${v.name}`} disabled={pos === 0} onClick={() => moveProgram(v.programId, -1)}>↑</button>
                    <button type="button" className="btn ghost small" aria-label={`Descer o treino ${v.name}`} disabled={pos === programOrder.length - 1} onClick={() => moveProgram(v.programId, 1)}>↓</button>
                  </span>
                ) : <span style={{ width: 94 }} aria-hidden="true" />)}
                <span><Link href={`/personal/treinos/${v.id}`}>{v.name}</Link> <span className="muted">v{v.version}</span></span>
              </span>
              <span className="row">
                {routines.length > 0 && (
                  <select style={{ maxWidth: 200 }} aria-label={`Rotina do treino ${v.name}`} value={v.routineId ?? ""} onChange={(e) => moveWorkout(v.id, e.target.value)}>
                    <option value="">Sem rotina</option>
                    {routines.map((r) => <option key={r.id} value={r.id}>{r.name}{r.status !== "active" ? " (arquivada)" : ""}</option>)}
                  </select>
                )}
                <span className={`tag ${v.status === "published" && v.isCurrent ? "pub" : ""}`}>{v.status === "draft" ? "Rascunho" : v.isCurrent ? "Publicado" : "Anterior"}</span>
                {v.status === "published" && <span className="muted">{v.logCount} registro(s)</span>}
              </span>
            </div>
            );
          })}
        </>
      )}
    </Shell>
  );
}
