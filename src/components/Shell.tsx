"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { api, FrameContext, useSession, type Me } from "../lib/client";
import Backdrop from "./Backdrop";
import Fx from "./Fx";
import Icon, { type IconName } from "./Icon";
import Skeleton from "./Skeleton";
import ThemeToggle from "./ThemeToggle";
import Wordmark from "./Wordmark";
import { useTitleFromH1 } from "../lib/useTitle";

interface NavItem { href: string; label: string; icon: IconName; active: (p: string) => boolean; chat?: boolean }
const NAV: Record<Me["role"], NavItem[]> = {
  trainer: [
    { href: "/personal", label: "Alunos", icon: "user", active: (p) => p === "/personal" || p.startsWith("/personal/alunos") || p.startsWith("/personal/treinos") },
    { href: "/personal/biblioteca", label: "Biblioteca", icon: "dumbbell", active: (p) => p.startsWith("/personal/biblioteca") },
    { href: "/personal/avaliacoes", label: "Avaliações", icon: "clipboard", active: (p) => p.startsWith("/personal/avaliacoes") },
    { href: "/personal/chat", label: "Mensagens", icon: "chat", active: (p) => p.startsWith("/personal/chat"), chat: true },
    { href: "/personal/organizacao", label: "Organização", icon: "check", active: (p) => p.startsWith("/personal/organizacao") },
    { href: "/personal/financeiro", label: "Financeiro", icon: "card", active: (p) => p.startsWith("/personal/financeiro") || p.startsWith("/personal/assinatura") },
  ],
  student: [
    { href: "/aluno", label: "Treinos", icon: "dumbbell", active: (p) => p === "/aluno" || p.startsWith("/aluno/treino") },
    { href: "/aluno/evolucao", label: "Evolução", icon: "chart", active: (p) => p.startsWith("/aluno/evolucao") },
    { href: "/aluno/checkin", label: "Check-in", icon: "pulse", active: (p) => p.startsWith("/aluno/checkin") },
    { href: "/aluno/avaliacoes", label: "Avaliações", icon: "clipboard", active: (p) => p.startsWith("/aluno/avaliacoes") },
    { href: "/aluno/chat", label: "Conversa", icon: "chat", active: (p) => p.startsWith("/aluno/chat"), chat: true },
    { href: "/aluno/pagamentos", label: "Pagamentos", icon: "card", active: (p) => p.startsWith("/aluno/pagamentos") },
  ],
};

/** Quadro fixo de uma área (personal ou aluno): cabeçalho e abas ficam montados enquanto só o conteúdo muda ao trocar de aba. */
export function ShellFrame({ role, children }: { role: "trainer" | "student"; children: ReactNode }) {
  const { me, logout } = useSession(role);
  return (
    <FrameContext.Provider value={{ me, logout }}>
      <ShellView me={me} logout={logout} frame>{children}</ShellView>
    </FrameContext.Provider>
  );
}

/** Cada tela envolve seu conteúdo em <Shell>. Dentro do quadro fixo ele só anima a entrada do conteúdo; fora dele (telas soltas) desenha tudo. */
export default function Shell({ me, logout, children }: { me: Me | null; logout: () => void; children: ReactNode }) {
  const frame = useContext(FrameContext);
  if (frame) return <Fx animation="fade-up" stagger={55} distance={18} duration={550} once>{children}</Fx>;
  return <ShellView me={me} logout={logout}>{children}</ShellView>;
}

function ShellView({ me, logout, children, frame = false }: { me: Me | null; logout: () => void; children: ReactNode; frame?: boolean }) {
  const path = usePathname();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!me) return;
    const load = () => api("/chat/unread").then((r) => r.ok && setUnread(r.data.count)).catch(() => undefined);
    load(); const t = setInterval(load, 20000); return () => clearInterval(t);
  }, [me, path]);

  useTitleFromH1();

  // Indicador que DESLIZA até a aba ativa (a barra fica montada, então a posição anima de uma aba para a outra).
  const navRef = useRef<HTMLElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number; height: number; top: number } | null>(null);
  const useIso = typeof window !== "undefined" ? useLayoutEffect : useEffect;
  useIso(() => {
    const place = () => {
      const nav = navRef.current; const on = nav?.querySelector<HTMLElement>(".navlink.on");
      if (!nav || !on) { setPill(null); return; }
      setPill({ left: on.offsetLeft, width: on.offsetWidth, height: on.offsetHeight, top: on.offsetTop });
      const l = on.offsetLeft - nav.scrollLeft, r = l + on.offsetWidth;
      if (l < 8 || r > nav.clientWidth - 8) nav.scrollTo({ left: on.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2, behavior: "smooth" });
    };
    place();
    window.addEventListener("resize", place);
    const t = window.setTimeout(place, 400); // depois das fontes e dos ícones
    return () => { window.removeEventListener("resize", place); window.clearTimeout(t); };
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
            <ThemeToggle />
            <button className="btn ghost small" onClick={logout}>Sair</button>
          </div>
        )}
      </div>
      {me && (
        <nav className="mainnav" aria-label="Principal" ref={navRef}>
          {pill && <span className="nav-pill" aria-hidden="true" style={{ transform: `translate(${pill.left}px, ${pill.top}px)`, width: pill.width, height: pill.height }} />}
          {NAV[me.role].map((n) => {
            const on = n.active(path ?? "");
            return (
              <Link key={n.href} href={n.href} className={`navlink${on ? " on" : ""}`} aria-current={on ? "page" : undefined}>
                <Icon name={n.icon} />
                <span>{n.label}</span>
                {n.chat && unread > 0 && <><span className="navbadge" aria-hidden="true">{unread}</span><span className="sr-only">, {unread} {unread === 1 ? "mensagem não lida" : "mensagens não lidas"}</span></>}
              </Link>
            );
          })}
        </nav>
      )}
      <main className="wrap" id="conteudo" tabIndex={-1}>
        {me ? (frame ? children : <Fx animation="fade-up" stagger={55} distance={18} duration={550}>{children}</Fx>) : <Skeleton />}
        <div className="signature">Cauã Henry | Musculação baseada em evidências{me ? ` · ${me.consultancyName}` : ""}</div>
      </main>
    </div>
  );
}
