"use client";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import Icon from "../../../components/Icon";
import Shell from "../../../components/Shell";
import { api, useMe } from "../../../lib/client";
import { neighbor, planMove, STATUS_LABEL, TASK_STATUSES, TASK_TAGS, type Suggestion, type Task, type TaskStatus, type TaskTag } from "../../../lib/tasks";

interface Student { id: string; name: string }
const fmtDate = (d: string) => d.split("-").reverse().join("/");
const EMPTY_HINT: Record<TaskStatus, string> = { todo: "Nada por fazer. Adicione uma tarefa ou aceite uma sugestão.", "in-progress": "Arraste um cartão para cá ou use o botão →.", done: "Tarefas concluídas aparecem aqui." };

export default function Organizacao() {
  const { me, logout } = useMe("trainer");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [error, setError] = useState(""); const [info, setInfo] = useState("");
  const [form, setForm] = useState({ title: "", tag: "Outro" as TaskTag, studentId: "", dueDate: "" });
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: "", tag: "Outro" as TaskTag, studentId: "", dueDate: "" });
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ status: TaskStatus; index: number } | null>(null);
  const rects = useRef<Map<string, DOMRect>>(new Map());
  const boardRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const [t, s, st] = await Promise.all([api("/tasks"), api("/tasks/suggestions"), api("/students")]);
    if (t.ok) setTasks(t.data); if (s.ok) setSuggestions(s.data); if (st.ok) setStudents(st.data);
  }, []);
  useEffect(() => { if (me) load(); }, [me, load]);

  // FLIP: depois de reordenar, cada cartão anima da posição antiga para a nova (mola), salvo com movimento reduzido.
  const snapshot = () => {
    rects.current = new Map();
    boardRef.current?.querySelectorAll<HTMLElement>("[data-task]").forEach((el) => rects.current.set(el.dataset.task!, el.getBoundingClientRect()));
  };
  useLayoutEffect(() => {
    if (rects.current.size === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { rects.current = new Map(); return; }
    boardRef.current?.querySelectorAll<HTMLElement>("[data-task]").forEach((el) => {
      const prev = rects.current.get(el.dataset.task!); if (!prev) return;
      const now = el.getBoundingClientRect();
      const dx = prev.left - now.left, dy = prev.top - now.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], { duration: 420, easing: "cubic-bezier(.34,1.56,.64,1)" });
    });
    rects.current = new Map();
  }, [tasks]);

  async function persist(plan: { id: string; status: TaskStatus; position: number }[]) {
    if (plan.length === 0) return;
    snapshot();
    setTasks((cur) => cur.map((t) => { const p = plan.find((x) => x.id === t.id); return p ? { ...t, status: p.status, position: p.position } : t; }));
    const r = await api("/tasks/reorder", "POST", { items: plan });
    if (!r.ok) { setError("Não foi possível salvar a nova ordem. O quadro foi recarregado."); load(); }
  }
  const move = (t: Task, to: TaskStatus, index = Number.MAX_SAFE_INTEGER) => { setError(""); setInfo(""); void persist(planMove(tasks, t.id, to, index)); };

  // --- arrastar e soltar (mouse); botões ← → cobrem teclado e celular
  const indexFor = (e: DragEvent<HTMLElement>, status: TaskStatus) => {
    const cards = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-task]")].filter((c) => c.dataset.task !== dragId);
    let i = 0;
    for (const c of cards) { const r = c.getBoundingClientRect(); if (e.clientY > r.top + r.height / 2) i++; }
    return Math.min(i, tasks.filter((t) => t.status === status && t.id !== dragId).length);
  };
  const onDrop = (e: DragEvent<HTMLElement>, status: TaskStatus) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || dragId; const t = tasks.find((x) => x.id === id);
    const index = indexFor(e, status);
    setDragId(null); setOver(null);
    if (t) move(t, status, index);
  };

  async function add(e: FormEvent) {
    e.preventDefault(); setError(""); setInfo("");
    const r = await api("/tasks", "POST", { title: form.title, tag: form.tag, studentId: form.studentId || null, dueDate: form.dueDate || null });
    if (!r.ok) return setError(r.data?.issues?.[0]?.message ?? r.data?.error ?? "Não foi possível criar a tarefa.");
    setForm({ title: "", tag: "Outro", studentId: "", dueDate: "" }); setInfo("Tarefa criada."); load();
  }
  async function saveEdit(e: FormEvent, id: string) {
    e.preventDefault(); setError(""); setInfo("");
    const r = await api(`/tasks/${id}`, "PUT", { title: draft.title, tag: draft.tag, studentId: draft.studentId || null, dueDate: draft.dueDate || null });
    if (!r.ok) return setError(r.data?.issues?.[0]?.message ?? r.data?.error ?? "Não foi possível salvar.");
    setEditing(null); setInfo("Tarefa atualizada."); load();
  }
  async function remove(t: Task) {
    if (!window.confirm(`Excluir a tarefa “${t.title}”?`)) return;
    setError(""); setInfo("");
    const r = await api(`/tasks/${t.id}`, "DELETE");
    if (!r.ok) return setError("Não foi possível excluir."); setInfo("Tarefa excluída."); load();
  }
  async function accept(s: Suggestion) {
    setError(""); setInfo("");
    const r = await api("/tasks/suggestions", "POST", { key: s.key });
    if (!r.ok) setError(r.data?.error ?? "Não foi possível criar a tarefa."); else setInfo("Tarefa criada a partir da sugestão.");
    load();
  }

  const col = (s: TaskStatus) => tasks.filter((t) => t.status === s).sort((a, b) => a.position - b.position);
  const studentSelect = (value: string, on: (v: string) => void, id: string) => (
    <select id={id} value={value} onChange={(e) => on(e.target.value)}><option value="">Sem aluno</option>{students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
  );
  const tagSelect = (value: TaskTag, on: (v: TaskTag) => void, id: string) => (
    <select id={id} value={value} onChange={(e) => on(e.target.value as TaskTag)}>{TASK_TAGS.map((t) => <option key={t}>{t}</option>)}</select>
  );

  return (
    <Shell me={me} logout={logout}>
      <h1>Organização</h1>
      <p className="muted">Seu quadro de tarefas. Não é agenda: o prazo é só uma data opcional de lembrete.</p>
      {error && <p className="err flash" role="alert">{error}</p>}{info && <p className="okmsg flash" role="status">{info}</p>}

      <form className="card row" onSubmit={add} aria-label="Nova tarefa">
        <div style={{ flex: "2 1 220px" }}><label htmlFor="nt-t">Nova tarefa</label><input id="nt-t" required maxLength={140} placeholder="Ex.: revisar o treino de quinta" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
        <div><label htmlFor="nt-g">Etiqueta</label>{tagSelect(form.tag, (v) => setForm({ ...form, tag: v }), "nt-g")}</div>
        <div><label htmlFor="nt-s">Aluno</label>{studentSelect(form.studentId, (v) => setForm({ ...form, studentId: v }), "nt-s")}</div>
        <div><label htmlFor="nt-d">Prazo (opcional)</label><input id="nt-d" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
        <button className="btn"><Icon name="check" /> Adicionar</button>
      </form>

      <div className="board" ref={boardRef}>
        {TASK_STATUSES.map((status) => {
          const items = col(status);
          const isOver = over?.status === status && dragId !== null;
          return (
            <section key={status} className={`board-col${isOver ? " over" : ""}`} aria-labelledby={`col-${status}`}
              onDragOver={(e) => { if (!dragId) return; e.preventDefault(); const idx = indexFor(e, status); if (over?.status !== status || over.index !== idx) setOver({ status, index: idx }); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver((o) => (o?.status === status ? null : o)); }}
              onDrop={(e) => onDrop(e, status)}>
              <h2 id={`col-${status}`} className="board-h">{STATUS_LABEL[status]} <span className="count" aria-label={`${items.length} tarefa(s)`}>{items.length}</span></h2>
              {items.length === 0 && <p className="muted board-empty">{EMPTY_HINT[status]}</p>}
              {items.map((t) => (
                <article key={t.id} data-task={t.id} className={`tcard${dragId === t.id ? " dragging" : ""}`} draggable={editing !== t.id}
                  onDragStart={(e) => { e.dataTransfer.setData("text/plain", t.id); e.dataTransfer.effectAllowed = "move"; setDragId(t.id); }}
                  onDragEnd={() => { setDragId(null); setOver(null); }}>
                  {editing === t.id ? (
                    <form onSubmit={(e) => saveEdit(e, t.id)} aria-label={`Editar ${t.title}`}>
                      <label htmlFor={`e-t-${t.id}`}>Título</label><input id={`e-t-${t.id}`} required maxLength={140} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                      <label htmlFor={`e-g-${t.id}`}>Etiqueta</label>{tagSelect(draft.tag, (v) => setDraft({ ...draft, tag: v }), `e-g-${t.id}`)}
                      <label htmlFor={`e-s-${t.id}`}>Aluno</label>{studentSelect(draft.studentId, (v) => setDraft({ ...draft, studentId: v }), `e-s-${t.id}`)}
                      <label htmlFor={`e-d-${t.id}`}>Prazo</label><input id={`e-d-${t.id}`} type="date" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} />
                      <div className="row" style={{ marginTop: 8 }}><button className="btn small">Salvar</button><button type="button" className="btn ghost small" onClick={() => setEditing(null)}>Cancelar</button></div>
                    </form>
                  ) : (
                    <>
                      <div className="tcard-top"><span className="tag">{t.tag}</span>{t.dueDate && <span className="muted">Prazo {fmtDate(t.dueDate)}</span>}</div>
                      <p className={`tcard-title${status === "done" ? " is-done" : ""}`}>{t.title}</p>
                      {t.studentId && <p className="muted tcard-st">Aluno: <Link href={`/personal/alunos/${t.studentId}`}>{t.studentName}</Link></p>}
                      <div className="tcard-actions">
                        <button className="btn ghost small icon-btn" disabled={!neighbor(status, -1)} onClick={() => move(t, neighbor(status, -1)!)} aria-label={neighbor(status, -1) ? `Mover “${t.title}” para ${STATUS_LABEL[neighbor(status, -1)!]}` : `Mover “${t.title}”: não há coluna à esquerda`}>←</button>
                        <button className="btn ghost small icon-btn" disabled={!neighbor(status, 1)} onClick={() => move(t, neighbor(status, 1)!)} aria-label={neighbor(status, 1) ? `Mover “${t.title}” para ${STATUS_LABEL[neighbor(status, 1)!]}` : `Mover “${t.title}”: não há coluna à direita`}>→</button>
                        <button className="btn ghost small" onClick={() => { setEditing(t.id); setDraft({ title: t.title, tag: t.tag, studentId: t.studentId ?? "", dueDate: t.dueDate ?? "" }); }} aria-label={`Editar “${t.title}”`}>Editar</button>
                        <button className="btn ghost small" onClick={() => remove(t)} aria-label={`Excluir “${t.title}”`}>Excluir</button>
                      </div>
                    </>
                  )}
                </article>
              ))}
            </section>
          );
        })}
      </div>

      {suggestions.length > 0 && (
        <section className="card" style={{ marginTop: 16 }} aria-labelledby="sug-h">
          <h2 id="sug-h" style={{ marginTop: 0 }}>Sugestões ({suggestions.length})</h2>
          <p className="muted">Calculadas a partir dos dados reais da consultoria. Um clique cria a tarefa.</p>
          <ul className="sug-list">
            {suggestions.slice(0, 12).map((s) => (
              <li key={s.key} className="row between">
                <span><span className="tag">{s.tag}</span> <strong>{s.title}</strong><br /><span className="muted">{s.reason}</span></span>
                <button className="btn small" onClick={() => accept(s)} aria-label={`Criar tarefa: ${s.title}`}>Criar tarefa</button>
              </li>
            ))}
          </ul>
          {suggestions.length > 12 && <p className="muted">E mais {suggestions.length - 12}. Elas aparecem conforme você resolve as primeiras.</p>}
        </section>
      )}
    </Shell>
  );
}
