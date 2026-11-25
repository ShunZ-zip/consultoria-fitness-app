import Link from "next/link";

/** Wordmark: CAUÃ HENRY com a etiqueta MUSCULAÇÃO colada logo abaixo (brandbook). */
export default function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="wordmark" aria-label="Cauã Henry | Musculação">
      <span className="wm-name">Cauã Henry</span>
      <span className="wm-tag">Musculação</span>
    </Link>
  );
}
