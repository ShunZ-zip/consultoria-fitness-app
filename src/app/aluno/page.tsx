"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import EngagementPanel from "../../components/EngagementPanel";
import Shell from "../../components/Shell";
import { api, useMe } from "../../lib/client";
import { periodText, subtitle } from "../../lib/routine";

interface Version { id: string; name: string; publishedAt: string; logCount: number; version: number; isCurrent: boolean; routineId: string | null }
interface Routine { id: string; name: string; goal: string | null; level: string | null; notes: string | null; startsOn: string | null; endsOn: string | null }

function WorkoutCard({ v }: { v: Version }) {
  return (
    <Link href={`/aluno/treino/${v.id}`} style={{ textDecoration: "none", color: "inherit" }}>
      <div className="card row between">
        <div>
          <b>{v.name}</b>
          <div className="muted">Publicado em {new Date(v.publishedAt).toLocaleDateString("pt-BR")}</div>
        </div>
        <span className="tag pub">{v.logCount > 0 ? `${v.logCount} registro(s)` : "Registrar"}</span>
      </div>
    </Link>
  );
}

export default function Aluno() {
  const { me, logout } = useMe("student");
  const [list, setList] = useState<Version[] | null>(null);
  const [routines, setRoutines] = useState<Routine[]>([]);
  useEffect(() => {
    if (!me) return;
    api("/versions").then((r) => setList(r.ok ? r.data : []));
    api("/me/routines").then((r) => r.ok && setRoutines(r.data));
  }, [me]);

  const current = (list ?? []).filter((v) => v.isCurrent);
  const byRoutine = (rid: string | null) => current.filter((v) => v.routineId === rid);
  const known = new Set(routines.map((r) => r.id));
  // treinos sem rotina (ou de rotina que o aluno não lista) aparecem no fim, sem título quando não há rotinas
  const loose = current.filter((v) => v.routineId === null || !known.has(v.routineId));

  return (
    <Shell me={me} logout={logout}>
      <h1>Meus treinos</h1>
      <EngagementPanel path="/me/engagement" who="aluno" />
      {list && list.length === 0 && <p className="muted">Seu personal ainda não publicou nenhum treino.</p>}
      {routines.map((r) => {
        const ws = byRoutine(r.id);
        return (
          <section key={r.id} className="rt-group" aria-labelledby={`rt-${r.id}`}>
            <h2 id={`rt-${r.id}`} style={{ marginBottom: 2 }}>{r.name}</h2>
            <div className="muted">{[subtitle(r.goal, r.level), periodText(r.startsOn, r.endsOn)].filter((x) => x && x !== "Sem período").join(" · ")}</div>
            {r.notes && <details className="card rt-notes"><summary>Orientações gerais</summary><p>{r.notes}</p></details>}
            {ws.length === 0 ? <p className="muted">Nenhum treino publicado nesta rotina ainda.</p> : ws.map((v) => <WorkoutCard key={v.id} v={v} />)}
          </section>
        );
      })}
      {loose.length > 0 && (
        <section aria-labelledby={routines.length ? "rt-outros" : undefined}>
          {routines.length > 0 && <h2 id="rt-outros">Outros treinos</h2>}
          {loose.map((v) => <WorkoutCard key={v.id} v={v} />)}
        </section>
      )}
      {list && list.some((v) => !v.isCurrent) && (
        <>
          <h2>Treinos anteriores</h2>
          {list.filter((v) => !v.isCurrent).map((v) => (
            <Link key={v.id} href={`/aluno/treino/${v.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              <div className="card row between">
                <div><b>{v.name}</b> <span className="muted">v{v.version}</span><div className="muted">Publicado em {new Date(v.publishedAt).toLocaleDateString("pt-BR")}</div></div>
                <span className="tag">{v.logCount} registro(s)</span>
              </div>
            </Link>
          ))}
        </>
      )}
    </Shell>
  );
}
