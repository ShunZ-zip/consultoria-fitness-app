"use client";
import { useState } from "react";
import { isDirectVideoFile, isImageFile, youtubeId } from "../lib/media";
import type { ResolvedMedia } from "../lib/media";
import { api } from "../lib/client";
import { nameFromModelUrl } from "../lib/exercise3d";
import Exercise3D from "./Exercise3D";

/** Demonstração do exercício: carrega sob demanda a mídia já resolvida para o aluno (oficial, própria ou ambas). */
export function MediaItems({ resolved }: { resolved: ResolvedMedia }) {
  if (resolved.items.length === 0) return <p className="muted">Ainda não há demonstração disponível para este exercício.</p>;
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {resolved.fallback && <p className="muted" style={{ margin: 0 }}>Mostrando a mídia disponível (a preferida ainda não existe).</p>}
      {resolved.items.map((m) => (
        <figure key={m.id} style={{ margin: 0 }}>
          {nameFromModelUrl(m.url)
            ? <Exercise3D name={nameFromModelUrl(m.url)!} />
            : isImageFile(m.url)
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={m.url} alt={m.title} style={{ width: "100%", maxHeight: 360, objectFit: "contain", background: "#0E1B2B" }} />
            : youtubeId(m.url)
            ? (
              <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", background: "#000", borderRadius: 6, overflow: "hidden" }}>
                {/* Incorporação do YouTube com privacidade reforçada (youtube-nocookie); carrega só quando aparece na tela. */}
                <iframe src={`https://www.youtube-nocookie.com/embed/${youtubeId(m.url)}?rel=0`} title={m.title} loading="lazy" allowFullScreen
                  allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin"
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }} />
              </div>
            )
            : isDirectVideoFile(m.url)
            ? <video controls preload="none" playsInline style={{ width: "100%", maxHeight: 360, background: "#000" }} src={m.url} aria-label={m.title} />
            : <a href={m.url} target="_blank" rel="noopener noreferrer" className="btn ghost small">Abrir vídeo ↗</a>}
          <figcaption className="muted" style={{ marginTop: 4 }}>
            <span className="tag" style={{ marginRight: 6 }}>{m.source === "official" ? (nameFromModelUrl(m.url) ? "Animação 3D" : m.kind === "video" ? "Vídeo de referência" : "Animação oficial") : "Vídeo do seu personal"}</span>{m.title}
            {m.source === "official" && m.kind === "video" && m.license && <span> · {m.license.replace(/^Vídeo de terceiros: /, "Crédito: ")}</span>}
            {youtubeId(m.url) && <> · <a href={m.url} target="_blank" rel="noopener noreferrer">Abrir no YouTube ↗</a></>}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

export default function MediaViewer({ exerciseId }: { exerciseId: string }) {
  const [state, setState] = useState<{ resolved: ResolvedMedia | null; loading: boolean; error: string }>({ resolved: null, loading: false, error: "" });
  async function load() {
    if (state.resolved || state.loading) return;
    setState((s) => ({ ...s, loading: true }));
    try {
      const r = await api(`/exercises/${exerciseId}/media`);
      setState({ resolved: r.ok ? r.data.resolved : null, loading: false, error: r.ok ? "" : "Não foi possível carregar a demonstração." });
    } catch { setState({ resolved: null, loading: false, error: "Sem conexão: a demonstração não está disponível agora." }); }
  }
  return (
    <details onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && load()} style={{ marginTop: 8 }}>
      <summary style={{ cursor: "pointer", color: "var(--g)", fontSize: 14 }}>Ver demonstração</summary>
      <div style={{ marginTop: 8 }}>
        {state.loading && <p className="muted">Carregando…</p>}
        {state.error && <p className="err">{state.error}</p>}
        {state.resolved && <MediaItems resolved={state.resolved} />}
      </div>
    </details>
  );
}
