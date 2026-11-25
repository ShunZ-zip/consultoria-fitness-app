"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/client";

interface Msg { id: string; mine: boolean; senderName: string; body: string; exercise: { id: string; name: string } | null; createdAt: string; readAt: string | null }
interface Ex { id: string; name: string }

/** Conversa privada personal ↔ aluno. `base` = "/me/chat" (aluno) ou "/chat/<alunoId>" (personal). Atualiza a cada 8 s. */
export default function ChatThread({ base, exercises = [] }: { base: string; exercises?: Ex[] }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [exId, setExId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const r = await api(base);
    if (r.ok) { setMsgs(r.data); if ((r.data as Msg[]).some((m) => !m.mine && !m.readAt)) api(`${base}/read`, "POST"); }
    else setError(r.status === 404 ? "Conversa não encontrada." : "Não foi possível carregar as mensagens.");
  }, [base]);
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [msgs.length]);

  async function send() {
    const body = text.trim(); if (!body) return;
    setBusy(true); setError("");
    const r = await api(base, "POST", { id: crypto.randomUUID(), body, exerciseId: exId || null });
    setBusy(false);
    if (!r.ok) return setError(r.data?.error ?? "Não foi possível enviar.");
    setText(""); setExId(""); load();
  }

  return (
    <div>
      <div className="card" style={{ minHeight: 260, maxHeight: 460, overflowY: "auto" }} data-testid="chat-messages" aria-live="polite">
        {msgs.length === 0 && <p className="muted">Nenhuma mensagem ainda. Conversa privada entre você e {base === "/me/chat" ? "o seu personal" : "o aluno"}.</p>}
        {msgs.map((m) => (
          <div key={m.id} style={{ display: "flex", justifyContent: m.mine ? "flex-end" : "flex-start", marginBottom: 10 }}>
            <div style={{ maxWidth: "80%", padding: "8px 12px", background: m.mine ? "rgba(26,115,233,.28)" : "var(--panel2)", border: "1px solid var(--line)", borderRadius: 6 }}>
              {m.exercise && <div className="muted" style={{ fontSize: 12, marginBottom: 2 }}>Sobre o exercício: <b>{m.exercise.name}</b></div>}
              <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.body}</div>
              <div className="muted" style={{ fontSize: 11, marginTop: 2, textAlign: "right" }}>{m.mine ? "Você" : m.senderName} · {new Date(m.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {error && <p className="err">{error}</p>}
      <div className="card">
        <label htmlFor="chat-text" style={{ marginTop: 0 }}>Mensagem</label>
        <textarea id="chat-text" rows={2} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="row between" style={{ marginTop: 8 }}>
          {exercises.length > 0 ? (
            <select aria-label="Vincular a um exercício da ficha" style={{ maxWidth: 280 }} value={exId} onChange={(e) => setExId(e.target.value)}>
              <option value="">Sem exercício vinculado</option>
              {exercises.map((e) => <option key={e.id} value={e.id}>Sobre: {e.name}</option>)}
            </select>
          ) : <span />}
          <button className="btn" disabled={busy || !text.trim()} onClick={send}>Enviar</button>
        </div>
        <p className="muted" style={{ marginBottom: 0 }}>Somente texto (até 2000 caracteres). Envio de áudio, fotos e vídeos ainda não está disponível.</p>
      </div>
    </div>
  );
}
