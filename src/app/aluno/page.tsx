"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import EngagementPanel from "../../components/EngagementPanel";
import Shell from "../../components/Shell";
import { api, useMe } from "../../lib/client";

interface Version { id: string; name: string; publishedAt: string; logCount: number; version: number; isCurrent: boolean }

export default function Aluno() {
  const { me, logout } = useMe("student");
  const [list, setList] = useState<Version[] | null>(null);
  useEffect(() => { if (me) api("/versions").then((r) => setList(r.ok ? r.data : [])); }, [me]);

  return (
    <Shell me={me} logout={logout}>
      <h1>Meus treinos</h1>
      <EngagementPanel path="/me/engagement" who="aluno" />
      {list && list.length === 0 && <p className="muted">Seu personal ainda não publicou nenhum treino.</p>}
      {list?.filter((v) => v.isCurrent).map((v) => (
        <Link key={v.id} href={`/aluno/treino/${v.id}`} style={{ textDecoration: "none", color: "inherit" }}>
          <div className="card row between">
            <div>
              <b>{v.name}</b>
              <div className="muted">Publicado em {new Date(v.publishedAt).toLocaleDateString("pt-BR")}</div>
            </div>
            <span className="tag pub">{v.logCount > 0 ? `${v.logCount} registro(s)` : "Registrar"}</span>
          </div>
        </Link>
      ))}
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
