"use client";
// Seletor de exercícios do editor de treino. Ideias de uso corrente em apps de prescrição (abas Favoritos / Exercícios do app /
// Seus exercícios, filtros, "Adicionar" e "Usar preset padrão", gaveta "Exercícios adicionados"), sobre o NOSSO modelo:
// cada exercício entra com séries prescritas individualmente; nada aqui altera treino publicado.
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/client";
import { APP_PRESETS, appPreset, cloneSets, DEFAULT_PRESET_ID, describeSets, type PresetSet } from "../lib/setPresets";
import Icon from "./Icon";

export interface PickerExercise { id: string; name: string; muscle: string; equipment: string; official: boolean; primaryMuscles: string[]; secondaryMuscles: string[] }
export interface MyPreset { id: string; name: string; sets: PresetSet[] }
type Tab = "fav" | "app" | "mine";
const MAX_EXERCISES = 30; // limite da prescrição no servidor

interface Props {
  catalog: PickerExercise[];
  favorites: Set<string>;
  myPresets: MyPreset[];
  added: { exerciseId: string }[];          // exercícios que já estão no treino, na ordem
  onToggleFavorite: (id: string) => void;
  onAdd: (exerciseId: string, sets: PresetSet[] | null) => void;   // sets nulo = séries em branco padrão
  onRemoveAt: (index: number) => void;
  onCatalogChanged: () => Promise<void> | void;
  onClose: () => void;
}

