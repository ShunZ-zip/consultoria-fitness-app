import Link from "next/link";
import Logo from "./Logo";

/** Marca do app (logo FisIQ). Mantém o nome do componente para as telas que já o usam. */
export default function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="wordmark" aria-label="FisIQ, ir para o início">
      <Logo className="logo" aria-hidden="true" role="presentation" />
    </Link>
  );
}
