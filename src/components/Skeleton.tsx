/** Estado de carregamento: blocos no lugar do conteúdo (sem texto solto) e aviso para leitores de tela. */
export default function Skeleton({ lines = 3, label = "Carregando…" }: { lines?: number; label?: string }) {
  return (
    <div role="status" aria-busy="true" className="skeleton-wrap">
      <span className="sr-only">{label}</span>
      <div className="skeleton skeleton-title" aria-hidden="true" />
      {Array.from({ length: lines }, (_, i) => <div key={i} className="skeleton skeleton-line" aria-hidden="true" style={{ width: `${92 - i * 14}%` }} />)}
    </div>
  );
}