export default function ExercisePicker({ catalog, favorites, myPresets, added, onToggleFavorite, onAdd, onRemoveAt, onCatalogChanged, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("app");
  const [q, setQ] = useState(""); const [muscle, setMuscle] = useState(""); const [equip, setEquip] = useState("");
  const [drawer, setDrawer] = useState(false); const [creating, setCreating] = useState(false);
  const [flash, setFlash] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null); const searchRef = useRef<HTMLInputElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    opener.current = document.activeElement; searchRef.current?.focus();
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; if (opener.current instanceof HTMLElement) opener.current.focus(); };
  }, []);
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") { e.stopPropagation(); if (drawer) setDrawer(false); else onClose(); return; }
    if (e.key !== "Tab") return;            // mantém o foco dentro do diálogo
    const els = [...(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input, select, textarea, [href]") ?? [])].filter((x) => x.offsetParent !== null);
    if (!els.length) return;
    const first = els[0], last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  const muscles = useMemo(() => [...new Set(catalog.flatMap((c) => c.primaryMuscles))].sort((a, b) => a.localeCompare(b, "pt-BR")), [catalog]);
  const equipments = useMemo(() => [...new Set(catalog.map((c) => c.equipment).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")), [catalog]);
  const byId = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return catalog.filter((c) =>
      (tab === "fav" ? favorites.has(c.id) : tab === "app" ? c.official : !c.official)
      && (!muscle || c.primaryMuscles.includes(muscle)) && (!equip || c.equipment === equip)
      && (!t || `${c.name} ${c.muscle} ${c.equipment}`.toLowerCase().includes(t)));
  }, [catalog, tab, q, muscle, equip, favorites]);
  const counts = useMemo(() => ({ fav: catalog.filter((c) => favorites.has(c.id)).length, app: catalog.filter((c) => c.official).length, mine: catalog.filter((c) => !c.official).length }), [catalog, favorites]);
  const full = added.length >= MAX_EXERCISES;

  function add(c: PickerExercise, sets: PresetSet[] | null, label: string) {
    if (full) return;
    onAdd(c.id, sets); setFlash(`${c.name} adicionado${label ? ` (${label})` : ""}. No treino: ${added.length + 1}.`);
  }
  function addWith(c: PickerExercise, value: string) {
    if (!value) return;
    const [kind, id] = value.split(":");
    if (kind === "app") { const p = appPreset(id); if (p) add(c, cloneSets(p.sets), p.name); }
    else { const p = myPresets.find((x) => x.id === id); if (p) add(c, cloneSets(p.sets), p.name); }
  }

  // ---- criar exercício próprio
  const [nf, setNf] = useState({ name: "", muscle: "", equipment: "Livre", fav: false }); const [nerr, setNerr] = useState(""); const [busy, setBusy] = useState(false);
  async function create(e: FormEvent) {
    e.preventDefault(); setNerr(""); setBusy(true);
    const r = await api("/exercises", "POST", { name: nf.name, equipment: nf.equipment || "Livre", primaryMuscles: [nf.muscle], secondaryMuscles: [] });
    if (!r.ok) { setBusy(false); return setNerr(r.data?.error ?? (r.data?.issues ? "Informe o nome e o grupo muscular." : "Não foi possível criar")); }
    if (nf.fav) await api(`/exercises/${r.data.id}/favorite`, "PUT", { favorite: true });
    await onCatalogChanged(); if (nf.fav) onToggleFavorite(r.data.id);
    setFlash(`“${nf.name}” criado em Seus exercícios.`); setNf({ name: "", muscle: "", equipment: "Livre", fav: false }); setCreating(false); setBusy(false); setTab("mine");
  }

  return createPortal(
    <div className="pk-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pk-dialog" role="dialog" aria-modal="true" aria-labelledby="pk-title" ref={dialogRef} onKeyDown={onKey}>
        <header className="pk-head">
          <h2 id="pk-title" className="pk-title">Biblioteca de exercícios</h2>
          <button type="button" className="btn ghost small" onClick={onClose}><Icon name="check" />Concluir</button>
        </header>

        <div className="pk-body">
          {!creating ? (
            <button type="button" className="pk-create" onClick={() => setCreating(true)}>+ Criar exercício</button>
          ) : (
            <form className="card" onSubmit={create}>
              <b className="hf" style={{ fontSize: 12, letterSpacing: ".1em" }}>Novo exercício próprio</b>
              <label htmlFor="pk-n">Nome</label>
              <input id="pk-n" required maxLength={80} value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} />
              <label htmlFor="pk-m">Grupo muscular</label>
              <select id="pk-m" required value={nf.muscle} onChange={(e) => setNf({ ...nf, muscle: e.target.value })}>
                <option value="">Selecione o grupo muscular</option>{muscles.map((m) => <option key={m}>{m}</option>)}
              </select>
              <label htmlFor="pk-e">Equipamento</label>
              <select id="pk-e" value={nf.equipment} onChange={(e) => setNf({ ...nf, equipment: e.target.value })}>
                <option>Livre</option>{equipments.filter((x) => x !== "Livre").map((m) => <option key={m}>{m}</option>)}
              </select>
              <label className="pk-check"><input type="checkbox" checked={nf.fav} onChange={(e) => setNf({ ...nf, fav: e.target.checked })} /> Adicionar aos favoritos</label>
              {nerr && <p className="err" role="alert">{nerr}</p>}
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn small" disabled={busy || !nf.name.trim() || !nf.muscle}>Salvar</button>
                <button type="button" className="btn ghost small" onClick={() => { setCreating(false); setNerr(""); }}>Cancelar</button>
              </div>
            </form>
          )}

          <input ref={searchRef} className="pk-search" type="search" placeholder="Buscar exercícios…" aria-label="Buscar exercícios" value={q} onChange={(e) => setQ(e.target.value)} />
          <div role="tablist" aria-label="Origem dos exercícios" className="pk-tabs">
            {([["fav", "Favoritos"], ["app", "Exercícios do app"], ["mine", "Seus exercícios"]] as [Tab, string][]).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className={`pk-tab${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>{l} <span className="pk-n">{counts[k]}</span></button>
            ))}
          </div>
          <div className="pk-filters">
            <select aria-label="Grupo muscular" value={muscle} onChange={(e) => setMuscle(e.target.value)}><option value="">Grupos musculares</option>{muscles.map((m) => <option key={m}>{m}</option>)}</select>
            <select aria-label="Equipamento" value={equip} onChange={(e) => setEquip(e.target.value)}><option value="">Equipamentos</option>{equipments.map((m) => <option key={m}>{m}</option>)}</select>
            <button type="button" className="btn ghost small" onClick={() => { setQ(""); setMuscle(""); setEquip(""); }}>Limpar</button>
          </div>

          <p className="sr-only" role="status" aria-live="polite">{flash}</p>
          {flash && <p className="okmsg pk-flash" aria-hidden="true">{flash}</p>}
          {full && <p className="err" role="alert">O treino já tem {MAX_EXERCISES} exercícios, o limite por treino.</p>}

          <ul className="pk-list">
            {shown.map((c) => {
              const fav = favorites.has(c.id);
              return (
                <li key={c.id} className="pk-card">
                  <div className="pk-card-top">
                    <div>
                      <b className="pk-name">{c.name}</b>
                      <div className="pk-tags"><span className="tag">{c.muscle}</span><span className="tag">{c.equipment}</span>{!c.official && <span className="tag">Próprio</span>}</div>
                      {c.secondaryMuscles.length > 0 && <div className="muted" style={{ fontSize: 12 }}>Secundários: {c.secondaryMuscles.join(", ")}</div>}
                    </div>
                    <button type="button" className={`pk-star${fav ? " on" : ""}`} aria-pressed={fav} aria-label={`${fav ? "Remover dos favoritos" : "Favoritar"}: ${c.name}`} onClick={() => onToggleFavorite(c.id)}>{fav ? "★" : "☆"}</button>
                  </div>
                  <div className="pk-actions">
                    <button type="button" className="btn ghost small" disabled={full} onClick={() => add(c, null, "")}>+ Adicionar</button>
                    <button type="button" className="btn ghost small" disabled={full} onClick={() => add(c, cloneSets(appPreset(DEFAULT_PRESET_ID)!.sets), "3×12")}>Usar preset padrão</button>
                    <select aria-label={`Adicionar ${c.name} com outro preset`} disabled={full} value="" onChange={(e) => { addWith(c, e.target.value); e.target.value = ""; }}>
                      <option value="">Outro preset…</option>
                      <optgroup label="Presets do app">{APP_PRESETS.map((p) => <option key={p.id} value={`app:${p.id}`}>{p.name}</option>)}</optgroup>
                      {myPresets.length > 0 && <optgroup label="Seus presets">{myPresets.map((p) => <option key={p.id} value={`mine:${p.id}`}>{p.name} ({describeSets(p.sets)})</option>)}</optgroup>}
                    </select>
                  </div>
                </li>
              );
            })}
          </ul>
          {shown.length === 0 && <p className="muted">{tab === "fav" ? "Nenhum favorito ainda. Toque na estrela de um exercício." : tab === "mine" ? "Você ainda não criou exercícios próprios." : "Nenhum exercício encontrado."}</p>}
        </div>

        <button type="button" className="pk-bar" aria-expanded={drawer} onClick={() => setDrawer(true)}>
          <span>Exercícios adicionados <span className="pk-count">{added.length}</span></span><span aria-hidden="true">›</span>
        </button>

        {drawer && (
          <aside className="pk-drawer" aria-label="Exercícios adicionados ao treino">
            <header className="pk-drawer-head">
              <button type="button" className="pk-back" aria-label="Voltar à biblioteca" onClick={() => setDrawer(false)}>‹</button>
              <b>Exercícios adicionados</b><span className="pk-count">{added.length}</span>
            </header>
            {added.length === 0 ? <p className="muted" style={{ padding: 16 }}>Nenhum exercício no treino ainda.</p> : (
              <ol className="pk-added">
                {added.map((a, i) => (
                  <li key={i}>
                    <span>{byId.get(a.exerciseId)?.name ?? "Exercício"}</span>
                    <button type="button" className="pk-trash" aria-label={`Remover ${byId.get(a.exerciseId)?.name ?? "exercício"} do treino`} onClick={() => onRemoveAt(i)}><Icon name="trash" /></button>
                  </li>
                ))}
              </ol>
            )}
          </aside>
        )}
      </div>
    </div>,
    document.body,
  );
}
