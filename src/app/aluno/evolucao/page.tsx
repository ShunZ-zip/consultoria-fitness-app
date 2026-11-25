"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import EvolutionPanel, { type EvolutionData } from "../../../components/EvolutionPanel";
import Shell from "../../../components/Shell";
import { apiCached, useMe } from "../../../lib/client";

export default function MinhaEvolucao() {
  const { me, logout } = useMe("student");
  const [data, setData] = useState<EvolutionData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!me) return;
    apiCached("/me/evolution", me.id).then((r) => {
      if (r.ok) setData(r.data);
      else setError(r.status === 403 ? "Seu personal não liberou a consulta de histórico e evolução." : "Não foi possível carregar a evolução.");
    });
  }, [me]);
  return (
    <Shell me={me} logout={logout}>
      <p><Link href="/aluno">← Meus treinos</Link></p>
      <h1>Minha evolução</h1>
      {error && <p className="err">{error}</p>}
      {data && <EvolutionPanel data={data} />}
    </Shell>
  );
}
