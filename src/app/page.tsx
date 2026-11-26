"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Backdrop from "../components/Backdrop";
import { ExpandableScreen, ExpandableScreenContent, ExpandableScreenTrigger } from "../components/ExpandableScreen";
import Fx from "../components/Fx";
import Icon, { type IconName } from "../components/Icon";
import LoginForm from "../components/LoginForm";
import ThemeToggle from "../components/ThemeToggle";
import Wordmark from "../components/Wordmark";
import { api, type Me } from "../lib/client";

const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: "clipboard", title: "Seu personal prescreve", text: "Ficha por série, com carga, repetições, esforço e orientações. O que foi publicado não muda: ajustes viram uma nova versão." },
  { icon: "dumbbell", title: "Você registra o que fez", text: "Série a série, no celular, até sem internet. O realizado fica separado da prescrição, e dá para comparar os dois." },
  { icon: "chart", title: "Vocês acompanham a evolução", text: "Carga, 1RM estimada, recordes e aderência, com check-ins e conversa direta para ajustar o treino." },
];
const BENEFITS: { icon: IconName; text: string }[] = [
  { icon: "check", text: "Veja a ficha publicada pelo seu personal e a demonstração de cada exercício." },
  { icon: "pulse", text: "Registre séries, carga e esforço, e responda ao check-in da semana." },
  { icon: "shield", text: "Seus dados de saúde ficam restritos a você e ao seu personal." },
];

/** Tela inicial pública. Quem já tem sessão é levado direto para a sua área. */
export default function Home() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    api<Me>("/me").then((r) => { if (r.ok) router.replace(r.data.role === "trainer" ? "/personal" : "/aluno"); else setReady(true); }).catch(() => setReady(true));
  }, [router]);

  if (!ready) return <p className="muted" role="status" style={{ padding: 24 }}>Carregando…</p>;
  return (
    <ExpandableScreen triggerRadius="100px" contentRadius="24px">
      <div className="shell-root land">
        <Fx fx="linked" effect="bar" target="body" start="top top" end="bottom bottom" className="read-progress" />
        <Backdrop />

        <header className="land-top wrap row between"><Wordmark /><ThemeToggle /></header>

        <section className="land-hero wrap" aria-labelledby="titulo">
          <Fx animation="fade-up" stagger={110} distance={26} duration={650} className="land-hero-in">
            <p className="eyebrow">Plataforma privada de consultoria</p>
            <h1 id="titulo" className="land-h1">Musculação baseada em evidências.</h1>
            <p className="land-lead">Prescrição por série, registro do que você fez e evolução clara. O acesso é por convite do seu personal.</p>
            <div className="land-cta">
              <ExpandableScreenTrigger className="btn big"><Icon name="user" />Entrar na minha área</ExpandableScreenTrigger>
              <Link className="btn ghost big" href="/register"><Icon name="sparkle" />Sou personal</Link>
            </div>
            <p className="muted land-hint">Aluno: use o link de convite que seu personal enviou.</p>
          </Fx>
        </section>

        <section className="land-section wrap" aria-labelledby="como">
          <Fx animation="mask-up"><h2 id="como" className="land-h2">Como funciona</h2></Fx>
          <Fx animation="fade-up" stagger={140} className="land-steps">
            {STEPS.map((s, i) => (
              <article className="card step ic-host" key={s.title}>
                <span className="step-n">0{i + 1}</span>
                <h3><Icon name={s.icon} />{s.title}</h3>
                <p>{s.text}</p>
              </article>
            ))}
          </Fx>
        </section>

        <section className="land-section wrap">
          <Fx as="p" fx="linked" effect="text-reveal" start="top 90%" end="bottom 60%" className="land-statement">
            Tornar a ciência do treinamento compreensível e aplicável na academia: cada afirmação importante com fonte, cada conceito explicado em linguagem simples, cada treino terminando em algo que você possa fazer.
          </Fx>
        </section>

        <footer className="land-foot wrap">
          <p className="muted">Conteúdo educativo: cada pessoa responde de um jeito. Não substitui orientação individualizada.</p>
          <div className="signature">Cauã Henry | Musculação baseada em evidências</div>
        </footer>
      </div>

      <ExpandableScreenContent label="Entrar na minha área">
        <div className="exs-grid">
          <div className="exs-copy">
            <h2 className="exs-h2">Entrar na sua área</h2>
            <ul className="exs-benefits">
              {BENEFITS.map((b) => (
                <li key={b.text}><span className="exs-ic"><Icon name={b.icon} enter /></span><p>{b.text}</p></li>
              ))}
            </ul>
            <p className="muted exs-note">Primeiro acesso? Abra o link de convite enviado pelo seu personal. Quem é personal pode <Link href="/register">criar a própria consultoria</Link>.</p>
          </div>
          <div className="exs-form"><LoginForm idPrefix="home" /></div>
        </div>
      </ExpandableScreenContent>
    </ExpandableScreen>
  );
}
