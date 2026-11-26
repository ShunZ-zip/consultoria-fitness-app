"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { cloneElement, Suspense, useEffect, useId, useMemo, useState } from "react";
import ExercisePicker, { type MyPreset } from "../../../../components/ExercisePicker";
import Shell from "../../../../components/Shell";
import { api, useMe } from "../../../../lib/client";
import { APP_PRESETS, appPreset, cloneSets, type PresetSet } from "../../../../lib/setPresets";
import { computeVolume, DEFAULT_INDIRECT_WEIGHT, type SetType } from "../../../../lib/volume";

interface Student { id: string; name: string }
interface Exercise { id: string; name: string; muscle: string; equipment: string; official: boolean; primaryMuscles: string[]; secondaryMuscles: string[] }
interface SetForm {
  setType: SetType; reps: string; repsMax: string; loadKg: string; loadPct: string;
  rir: string; rpe: string; restS: string; tempo: string; note: string;
}
// key e open são só da tela (identidade estável e linha recolhida); não vão para o servidor.
interface ExForm { key: string; open: boolean; exerciseId: string; alternativeIds: string[]; sets: SetForm[] }

const emptySet = (o: Partial<SetForm> = {}): SetForm => ({
  setType: "work", reps: "10", repsMax: "", loadKg: "", loadPct: "", rir: "", rpe: "", restS: "60", tempo: "", note: "", ...o,
});
const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
const txt = (n: number | null | undefined) => (n == null ? "" : String(n));
let seq = 0; const nk = () => `k${++seq}`;
const fromPreset = (s: PresetSet): SetForm => ({ setType: s.setType, reps: txt(s.reps), repsMax: txt(s.repsMax), loadKg: txt(s.loadKg), loadPct: txt(s.loadPct), rir: txt(s.rir), rpe: txt(s.rpe), restS: txt(s.restS), tempo: s.tempo ?? "", note: s.note ?? "" });
const toPreset = (s: SetForm): PresetSet => ({ setType: s.setType, reps: num(s.reps), repsMax: num(s.repsMax), loadKg: num(s.loadKg), loadPct: num(s.loadPct), rir: num(s.rir), rpe: num(s.rpe), restS: num(s.restS), tempo: s.tempo.trim() || null, note: s.note.trim() || null });

/** Converte o que a API devolve (treino ou modelo) para o formulário. */
function fromApi(exercises: any[]): ExForm[] {
  return exercises.map((e) => ({
    key: nk(), open: exercises.length <= 3, exerciseId: e.exerciseId, alternativeIds: e.alternativeIds ?? [],
    sets: e.sets.map((s: any) => ({
      setType: s.setType ?? "work", reps: txt(s.reps), repsMax: txt(s.repsMax), loadKg: txt(s.loadKg), loadPct: txt(s.loadPct),
      rir: txt(s.rir), rpe: txt(s.rpe), restS: txt(s.restS), tempo: s.tempo ?? "", note: s.note ?? "",
    })),
  }));
}
const toPayload = (items: ExForm[]) => items.map((e) => ({
  exerciseId: e.exerciseId, alternativeIds: e.alternativeIds,
  sets: e.sets.map((s) => ({
    setType: s.setType, reps: num(s.reps), repsMax: num(s.repsMax), loadKg: num(s.loadKg), loadPct: num(s.loadPct),
    rir: num(s.rir), rpe: num(s.rpe), restS: num(s.restS), tempo: s.tempo.trim() || null, note: s.note.trim() || null,
  })),
}));

function Field({ label, children }: { label: string; children: React.ReactElement<{ id?: string }> }) {
  const id = useId();
  return <div><label htmlFor={id} style={{ margin: "0 0 3px", fontSize: 11 }}>{label}</label>{cloneElement(children, { id })}</div>;
}

