"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import ChatThread from "../../../../components/ChatThread";
import Shell from "../../../../components/Shell";
import { api, useMe } from "../../../../lib/client";

export default function ConversaAluno() {
  const { studentId } = useParams<{ studentId: string }>();
  const { me, logout } = useMe("trainer");
  const [name, setName] = useState("");
  const [exercises, setExercises] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (!me) return;
    api("/students").then((r) => r.ok && setName((r.data as { id: string; name: string }[]).find((s) => s.id === studentId)?.name ?? ""));
    api("/exercises").then((r) => r.ok && setExercises(r.data));
  }, [me, studentId]);
  return (
    <Shell me={me} logout={logout}>
      <p><Link href="/personal/chat">← Mensagens</Link> · <Link href={`/personal/alunos/${studentId}`}>Perfil do aluno</Link></p>
      <h1>{name || "Conversa"}</h1>
      <ChatThread base={`/chat/${studentId}`} exercises={exercises} />
    </Shell>
  );
}
