"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "../../../../components/Icon";
import MediaViewer from "../../../../components/MediaViewer";
import Shell from "../../../../components/Shell";
import { api, apiCached, useMe } from "../../../../lib/client";
import { prescribedText, SET_TYPE_LABEL, type PrescribedSetView } from "../../../../lib/format";
import type { Permissions } from "../../../../lib/permissions";
import { SyncQueue, type QueuedOp, type Sender } from "../../../../lib/syncQueue";
import type { MuscleVolume } from "../../../../lib/volume";

interface PSet extends PrescribedSetView { id: string; position: number }
interface PEx { id: string; exerciseId: string; name: string; alternatives: { id: string; name: string }[]; sets: PSet[] }
interface Detail { id: string; name: string; isCurrent: boolean; version: number; exercises: PEx[] }
interface Logged { id: string; versionSetId: string | null; versionExerciseId: string | null; extraExerciseId: string | null; position: number | null; reps: number | null; loadKg: number | null; rir: number | null; restS: number | null; note: string | null }
interface Extra { id: string; exerciseId: string; name: string; position: number }
interface Log { id: string; finishedAt: string | null; exerciseOrder: string[] | null; substitutions: { versionExerciseId: string; exerciseId: string; name: string }[]; extraExercises: Extra[]; sets: Logged[] }
interface Form { setId: string; reps: string; loadKg: string; rir: string; restS: string; saved: boolean }
interface CatalogItem { id: string; name: string; muscle: string }
type LastMap = Record<string, { date: string; best: { reps: number | null; loadKg: number | null } | null; sets: { reps: number | null; loadKg: number | null; rir: number | null }[] }>;

// Chaves dos formulários: série prescrita, série extra de exercício prescrito, série de exercício extra.
const kSet = (id: string) => `s:${id}`;
const kXs = (ve: string, pos: number) => `x:${ve}:${pos}`;
const kEx = (ex: string, pos: number) => `e:${ex}:${pos}`;

const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
const str = (n: number | null | undefined) => (n == null ? "" : String(n));
const blank = (): Form => ({ setId: crypto.randomUUID(), reps: "", loadKg: "", rir: "", restS: "", saved: false });
const fromLogged = (d: Logged): Form => ({ setId: d.id, reps: str(d.reps), loadKg: str(d.loadKg), rir: str(d.rir), restS: str(d.restS), saved: true });
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

const send: Sender = async (op: QueuedOp) => {
  const res = await fetch(`/api${op.path}`, { method: op.method, headers: { "content-type": "application/json" }, body: JSON.stringify(op.body) });
  let message: string | undefined;
  try { message = (await res.json()).error; } catch { /* sem corpo */ }
  return { status: res.status, message };
};

