"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import Shell from "../../../components/Shell";
import { api, useMe } from "../../../lib/client";

interface Conv { studentId: string; name: string; lastBody: string | null; lastAt: string | null; unread: number }

export default function Conversas() {
  const { me, logout } = useMe("trainer");
  const [list, setList] = useState<Conv[]>([]);
  useEffect(() => { if (!me) return; const load = () => api("/chat").then((r) => r.ok && setList(r.data)); load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [me]);
  return (
    <Shell me={me} logout={logout}>
      <p><Link href="/personal">← Alunos</Link></p>
      <h1>Mensagens</h1>
      {list.length === 0 && <p className="muted">Nenhum aluno ainda.</p>}
      {list.map((c) => (
        <Link key={c.studentId} href={`/personal/chat/${c.studentId}`} style={{ textDecoration: "none", color: "inherit" }}>
          <div className="card row between">
            <span><b>{c.name}</b><div className="muted" style={{ maxWidth: 420, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.lastBody ?? "Sem mensagens"}</div></span>
            <span className="row">{c.lastAt && <span className="muted">{new Date(c.lastAt).toLocaleDateString("pt-BR")}</span>}{c.unread > 0 && <span className="tag pub">{c.unread} nova(s)</span>}</span>
          </div>
        </Link>
      ))}
    </Shell>
  );
}
