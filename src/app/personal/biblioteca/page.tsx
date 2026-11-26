"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { MediaItems } from "../../../components/MediaViewer";
import Skeleton from "../../../components/Skeleton";
import Shell from "../../../components/Shell";
import { api, useMe } from "../../../lib/client";
import type { MediaItem, MediaMode, MediaPref, ResolvedMedia } from "../../../lib/media";

interface Ex { id: string; name: string; muscle: string; equipment: string; official: boolean; primaryMuscles: string[]; secondaryMuscles: string[] }
interface MediaData { exercise: { id: string; name: string; own?: boolean }; official: MediaItem[]; own: MediaItem[]; preferences: MediaPref[]; resolved: ResolvedMedia }
interface Student { id: string; name: string }

function MediaManager({ ex, students }: { ex: Ex; students: Student[] }) {
  const [data, setData] = useState<MediaData | null>(null);
  const [error, setError] = useState(""); const [info, setInfo] = useState("");
  const [title, setTitle] = useState(""); const [url, setUrl] = useState("");
  const [mode, setMode] = useState<MediaMode>("official"); const [ownId, setOwnId] = useState(""); const [scope, setScope] = useState("");
  const [preview, setPreview] = useState("");
  const [shown, setShown] = useState<ResolvedMedia | null>(null);

  const load = useCallback(async (sid = "") => {
    const r = await api(`/exercises/${ex.id}/media${sid ? `?studentId=${sid}` : ""}`);
    if (r.ok) { setData(r.data); setShown(r.data.resolved); }
  }, [ex.id]);
  useEffect(() => { load(); }, [load]);

  async function addVideo(e: FormEvent) {
    e.preventDefault(); setError(""); setInfo("");
    const r = await api(`/exercises/${ex.id}/media`, "POST", { title, url });
    if (!r.ok) return setError(r.data?.error ?? "Não foi possível adicionar");
    setTitle(""); setUrl(""); setInfo("Vídeo adicionado. Defina abaixo quem vai vê-lo."); load(preview);
  }
  async function savePref() {
    setError(""); setInfo("");
    const r = await api(`/exercises/${ex.id}/media-preference`, "PUT", { mode, ownMediaId: mode === "official" ? null : ownId || null, studentId: scope || null });
    if (!r.ok) return setError(r.data?.error ?? "Não foi possível salvar");
    setInfo("Regra salva e registrada na auditoria."); load(preview);
  }

  if (!data) return <Skeleton />;
  const rule = (sid: string | null) => data.preferences.find((p) => p.studentId === sid);
  const label = (m: MediaMode) => ({ official: "só a animação oficial", own: "só o vídeo próprio", both: "animação oficial + vídeo próprio" }[m]);
  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
      <p className="muted">Animação oficial: {data.official.length ? data.official.map((m) => m.title).join(", ") : "ainda não disponível para este exercício"}. Vídeos próprios: {data.own.length}.</p>
      <form className="row" onSubmit={addVideo}>
        <input style={{ flex: 1, minWidth: 140 }} placeholder="Título do vídeo" aria-label="Título do vídeo" required value={title} onChange={(e) => setTitle(e.target.value)} />
        <input style={{ flex: 2, minWidth: 200 }} placeholder="Link https do vídeo" aria-label="Link https do vídeo" required value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="btn small">Adicionar vídeo</button>
      </form>

      <label>O que o aluno vê neste exercício</label>
      <div className="row">
        <select style={{ maxWidth: 260 }} value={mode} onChange={(e) => setMode(e.target.value as MediaMode)} aria-label="Modo de exibição">
          <option value="official">Só a animação oficial</option><option value="own">Só o meu vídeo</option><option value="both">Animação oficial + meu vídeo</option>
        </select>
        {mode !== "official" && (
          <select style={{ maxWidth: 240 }} value={ownId} onChange={(e) => setOwnId(e.target.value)} aria-label="Vídeo próprio">
            <option value="">Escolher vídeo…</option>{data.own.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
        )}
        <select style={{ maxWidth: 220 }} value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Escopo">
          <option value="">Todos os meus alunos</option>{students.map((s) => <option key={s.id} value={s.id}>Só {s.name}</option>)}
        </select>
        <button className="btn small" onClick={savePref}>Salvar regra</button>
      </div>
      <p className="muted">Regra geral: {rule(null) ? label(rule(null)!.mode) : "padrão (animação oficial)"}.
        {data.preferences.filter((p) => p.studentId).map((p) => ` ${students.find((s) => s.id === p.studentId)?.name ?? "Aluno"}: ${label(p.mode)}.`)}</p>

      <label>Pré-visualizar como o aluno vê</label>
      <select style={{ maxWidth: 260 }} value={preview} onChange={(e) => { setPreview(e.target.value); load(e.target.value); }} aria-label="Aluno">
        <option value="">Regra geral</option>{students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <div style={{ marginTop: 8 }}>{shown && <MediaItems resolved={shown} />}</div>
      {error && <p className="err">{error}</p>}{info && <p className="okmsg">{info}</p>}
    </div>
  );
}

export default function Biblioteca() {
  const { me, logout } = useMe("trainer");
  const [list, setList] = useState<Ex[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [q, setQ] = useState(""); const [filter, setFilter] = useState<"all" | "own">("all");
  const [open, setOpen] = useState("");
  const [f, setF] = useState({ name: "", equipment: "", primary: "", secondary: "" });
  const [error, setError] = useState(""); const [info, setInfo] = useState("");

  const load = useCallback(async () => {
    const [e, s] = await Promise.all([api("/exercises"), api("/students")]);
    if (e.ok) setList(e.data); if (s.ok) setStudents(s.data);
  }, []);
  useEffect(() => { if (me) load(); }, [me, load]);

  const shown = useMemo(() => list.filter((x) => (filter === "all" || !x.official) && (x.name + " " + x.muscle + " " + x.equipment).toLowerCase().includes(q.toLowerCase())), [list, q, filter]);
  const split = (t: string) => t.split(",").map((x) => x.trim()).filter(Boolean);

  async function create(e: FormEvent) {
    e.preventDefault(); setError(""); setInfo("");
    const r = await api("/exercises", "POST", { name: f.name, equipment: f.equipment || "Livre", primaryMuscles: split(f.primary), secondaryMuscles: split(f.secondary) });
    if (!r.ok) return setError(r.data?.issues ? "Informe nome e ao menos um músculo primário." : r.data?.error ?? "Não foi possível criar");
    setInfo(`“${f.name}” criado na sua biblioteca privada.`); setF({ name: "", equipment: "", primary: "", secondary: "" }); load();
  }

  return (
    <Shell me={me} logout={logout}>
      <p><Link href="/personal">← Alunos</Link></p>
      <h1>Biblioteca</h1>
      <p className="muted">Catálogo oficial (compartilhado) e os seus exercícios (privados, só da sua consultoria). Defina se o aluno vê a animação oficial, o seu vídeo ou os dois.</p>

      <div className="card">
        <form onSubmit={create}>
          <b className="hf" style={{ fontSize: 12, letterSpacing: ".1em" }}>Novo exercício próprio</b>
          <div className="row" style={{ marginTop: 8 }}>
            <input style={{ flex: 2, minWidth: 180 }} placeholder="Nome" aria-label="Nome" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            <input style={{ flex: 1, minWidth: 120 }} placeholder="Equipamento" aria-label="Equipamento" value={f.equipment} onChange={(e) => setF({ ...f, equipment: e.target.value })} />
            <input style={{ flex: 2, minWidth: 180 }} placeholder="Músculos primários (vírgula)" aria-label="Músculos primários (vírgula)" required value={f.primary} onChange={(e) => setF({ ...f, primary: e.target.value })} />
            <input style={{ flex: 2, minWidth: 180 }} placeholder="Secundários (vírgula)" aria-label="Secundários (vírgula)" value={f.secondary} onChange={(e) => setF({ ...f, secondary: e.target.value })} />
            <button className="btn small">Criar</button>
          </div>
        </form>
        {error && <p className="err">{error}</p>}{info && <p className="okmsg">{info}</p>}
      </div>

      <div className="row" style={{ margin: "12px 0" }}>
        <input style={{ flex: 1, minWidth: 200 }} placeholder="Buscar por nome, músculo ou equipamento" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
        <select style={{ maxWidth: 200 }} value={filter} onChange={(e) => setFilter(e.target.value as "all" | "own")} aria-label="Origem">
          <option value="all">Oficiais e próprios</option><option value="own">Só os meus</option>
        </select>
      </div>

      {shown.map((x) => (
        <div className="card" key={x.id}>
          <div className="row between">
            <span><b>{x.name}</b> <span className="tag">{x.official ? "Oficial" : "Próprio"}</span>
              <div className="muted">{x.primaryMuscles.join(", ")}{x.secondaryMuscles.length ? ` · secundários: ${x.secondaryMuscles.join(", ")}` : ""} · {x.equipment}</div></span>
            <button className="btn ghost small" onClick={() => setOpen(open === x.id ? "" : x.id)}>{open === x.id ? "Fechar" : "Mídia"}</button>
          </div>
          {open === x.id && <MediaManager ex={x} students={students} />}
        </div>
      ))}
      {shown.length === 0 && <p className="muted">Nenhum exercício encontrado.</p>}
    </Shell>
  );
}
