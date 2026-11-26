"use client";
import type { ReactNode } from "react";
import Backdrop from "./Backdrop";
import Fx from "./Fx";
import ThemeToggle from "./ThemeToggle";
import { useTitleFromH1 } from "../lib/useTitle";

/** Moldura das telas públicas (login, cadastro, convite, senha): fundo com paralaxe e entrada em cascata. */
export default function Stage({ children }: { children: ReactNode }) {
  useTitleFromH1();
  return (
    <div className="shell-root">
      <Backdrop />
      <div className="theme-float"><ThemeToggle /></div>
      <main className="wrap narrow">
        <Fx animation="fade-up" stagger={80} distance={20} duration={600}>{children}</Fx>
      </main>
    </div>
  );
}
