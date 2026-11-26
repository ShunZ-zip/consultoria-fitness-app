"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import LoginForm from "../../components/LoginForm";
import Stage from "../../components/Stage";
import Wordmark from "../../components/Wordmark";

export default function Login() {
  const [resetDone, setResetDone] = useState(false);
  useEffect(() => { setResetDone(new URLSearchParams(window.location.search).get("senha") === "redefinida"); }, []);
  return (
    <Stage>
      <div style={{ marginBottom: 20 }}><Wordmark /></div>
      <h1>Entrar</h1>
      <LoginForm notice={resetDone ? "Senha redefinida. Entre com a nova senha." : undefined} />
      <p className="muted">Personal novo? <Link href="/register">Criar meu espaço</Link>. Alunos entram apenas por convite.</p>
    </Stage>
  );
}
