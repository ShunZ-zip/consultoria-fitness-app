"use client";
// Diálogo de conclusão do treino (aluno): resumo de início, fim e tempo; esforço percebido (opcional) e comentário (opcional).
// O que o aluno responde aqui chega ao personal na caixa de feedbacks. Nada altera a prescrição.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { durationMinutes, EFFORT_LABELS, EFFORT_MAX, formatDuration } from "../lib/feedback";
import Icon from "./Icon";

const hhmm = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export default function FinishDialog({ startedAt, onConfirm, onClose }: {
  startedAt: string | null; onConfirm: (v: { effort: number | null; note: string }) => void; onClose: () => void;
}) {
  const [now] = useState(() => new Date());
  const [effort, setEffort] = useState(""); const [note, setNote] = useState("");
  const ref = useRef<HTMLDivElement>(null); const opener = useRef<Element | null>(null);
  const min = durationMinutes(startedAt, now);

  useEffect(() => {
    opener.current = document.activeElement; ref.current?.querySelector<HTMLElement>("select")?.focus();
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; if (opener.current instanceof HTMLElement) opener.current.focus(); };
  }, []);
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
    if (e.key !== "Tab") return;
    const els = [...(ref.current?.querySelectorAll<HTMLElement>("button:not([disabled]), select, textarea") ?? [])];
    if (!els.length) return;
    const first = els[0], last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  return createPortal(
    <div className="pk-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pk-dialog fin-dialog" role="dialog" aria-modal="true" aria-labelledby="fin-title" ref={ref} onKeyDown={onKey}>
        <div className="pk-body">
          <div className="fin-medal" aria-hidden="true"><Icon name="trophy" /></div>
          <h2 id="fin-title" className="fin-title">Concluir treino</h2>
          <p className="muted" style={{ textAlign: "center", margin: "0 0 14px" }}>Seu personal vai ver o que você registrou e a sua resposta abaixo.</p>
          <dl className="fin-sum">
            <div><dt>Início</dt><dd>{startedAt ? hhmm(new Date(startedAt)) : "—"}</dd></div>
            <div><dt>Fim</dt><dd>{hhmm(now)}</dd></div>
            <div><dt>Tempo de treino</dt><dd>{formatDuration(min)}</dd></div>
          </dl>
          <label htmlFor="fin-e">O que você achou dessa atividade? (opcional)</label>
          <select id="fin-e" value={effort} onChange={(e) => setEffort(e.target.value)}>
            <option value="">Selecione</option>
            {Array.from({ length: EFFORT_MAX }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{EFFORT_LABELS[n]}</option>)}
          </select>
          <label htmlFor="fin-n">Deixe seu comentário aqui (opcional)</label>
          <textarea id="fin-n" rows={4} maxLength={1000} placeholder="Seu comentário aqui" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="row" style={{ marginTop: 14 }}>
            <button type="button" className="btn" onClick={() => onConfirm({ effort: effort ? Number(effort) : null, note: note.trim() })}>Concluir</button>
            <button type="button" className="btn ghost" onClick={onClose}>Voltar ao treino</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
