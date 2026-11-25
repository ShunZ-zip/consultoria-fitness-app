"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import ChatThread from "../../../components/ChatThread";
import Shell from "../../../components/Shell";
import { api, useMe } from "../../../lib/client";

export default function ChatAluno() {
  const { me, logout } = useMe("student");
  const [exercises, setExercises] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (!me) return;
    // Exercícios dos treinos atuais, para vincular a mensagem a um exercício da ficha.
    api("/versions").then(async (r) => {
      if (!r.ok) return;
      const map = new Map<string, string>();
      for (const v of (r.data as { id: string; isCurrent: boolean }[]).filter((x) => x.isCurrent)) {
        const d = await api(`/versions/${v.id}`);
        if (d.ok) for (const e of d.data.exercises) map.set(e.exerciseId, e.name);
      }
      setExercises([...map].map(([id, name]) => ({ id, name })));
    });
  }, [me]);
  return (
    <Shell me={me} logout={logout}>
      <p><Link href="/aluno">← Meus treinos</Link></p>
      <h1>Conversa com o personal</h1>
      <ChatThread base="/me/chat" exercises={exercises} />
    </Shell>
  );
}