export default function Registro() {
  const { id } = useParams<{ id: string }>();
  const { me, logout } = useMe("student");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [log, setLog] = useState<Log | null>(null);
  const [perms, setPerms] = useState<Permissions | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [volume, setVolume] = useState<MuscleVolume[] | null>(null);
  const [last, setLast] = useState<LastMap>({});
  const [forms, setForms] = useState<Record<string, Form>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [subs, setSubs] = useState<Record<string, { id: string; name: string }>>({});
  const [extras, setExtras] = useState<Extra[]>([]);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [addId, setAddId] = useState("");
  const [online, setOnline] = useState(true);
  const [tick, setTick] = useState(0);            // força atualização do estado da fila
  const [rest, setRest] = useState<{ left: number; total: number } | null>(null);
  const logRef = useRef<Log | null>(null);

  const queue = useMemo(() => (me ? new SyncQueue(`sync:${me.id}:${id}`, localStorage, send) : null), [me, id]);

  const init = useCallback(async () => {
    if (!me || !queue) return;
    const [d, logs, p, c] = await Promise.all([
      apiCached(`/versions/${id}`, me.id), apiCached(`/versions/${id}/logs`, me.id),
      apiCached("/me/permissions", me.id), apiCached("/exercises", me.id),
    ]);
    if (!d.ok) return setError(d.offline ? "Sem conexão e este treino ainda não foi aberto neste aparelho." : "Treino não encontrado.");
    const det: Detail = d.data;
    setDetail(det);
    const pm: Permissions | null = p.ok ? p.data : null;
    if (pm) setPerms(pm);
    const cat: CatalogItem[] = c.ok ? c.data : [];
    setCatalog(cat);
    if (pm?.viewVolume) { const v = await apiCached(`/versions/${id}/volume`, me.id); if (v.ok) setVolume(v.data.muscles); }
    const l = await apiCached(`/versions/${id}/last`, me.id); if (l.ok) setLast(l.data);

    const all = (logs.ok ? logs.data : []) as Log[];
    const current = [...all].reverse().find((x) => !x.finishedAt) ?? all.at(-1) ?? null;
    const f: Record<string, Form> = {};
    let ord = current?.exerciseOrder ?? det.exercises.map((e) => e.id);
    const sb: Record<string, { id: string; name: string }> = Object.fromEntries((current?.substitutions ?? []).map((s) => [s.versionExerciseId, { id: s.exerciseId, name: s.name }]));
    const ex: Extra[] = [...(current?.extraExercises ?? [])];
    for (const e of det.exercises) for (const s of e.sets) {
      const done = current?.sets.find((x) => x.versionSetId === s.id);
      f[kSet(s.id)] = done ? fromLogged(done) : blank();
    }
    for (const s of current?.sets ?? []) {
      if (s.versionExerciseId && !s.versionSetId) f[kXs(s.versionExerciseId, s.position!)] = fromLogged(s);
      if (s.extraExerciseId) f[kEx(s.extraExerciseId, s.position!)] = fromLogged(s);
    }
    // Reaplica o que ainda está na fila (feito offline e não sincronizado), só do registro atual.
    const pend = queue.pending();
    let cur: Log | null = current && !current.finishedAt ? current : null;
    if (!cur) {
      const start = [...pend].reverse().find((o) => o.id.startsWith("log:"));
      if (start) cur = { id: (start.body as any).id, finishedAt: null, exerciseOrder: null, substitutions: [], extraExercises: [], sets: [] };
    }
    if (!cur) cur = current; // concluído e sem novo registro pendente
    for (const op of pend) {
      const b = op.body as any;
      if (!cur || !(op.path.includes(`/logs/${cur.id}/`) || op.id === `log:${cur.id}` || op.path.endsWith(`/logs/${cur.id}`))) continue;
      if (op.id.startsWith("log:")) continue;
      else if (op.id.startsWith("order:")) ord = b.order;
      else if (op.id.startsWith("sub:")) { const ve = op.path.split("/").pop()!; if (b.exerciseId) sb[ve] = { id: b.exerciseId, name: cat.find((x) => x.id === b.exerciseId)?.name ?? "" }; else delete sb[ve]; }
      else if (op.id.startsWith("extra:")) { if (!ex.some((x) => x.id === b.id)) ex.push({ id: b.id, exerciseId: b.exerciseId, name: cat.find((x) => x.id === b.exerciseId)?.name ?? "", position: ex.length + 1 }); }
      else if (op.id.startsWith("set:")) {
        const key = b.versionSetId ? kSet(b.versionSetId) : b.versionExerciseId ? kXs(b.versionExerciseId, b.position) : kEx(b.extraExerciseId, b.position);
        f[key] = { setId: op.id.slice(4), reps: str(b.reps), loadKg: str(b.loadKg), rir: str(b.rir), restS: str(b.restS), saved: false };
      } else if (op.id.startsWith("finish:")) cur = { ...cur, finishedAt: new Date().toISOString() };
    }
    logRef.current = cur; setLog(cur);
    setOrder(ord); setSubs(sb); setExtras(ex); setForms(f);
  }, [me, queue, id]);
  useEffect(() => { init(); }, [init]);

  // Conexão e sincronização.
  const flush = useCallback(async () => {
    if (!queue) return;
    const r = await queue.flush();
    setTick((t) => t + 1);
    if (r.conflicts > 0) init(); // o servidor recusou algo: volta ao estado do servidor
  }, [queue, init]);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => { setOnline(true); flush(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    const t = setInterval(() => { if (queue?.pending().length) flush(); }, 15000);
    flush();
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); clearInterval(t); };
  }, [flush, queue]);

  // Cronômetro de descanso (inicia ao concluir a série).
  useEffect(() => {
    if (!rest || rest.left <= 0) return;
    const t = setTimeout(() => setRest((r) => (r ? { ...r, left: r.left - 1 } : r)), 1000);
    return () => clearTimeout(t);
  }, [rest]);

  const enqueue = (op: Omit<QueuedOp, "at">) => { queue?.enqueue(op); setTick((t) => t + 1); flush(); };

  /** O registro é criado localmente (id gerado aqui) e enviado pela fila; funciona sem rede. */
  function ensureLog(): string {
    if (logRef.current && !logRef.current.finishedAt) return logRef.current.id;
    const nl: Log = { id: crypto.randomUUID(), finishedAt: null, exerciseOrder: null, substitutions: [], extraExercises: [], sets: [] };
    logRef.current = nl; setLog(nl);
    enqueue({ id: `log:${nl.id}`, method: "POST", path: `/versions/${id}/logs`, body: { id: nl.id }, label: "Início do treino" });
    return nl.id;
  }

  const patch = (key: string, k: keyof Form, v: string) => setForms((p) => ({ ...p, [key]: { ...p[key], [k]: v, saved: false } }));

  function save(key: string, prescribedRest?: number | null) {
    setError("");
    const logId = ensureLog();
    const f = forms[key];
    const [kind, a, b] = key.split(":");
    const target = kind === "s" ? { versionSetId: a } : kind === "x" ? { versionExerciseId: a, position: Number(b) } : { extraExerciseId: a, position: Number(b) };
    enqueue({
      id: `set:${f.setId}`, method: "PUT", path: `/logs/${logId}/sets/${f.setId}`, label: "Série",
      body: { ...target, reps: num(f.reps), loadKg: num(f.loadKg), rir: num(f.rir), ...(perms?.adjustRest && f.restS.trim() !== "" ? { restS: num(f.restS) } : {}) },
    });
    setForms((p) => ({ ...p, [key]: { ...p[key], saved: true } }));
    if (prescribedRest && prescribedRest > 0) setRest({ left: prescribedRest, total: prescribedRest });
  }

  function move(i: number, d: -1 | 1) {
    const j = i + d; if (j < 0 || j >= order.length) return;
    const next = [...order]; [next[i], next[j]] = [next[j], next[i]];
    const logId = ensureLog();
    setOrder(next);
    enqueue({ id: `order:${logId}`, method: "PUT", path: `/logs/${logId}/order`, body: { order: next }, label: "Ordem dos exercícios" });
  }

  function substitute(veId: string, exerciseId: string) {
    const logId = ensureLog();
    setSubs((p) => { const n = { ...p }; if (!exerciseId) delete n[veId]; else n[veId] = { id: exerciseId, name: catalog.find((c) => c.id === exerciseId)?.name ?? "" }; return n; });
    enqueue({ id: `sub:${logId}:${veId}`, method: "PUT", path: `/logs/${logId}/substitutions/${veId}`, body: { exerciseId: exerciseId || null }, label: "Substituição" });
  }

  function addExtra() {
    if (!addId) return;
    const logId = ensureLog();
    const xid = crypto.randomUUID();
    const ex: Extra = { id: xid, exerciseId: addId, name: catalog.find((c) => c.id === addId)?.name ?? "", position: extras.length + 1 };
    setExtras((p) => [...p, ex]);
    setForms((p) => ({ ...p, [kEx(xid, 1)]: blank() }));
    enqueue({ id: `extra:${xid}`, method: "POST", path: `/logs/${logId}/extra-exercises`, body: { id: xid, exerciseId: addId }, label: "Exercício extra" });
    setAddId("");
  }

  function finish() {
    if (!logRef.current) return;
    const done = { ...logRef.current, finishedAt: new Date().toISOString() };
    logRef.current = done; setLog(done);
    enqueue({ id: `finish:${done.id}`, method: "POST", path: `/logs/${done.id}/finish`, body: { note: note || null }, label: "Conclusão" });
  }

  function again() {
    logRef.current = null; setLog(null); setSubs({}); setExtras([]); setOrder(detail?.exercises.map((e) => e.id) ?? []);
    setForms(Object.fromEntries(Object.keys(forms).filter((k) => k.startsWith("s:")).map((k) => [k, blank()])));
  }

  const pendingIds = new Set(queue?.pending().map((o) => o.id) ?? []);
  void tick;
  const pendingCount = pendingIds.size;
  const conflicts = queue?.conflicts() ?? [];
  const finished = !!log?.finishedAt;
  const readOnly = finished || (detail ? !detail.isCurrent && !log : false);
  const byId = new Map(detail?.exercises.map((e) => [e.id, e]) ?? []);

  // Função de renderização (não um componente): mantém o foco dos campos ao digitar.
  const setRow = (k: string, label: React.ReactNode, ref_?: React.ReactNode, restS?: number | null) => {
    const f = forms[k]; if (!f) return null;
    const cols = perms?.adjustRest ? 5 : 4;
    const waiting = pendingIds.has(`set:${f.setId}`);
    return (
      <div key={k} className="logset" style={{ gridTemplateColumns: `minmax(140px, 1.6fr) repeat(${cols - 1}, 1fr) auto`, marginTop: 12 }}>
        <div className="ref muted" id={`${k}-ref`}>{label}{ref_}</div>
        <div><label id={`${k}-reps-l`} htmlFor={`${k}-reps`}>Reps</label><input id={`${k}-reps`} aria-labelledby={`${k}-ref ${k}-reps-l`} inputMode="numeric" disabled={readOnly} value={f.reps} onChange={(e) => patch(k, "reps", e.target.value)} /></div>
        <div><label id={`${k}-loadKg-l`} htmlFor={`${k}-loadKg`}>Carga (kg)</label><input id={`${k}-loadKg`} aria-labelledby={`${k}-ref ${k}-loadKg-l`} inputMode="decimal" disabled={readOnly} value={f.loadKg} onChange={(e) => patch(k, "loadKg", e.target.value)} /></div>
        <div><label id={`${k}-rir-l`} htmlFor={`${k}-rir`}>RIR</label><input id={`${k}-rir`} aria-labelledby={`${k}-ref ${k}-rir-l`} inputMode="numeric" disabled={readOnly} value={f.rir} onChange={(e) => patch(k, "rir", e.target.value)} /></div>
        {perms?.adjustRest && <div><label id={`${k}-restS-l`} htmlFor={`${k}-restS`}>Desc. real (s)</label><input id={`${k}-restS`} aria-labelledby={`${k}-ref ${k}-restS-l`} inputMode="numeric" disabled={readOnly} value={f.restS} onChange={(e) => patch(k, "restS", e.target.value)} /></div>}
        <button className="btn small" disabled={readOnly || (f.reps === "" && f.loadKg === "")} onClick={() => save(k, restS)}>
          {f.saved ? (waiting ? <><Icon name="refresh" spin />Pendente…</> : <><Icon name="check" enter />Salvo</>) : "Salvar"}
        </button>
      </div>
    );
  };

  const extraSetKeys = (prefix: string) => Object.keys(forms).filter((k) => k.startsWith(prefix)).sort((a, b) => Number(a.split(":").at(-1)) - Number(b.split(":").at(-1)));
  const nextPos = (prefix: string) => (extraSetKeys(prefix).length ? Number(extraSetKeys(prefix).at(-1)!.split(":").at(-1)) + 1 : 1);
  const fmtLast = (l: LastMap[string]) => `${l.best?.loadKg ?? "—"} kg × ${l.best?.reps ?? "—"} · ${new Date(l.date).toLocaleDateString("pt-BR")}`;

  return (
    <Shell me={me} logout={logout}>
      <p><Link href="/aluno">← Meus treinos</Link></p>
      {(!online || pendingCount > 0) && (
        <div className="err" role="status" data-testid="sync-status" style={{ borderLeftColor: online ? "var(--v)" : "var(--b)" }}>
          <Icon name="refresh" spin={online} />{!online ? " Sem conexão. " : " Sincronizando. "}
          {pendingCount > 0 ? `${pendingCount} alteração(ões) guardada(s) neste aparelho; serão enviadas quando houver internet.` : "Seus registros ficam guardados e serão enviados quando a conexão voltar."}
          {online && pendingCount > 0 && <> <button className="btn ghost small" onClick={() => flush()}>Enviar agora</button></>}
        </div>
      )}
      {conflicts.map((c) => (
        <div className="err" key={c.op.id} role="alert">
          Não foi possível sincronizar “{c.op.label}”: {c.message}.{" "}
          <button className="btn ghost small" onClick={() => { queue?.discardConflict(c.op.id); setTick((t) => t + 1); }}>Entendi</button>
        </div>
      ))}
      {error && <p className="err">{error}</p>}
      {rest && rest.left >= 0 && !finished && (
        <div className="card row between" data-testid="rest-timer" style={{ position: "sticky", top: 8, zIndex: 5, background: "var(--n)" }}>
          <span><b className="hf" style={{ fontSize: 12, letterSpacing: ".1em" }}><Icon name="timer" />Descanso</b></span>
          <b style={{ fontSize: 28, fontVariantNumeric: "tabular-nums", color: rest.left === 0 ? "var(--v)" : "var(--g)" }}>{rest.left === 0 ? "Pronto!" : mmss(rest.left)}</b>
          <button className="btn ghost small" onClick={() => setRest(null)}>{rest.left === 0 ? "Fechar" : "Pular"}</button>
        </div>
      )}
      {detail && perms && (
        <>
          <h1>{detail.name} <span className="sub">· v{detail.version}</span></h1>
          {!detail.isCurrent && <p className="muted"><span className="tag">Versão anterior</span> Somente consulta: seu personal publicou uma versão mais nova.</p>}
          <p className="muted">Registre o que você realmente fez. A prescrição do seu personal não é alterada; ajustes que você faz ficam como adaptações.</p>
          {finished && (
            <div className="card">
              <p className="okmsg">Treino concluído. Seu personal já pode ver o que você registrou{pendingCount > 0 ? " (assim que sincronizar)" : ""}.</p>
              {detail.isCurrent && <button className="btn ghost small" onClick={again}>Registrar outra execução</button>}
            </div>
          )}

          {order.map((veId, i) => {
            const e = byId.get(veId); if (!e) return null;
            const sub = subs[veId];
            const options = perms.substituteFree ? catalog.filter((c) => c.id !== e.id && c.name !== e.name) : (perms.substituteAuthorized ? e.alternatives : []);
            const xsPrefix = `x:${e.id}:`;
            const lastE = last[e.id];
            return (
              <div className="card" key={e.id}>
                <div className="row between">
                  <b>{sub ? <>{sub.name} <span className="muted" style={{ fontWeight: 500 }}>(no lugar de {e.name})</span></> : e.name}</b>
                  {perms.reorder && !readOnly && (
                    <span className="row">
                      <button className="btn ghost small" aria-label="Subir exercício" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                      <button className="btn ghost small" aria-label="Descer exercício" disabled={i === order.length - 1} onClick={() => move(i, 1)}>↓</button>
                    </span>
                  )}
                </div>
                <MediaViewer exerciseId={sub?.id ?? e.exerciseId} key={sub?.id ?? e.exerciseId} />
                {lastE && !sub && <div className="muted" data-testid="last-training" style={{ marginTop: 6 }}>Último treino: <b style={{ color: "var(--g)" }}>{fmtLast(lastE)}</b></div>}
                {options.length > 0 && !readOnly && (
                  <div style={{ marginTop: 8, maxWidth: 360 }}>
                    <select aria-label={`Substituir ${e.name}`} value={sub?.id ?? ""} onChange={(ev) => substitute(e.id, ev.target.value)}>
                      <option value="">Exercício prescrito</option>
                      {options.map((o) => <option key={o.id} value={o.id}>Substituir por: {o.name}</option>)}
                    </select>
                  </div>
                )}
                {e.sets.map((s) => setRow(kSet(s.id),
                  <>Série {s.position}{s.setType && s.setType !== "work" ? ` · ${SET_TYPE_LABEL[s.setType]}` : ""}<br /></>,
                  <><span style={{ color: "var(--text)" }}>{prescribedText(s)}</span><br />prescrito{s.restS != null ? ` · desc. ${s.restS}s` : ""}{s.tempo ? ` · cad. ${s.tempo}` : ""}{s.note && <><br /><i>{s.note}</i></>}</>,
                  s.restS))}
                {extraSetKeys(xsPrefix).map((k) => setRow(k, <>Série extra {k.split(":").at(-1)}<br /></>, <>adaptação</>))}
                {perms.editSets && !readOnly && (
                  <div style={{ marginTop: 10 }}>
                    <button className="btn ghost small" onClick={() => setForms((p) => ({ ...p, [kXs(e.id, nextPos(xsPrefix))]: blank() }))}>+ Série extra</button>
                  </div>
                )}
              </div>
            );
          })}

          {extras.map((x) => (
            <div className="card" key={x.id}>
              <b>{x.name}</b> <span className="tag">Exercício extra</span>
              {extraSetKeys(`e:${x.id}:`).map((k) => setRow(k, <>Série {k.split(":").at(-1)}<br /></>, <>sem prescrição</>))}
              {!readOnly && (
                <div style={{ marginTop: 10 }}>
                  <button className="btn ghost small" onClick={() => setForms((p) => ({ ...p, [kEx(x.id, nextPos(`e:${x.id}:`))]: blank() }))}>+ Série</button>
                </div>
              )}
            </div>
          ))}

          {perms.addExercises && !readOnly && (
            <div className="card">
              <label htmlFor="add" style={{ marginTop: 0 }}>Adicionar exercício à sessão</label>
              <div className="row">
                <select id="add" style={{ maxWidth: 320 }} value={addId} onChange={(e) => setAddId(e.target.value)}>
                  <option value="">Escolher…</option>
                  {catalog.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button className="btn small" disabled={!addId} onClick={addExtra}>Adicionar</button>
              </div>
            </div>
          )}

          {volume && (
            <>
              <h2>Volume desta sessão</h2>
              <div className="card">
                <table>
                  <thead><tr><th>Músculo</th><th className="num">Diretas</th><th className="num">Indiretas</th><th className="num">Ponderado</th></tr></thead>
                  <tbody>{volume.map((m) => <tr key={m.muscle}><td>{m.muscle}</td><td className="num">{m.direct}</td><td className="num">{m.indirect}</td><td className="num"><b>{m.weighted}</b></td></tr>)}</tbody>
                </table>
              </div>
            </>
          )}

          {!readOnly && (
            <div className="card">
              <label htmlFor="fn">Observação sobre o treino (opcional)</label>
              <input id="fn" value={note} onChange={(e) => setNote(e.target.value)} />
              <div style={{ marginTop: 12 }}><button className="btn" disabled={!log} onClick={finish}>Concluir treino</button></div>
            </div>
          )}
        </>
      )}
    </Shell>
  );
}
