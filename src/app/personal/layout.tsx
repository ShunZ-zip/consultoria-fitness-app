import type { ReactNode } from "react";
import { ShellFrame } from "../../components/Shell";

/** Cabeçalho e abas ficam fixos: trocar de aba troca só o conteúdo, sem remontar a página inteira. */
export default function Layout({ children }: { children: ReactNode }) {
  return <ShellFrame role="trainer">{children}</ShellFrame>;
}