function Builder() {
  const { me, logout } = useMe("trainer");
  const router = useRouter();
  const params = useSearchParams();
  const editId = params.get("editar");       // editar rascunho existente
  const copyId = params.get("copiar");       // começar a partir de outro treino
  const tplId = params.get("modelo");        // começar a partir de um modelo

  const [students, setStudents] = useState<Student[]>([]);
  const [catalog, setCatalog] = useState<Exercise[]>([]);
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([]);
  const [weight, setWeight] = useState(DEFAULT_INDIRECT_WEIGHT);
  const [studentId, setStudentId] = useState(params.get("aluno") ?? "");
  const [name, setName] = useState("Treino A");
  const [freq, setFreq] = useState("");
  const [items, setItems] = useState<ExForm[] | null>(null);
  const [tplName, setTplName] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [myPresets, setMyPresets] = useState<MyPreset[]>([]);
  const [savingFor, setSavingFor] = useState(""); const [presetName, setPresetName] = useState("");

  useEffect(() => {
    if (!me) return;
    (async () => {
      const [s, c, t, st, fv, pr] = await Promise.all([api("/students"), api("/exercises"), api("/templates"), api("/settings"), api("/exercises/favorites"), api("/set-presets")]);
      if (fv.ok) setFavorites(new Set(fv.data as string[]));
      if (pr.ok) setMyPresets(pr.data.mine);
      if (s.ok) setStudents(s.data);
      if (t.ok) setTemplates(t.data);
      if (st.ok) setWeight(st.data.indirectWeight);
      const cat: Exercise[] = c.ok ? c.data : [];
      setCatalog(cat);
      const blank: ExForm[] = [];
      if (editId || copyId) {
        const v = await api(`/versions/${editId ?? copyId}`);
        if (!v.ok) { setError("Treino não encontrado."); setItems(blank); return; }
        if (editId && v.data.status !== "draft") { setError("Só rascunhos podem ser editados. Use “Nova versão”."); setItems(blank); return; }
        setName(editId ? v.data.name : `${v.data.name} (cópia)`);
        setFreq(v.data.weeklyFrequency ? String(v.data.weeklyFrequency) : "");
        if (editId) setStudentId(v.data.studentId);
        setItems(fromApi(v.data.exercises));
      } else if (tplId) {
        const m = await api(`/templates/${tplId}`);
        if (m.ok) { setName(m.data.name); setItems(fromApi(m.data.exercises)); } else { setError("Modelo não encontrado."); setItems(blank); }
      } else setItems(blank);
    })();
  }, [me, editId, copyId, tplId]);

  const list = items ?? [];
  const byId = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);
  const volume = useMemo(() => computeVolume(
    list.map((e) => ({
      primary: byId.get(e.exerciseId)?.primaryMuscles ?? [], secondary: byId.get(e.exerciseId)?.secondaryMuscles ?? [],
      sets: e.sets.map((s) => ({ setType: s.setType })),
    })), weight), [list, byId, weight]);

  const setList = (fn: (x: ExForm[]) => ExForm[]) => setItems((cur) => fn(cur ?? []));
  const patchSet = (i: number, j: number, k: keyof SetForm, v: string) =>
    setList((xs) => xs.map((e, x) => (x !== i ? e : { ...e, sets: e.sets.map((s, y) => (y !== j ? s : { ...s, [k]: v })) })));
  const move = (i: number, d: -1 | 1) => setList((xs) => {
    const k = i + d; if (k < 0 || k >= xs.length) return xs;
    const c = [...xs]; [c[i], c[k]] = [c[k], c[i]]; return c;
  });

  const addExercise = (exerciseId: string, sets: PresetSet[] | null) => setList((xs) => [...xs, {
    key: nk(), open: true, exerciseId, alternativeIds: [], sets: sets ? sets.map(fromPreset) : [emptySet(), emptySet(), emptySet()],
  }]);
  const reloadCatalog = async () => { const c = await api("/exercises"); if (c.ok) setCatalog(c.data); };
  async function toggleFavorite(id: string) {
    const on = !favorites.has(id);
    setFavorites((f) => { const n = new Set(f); if (on) n.add(id); else n.delete(id); return n; });
    const r = await api(`/exercises/${id}/favorite`, "PUT", { favorite: on });
    if (!r.ok) setFavorites((f) => { const n = new Set(f); if (on) n.delete(id); else n.add(id); return n; });
  }
  function applyPreset(i: number, value: string) {
    if (!value) return;
    const [kind, id] = value.split(":");
    const found = kind === "app" ? appPreset(id) : myPresets.find((p) => p.id === id);
    if (!found) return;
    setList((xs) => xs.map((x, y) => (y === i ? { ...x, sets: cloneSets(found.sets).map(fromPreset) } : x)));
    setError(""); setInfo(`Preset “${found.name}” aplicado: as séries deste exercício foram substituídas. Ajuste se quiser.`);
  }
  async function savePreset(i: number) {
    setError(""); setInfo("");
    const r = await api("/set-presets", "POST", { name: presetName, sets: list[i].sets.map(toPreset) });
    if (!r.ok) return setError(r.data?.issues?.[0]?.message ? `${r.data.error}: ${r.data.issues[0].message}` : r.data?.error ?? "Não foi possível salvar o preset");
    setMyPresets((m) => [...m, { id: r.data.id, name: r.data.name, sets: r.data.sets }]);
    setInfo(`Preset “${r.data.name}” salvo em Seus presets.`); setSavingFor(""); setPresetName("");
  }
  const workSets = list.reduce((n, e) => n + e.sets.filter((s) => s.setType === "work").length, 0);
  const setAllOpen = (open: boolean) => setList((xs) => xs.map((x) => ({ ...x, open })));

  const invalid = list.length === 0 || list.some((e) => e.sets.length === 0 || !e.exerciseId);

  function fail(r: { data: any }) {
    setError(r.data?.issues?.[0]?.message ? `${r.data.error}: ${r.data.issues[0].message}` : r.data?.error ?? "Falha ao salvar");
    setBusy(false);
  }

  async function save(publish: boolean) {
    setError(""); setInfo("");
    if (!studentId) return setError("Escolha o aluno.");
    setBusy(true);
    if (editId) {
      const r = await api(`/versions/${editId}`, "PUT", { name, weeklyFrequency: freq ? Number(freq) : null, exercises: toPayload(list) });
      if (!r.ok) return fail(r);
      if (publish) { const p = await api(`/versions/${editId}/publish`, "POST"); if (!p.ok) return fail(p); }
      return router.replace(`/personal/treinos/${editId}`);
    }
    const r = await api("/versions", "POST", { studentId, name, publish, weeklyFrequency: freq ? Number(freq) : null, exercises: toPayload(list) });
    if (!r.ok) return fail(r);
    router.replace(`/personal/treinos/${r.data.id}`);
  }

  async function saveTemplate() {
    setError(""); setInfo("");
    if (!tplName.trim()) return setError("Dê um nome ao modelo.");
    const r = await api("/templates", "POST", { name: tplName, exercises: toPayload(list) });
    if (!r.ok) return fail(r);
    setInfo(`Modelo “${tplName}” salvo.`); setTplName("");
    const t = await api("/templates"); if (t.ok) setTemplates(t.data);
  }

  async function loadTemplate(id: string) {
    if (!id) return;
    const m = await api(`/templates/${id}`);
    if (m.ok) { setItems(fromApi(m.data.exercises)); setInfo(`Modelo “${m.data.name}” carregado. Ajuste e salve.`); }
  }

  const title = editId ? "Editar rascunho" : "Novo treino";
  return (
    <Shell me={me} logout={logout}>
      <h1>{title}</h1>
      <div className="card">
        <div className="row">
          <div style={{ flex: 1, minWidth: 200 }}>
            <label htmlFor="al">Aluno</label>
            <select id="al" value={studentId} disabled={!!editId} onChange={(e) => setStudentId(e.target.value)}>
              <option value="">Selecione…</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label htmlFor="nm">Nome do treino</label>
            <input id="nm" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label htmlFor="fq">Sessões por semana (opcional)</label>
            <select id="fq" value={freq} onChange={(e) => setFreq(e.target.value)}>
              <option value="">Não definida</option>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}×</option>)}
            </select>
          </div>
          {!editId && templates.length > 0 && (
            <div style={{ flex: 1, minWidth: 200 }}>
              <label htmlFor="tp">Carregar modelo</label>
              <select id="tp" value="" onChange={(e) => loadTemplate(e.target.value)}>
                <option value="">Escolher…</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="card row between" data-testid="summary" style={{ marginTop: 12 }}>
        <span><b>{list.length}</b> {list.length === 1 ? "exercício" : "exercícios"} · <b>{workSets}</b> {workSets === 1 ? "série de trabalho" : "séries de trabalho"}</span>
        <span className="row" style={{ gap: 6 }}>
          {volume.filter((m) => m.direct > 0).slice(0, 6).map((m) => <span className="tag" key={m.muscle}>{m.muscle} {m.direct}</span>)}
        </span>
      </div>
      <div className="row between" style={{ margin: "12px 0" }}>
        <button type="button" className="btn small" onClick={() => setPicker(true)}>+ Adicionar exercício</button>
        {list.length > 1 && (
          <span className="row">
            <button type="button" className="btn ghost small" onClick={() => setAllOpen(true)}>Expandir todos</button>
            <button type="button" className="btn ghost small" onClick={() => setAllOpen(false)}>Recolher todos</button>
          </span>
        )}
      </div>
      {list.length === 0 && <p className="muted">Nenhum exercício ainda. Toque em “Adicionar exercício” para abrir a biblioteca.</p>}

      {list.map((it, i) => (
        <div className="card" key={it.key}>
          <div className="row between">
            <button type="button" className="ex-toggle" aria-expanded={it.open} onClick={() => setList((xs) => xs.map((x, y) => (y === i ? { ...x, open: !x.open } : x)))}>
              <span className="ex-chev" aria-hidden="true">{it.open ? "▾" : "▸"}</span>
              <span><b>{i + 1}. {byId.get(it.exerciseId)?.name ?? "Exercício"}</b>
                <span className="muted"> · {it.sets.length} {it.sets.length === 1 ? "série" : "séries"}{byId.get(it.exerciseId) ? ` · ${byId.get(it.exerciseId)!.muscle}` : ""}</span></span>
            </button>
            <span className="row">
              <button className="btn ghost small" aria-label="Subir exercício" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button className="btn ghost small" aria-label="Descer exercício" disabled={i === list.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button className="btn ghost small" onClick={() => setList((xs) => [...xs.slice(0, i + 1), { ...it, key: nk(), sets: it.sets.map((s) => ({ ...s })) }, ...xs.slice(i + 1)])}>Duplicar</button>
              <button className="btn ghost small" onClick={() => setList((xs) => xs.filter((_, y) => y !== i))}>Remover</button>
            </span>
          </div>
          {it.open && (<>
          <div style={{ marginTop: 10 }}>
            <label htmlFor={`ex-${it.key}`} style={{ margin: "0 0 4px", fontSize: 11 }}>Exercício</label>
            <select id={`ex-${it.key}`} style={{ maxWidth: 380 }} value={it.exerciseId} onChange={(e) => setList((xs) => xs.map((x, y) => (y === i ? { ...x, exerciseId: e.target.value, alternativeIds: x.alternativeIds.filter((z) => z !== e.target.value) } : x)))}>
              {catalog.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.muscle}</option>)}
            </select>
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={{ margin: "0 0 4px", fontSize: 11 }}>Alternativas autorizadas (o aluno só as usa se a permissão estiver liberada)</label>
            <div className="row">
              {it.alternativeIds.map((aid) => (
                <span className="tag" key={aid} style={{ textTransform: "none" }}>
                  {byId.get(aid)?.name ?? "?"}{" "}
                  <button aria-label="Remover alternativa" style={{ background: "none", border: 0, color: "inherit", cursor: "pointer" }}
                    onClick={() => setList((xs) => xs.map((x, y) => (y === i ? { ...x, alternativeIds: x.alternativeIds.filter((z) => z !== aid) } : x)))}>×</button>
                </span>
              ))}
              {it.alternativeIds.length < 8 && (
                <select style={{ maxWidth: 240 }} value="" aria-label="Adicionar alternativa"
                  onChange={(e) => e.target.value && setList((xs) => xs.map((x, y) => (y === i ? { ...x, alternativeIds: [...x.alternativeIds, e.target.value] } : x)))}>
                  <option value="">+ alternativa…</option>
                  {catalog.filter((c) => c.id !== it.exerciseId && !it.alternativeIds.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
            </div>
          </div>
          {it.sets.map((s, j) => (
            <div key={j} style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
              <div className="row between" style={{ marginBottom: 6 }}>
                <b>Série {j + 1}</b>
                <span className="row">
                  <button className="btn ghost small" onClick={() => setList((xs) => xs.map((x, y) => (y === i ? { ...x, sets: [...x.sets, { ...s }] } : x)))}>Duplicar</button>
                  <button className="btn ghost small" aria-label="Remover série" onClick={() => setList((xs) => xs.map((x, y) => (y === i ? { ...x, sets: x.sets.filter((_, z) => z !== j) } : x)))}>×</button>
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(112px, 1fr))", gap: 8 }}>
                <Field label="Tipo">
                  <select value={s.setType} onChange={(e) => patchSet(i, j, "setType", e.target.value)}>
                    <option value="work">Trabalho</option><option value="warmup">Aquecimento</option><option value="prep">Preparação</option>
                  </select>
                </Field>
                <Field label="Reps"><input inputMode="numeric" value={s.reps} onChange={(e) => patchSet(i, j, "reps", e.target.value)} /></Field>
                <Field label="Até (faixa)"><input inputMode="numeric" value={s.repsMax} onChange={(e) => patchSet(i, j, "repsMax", e.target.value)} /></Field>
                <Field label="Carga (kg)"><input inputMode="decimal" value={s.loadKg} onChange={(e) => patchSet(i, j, "loadKg", e.target.value)} /></Field>
                <Field label="% de 1RM"><input inputMode="decimal" value={s.loadPct} onChange={(e) => patchSet(i, j, "loadPct", e.target.value)} /></Field>
                <Field label="RIR"><input inputMode="numeric" value={s.rir} onChange={(e) => patchSet(i, j, "rir", e.target.value)} /></Field>
                <Field label="RPE"><input inputMode="decimal" value={s.rpe} onChange={(e) => patchSet(i, j, "rpe", e.target.value)} /></Field>
                <Field label="Descanso (s)"><input inputMode="numeric" value={s.restS} onChange={(e) => patchSet(i, j, "restS", e.target.value)} /></Field>
                <Field label="Cadência"><input placeholder="3-1-1-0" value={s.tempo} onChange={(e) => patchSet(i, j, "tempo", e.target.value)} /></Field>
              </div>
              <div style={{ marginTop: 8 }}>
                <Field label="Orientação (opcional)"><input value={s.note} onChange={(e) => patchSet(i, j, "note", e.target.value)} /></Field>
              </div>
            </div>
          ))}
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn ghost small" onClick={() => setList((xs) => xs.map((x, y) => (y === i ? { ...x, sets: [...x.sets, emptySet(x.sets.at(-1) ?? {})] } : x)))}>+ Série</button>
            <select style={{ maxWidth: 220 }} aria-label={`Aplicar preset de séries em ${byId.get(it.exerciseId)?.name ?? "exercício"}`} value="" onChange={(e) => applyPreset(i, e.target.value)}>
              <option value="">Aplicar preset…</option>
              <optgroup label="Presets do app">{APP_PRESETS.map((p) => <option key={p.id} value={`app:${p.id}`}>{p.name}</option>)}</optgroup>
              {myPresets.length > 0 && <optgroup label="Seus presets">{myPresets.map((p) => <option key={p.id} value={`mine:${p.id}`}>{p.name}</option>)}</optgroup>}
            </select>
            {savingFor === it.key ? (
              <>
                <input style={{ maxWidth: 200 }} placeholder="Nome do preset" aria-label="Nome do preset" value={presetName} onChange={(e) => setPresetName(e.target.value)} />
                <button className="btn small" disabled={!presetName.trim()} onClick={() => savePreset(i)}>Salvar</button>
                <button className="btn ghost small" onClick={() => { setSavingFor(""); setPresetName(""); }}>Cancelar</button>
              </>
            ) : <button className="btn ghost small" onClick={() => { setSavingFor(it.key); setPresetName(""); }}>Salvar como preset</button>}
          </div>
          </>)}
        </div>
      ))}


      <h2>Volume desta sessão</h2>
      <div className="card" data-testid="volume">
        {volume.length === 0 ? <p className="muted">Sem séries.</p> : (
          <table>
            <thead><tr><th>Músculo</th><th className="num">Diretas</th><th className="num">Indiretas</th><th className="num">Ponderado</th><th className="num">Aquec.</th><th className="num">Prep.</th></tr></thead>
            <tbody>
              {volume.map((m) => (
                <tr key={m.muscle}><td>{m.muscle}</td><td className="num">{m.direct}</td><td className="num">{m.indirect}</td>
                  <td className="num"><b>{m.weighted}</b></td><td className="num">{m.warmup}</td><td className="num">{m.prep}</td></tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted">Ponderado = diretas + indiretas × {weight} (peso da sua consultoria). Só séries de trabalho entram; aquecimento e preparação aparecem à parte. Taxonomia muscular provisória.</p>
      </div>

      {error && <p className="err">{error}</p>}
      {info && <p className="okmsg">{info}</p>}
      <div className="row" style={{ marginTop: 20 }}>
        <button className="btn" disabled={busy || invalid} onClick={() => save(true)}>{editId ? "Salvar e publicar" : "Publicar para o aluno"}</button>
        <button className="btn ghost" disabled={busy || invalid} onClick={() => save(false)}>Salvar rascunho</button>
      </div>
      <div className="row" style={{ marginTop: 14 }}>
        <input style={{ maxWidth: 260 }} placeholder="Nome do modelo" aria-label="Nome do modelo" value={tplName} onChange={(e) => setTplName(e.target.value)} />
        <button className="btn ghost small" disabled={invalid} onClick={saveTemplate}>Salvar como modelo</button>
      </div>
      <p className="muted">Depois de publicado, o treino não pode mais ser editado: mudanças geram uma nova versão e a anterior fica preservada.</p>
      {picker && (
        <ExercisePicker catalog={catalog} favorites={favorites} myPresets={myPresets} added={list}
          onToggleFavorite={toggleFavorite} onAdd={addExercise} onRemoveAt={(i) => setList((xs) => xs.filter((_, y) => y !== i))}
          onCatalogChanged={reloadCatalog} onClose={() => setPicker(false)} />
      )}
    </Shell>
  );
}

export default function NovoTreino() {
  return <Suspense fallback={<p className="muted" style={{ padding: 24 }}>Carregando…</p>}><Builder /></Suspense>;
}
