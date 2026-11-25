"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api, type Me } from "../lib/client";
import Backdrop from "./Backdrop";
import Fx from "./Fx";
import Icon, { type IconName } from "./Icon";
import Wordmark from "./Wordmark";

interface NavItem { href: string; label: string; icon: IconName; active: (p: string) => boolean; chat?: boolean }
const NAV: Record<Me["role"], NavItem[]> = {
  trainer: [
    { href: "/personal", label: "Alunos", icon: "user", active: (p) => p === "/personal" || p.startsWith("/personal/alunos") || p.startsWith("/personal/treinos") },
    { href: "/personal/biblioteca", label: "Biblioteca", icon: "dumbbell", active: (p) => p.startsWith("/personal/biblioteca") },
    { href: "/personal/avaliacoes", label: "Avaliações", icon: "clipboard", active: (p) => p.startsWith("/personal/avaliacoes") },
    { href: "/personal/chat", label: "Mensagens", icon: "chat", active: (p) => p.startsWith("/personal/chat"), chat: true },
  ],
  student: [
    { href: "/aluno", label: "Treinos", icon: "dumbbell", active: (p) => p === "/aluno" || p.startsWith("/aluno/treino") },
    { href: "/aluno/evolucao", label: "Evolução", icon: "chart", active: (p) => p.startsWith("/aluno/evolucao") },
    { href: "/aluno/checkin", label: "Check-in", icon: "pulse", active: (p) => p.startsWith("/aluno/checkin") },
    { href: "/aluno/avaliacoes", label: "Avaliações", icon: "clipboard", active: (p) => p.startsWith("/aluno/avaliacoes") },
    { href: "/aluno/chat", label: "Conversa", icon: "chat", active: (p) => p.startsWith("/aluno/chat"), chat: true },
  ],
};

export default function Shell({ me, logout, children }: { me: Me | null; logout: () => void; children: ReactNode }) {
  const path = usePathname();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!me) return;
    const load = () => api("/chat/unread").then((r) => r.ok && setUnread(r.data.count)).catch(() => undefined);
    load(); const t = setInterval(load, 20000); return () => clearInterval(t);
  }, [me, path]);

  // Título da aba = título da página (ajuda a se localizar e a leitores de tela).
  useEffect(() => {
    const t = setTimeout(() => {
      const h = document.querySelector("main h1")?.textContent?.trim();
      document.title = h ? `${h} · Cauã Henry | Musculação` : "Cauã Henry | Musculação";
    }, 350);
    return () => clearTimeout(t);
  }, [path, me]);

  return (
    <div className="shell-root">
      <a className="skip" href="#conteudo">Pular para o conteúdo</a>
      <Fx fx="linked" effect="bar" target="body" start="top top" end="bottom bottom" className="read-progress" />
      <Backdrop />
      <div className="top">
        <Wordmark />
        {me && (
          <div className="who">
            <span className="who-name">{me.name} · {me.role === "trainer" ? "Personal" : "Aluno"}</span>
            <button className="btn ghost small" onClick={logout}>Sair</button>
          </div>
        )}
      </div>
      {me && (
        <nav className="mainnav" aria-label="Principal">
          {NAV[me.role].map((n) => {
            const on = n.active(path ?? "");
            return (
              <Link key={n.href} href={n.href} className={`navlink${on ? " on" : ""}`} aria-current={on ? "page" : undefined}>
                <Icon name={n.icon} />
                <span>{n.label}</span>
                {n.chat && unread > 0 && <span className="navbadge" aria-label={`${unread} mensagens não lidas`}>{unread}</span>}
              </Link>
            );
          })}
        </nav>
      )}
      <main className="wrap" id="conteudo" tabIndex={-1}>
        {me ? <Fx animation="fade-up" stagger={55} distance={18} duration={550}>{children}</Fx> : <p className="muted" role="status">Carregando…</p>}
        <div className="signature">Cauã Henry | Musculação baseada em evidências{me ? ` · ${me.consultancyName}` : ""}</div>
      </main>
    </div>
  );
}
