"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Shell from "../../../../components/Shell";
import { api, diffClass, fmtDiff, useMe } from "../../../../lib/client";
import { effortText, loadText, prescribedText, repsText, SET_TYPE_LABEL, type PrescribedSetView } from "../../../../lib/format";
import type { MuscleVolume } from "../../../../lib/volume";

interface Row {
  exerciseName: string; performedName: string | null; setPosition: number; versionSetId: string; setType: string;
  prescribed: PrescribedSetView;
  done: { reps: number | null; loadKg: number | null; rir: number | null; restS: number | null; note: string | null } | null;
  diff: { reps: number | null; loadKg: number | null; rir: number | null; restS: number | null } | null;
}
interface DoneSet { position: number | null; reps: number | null; loadKg: number | null; rir: number | null; restS: number | null; note: string | null }
interface Adaptations {
  originalOrder: string[]; adaptedOrder: string[] | null;
  substitutions: { prescribed: string; performed: string }[];
  extraExercises: { name: string; sets: DoneSet[] }[];
  extraSets: (DoneSet & { exerciseName: string; performedName: string | null })[];
}
interface Cmp {
  version: {
    id: string; name: string; status: "draft" | "published"; studentName: string; studentId: string;
    programId: string; version: number; isCurrent: boolean;
    exercises: { id: string; name: string; sets: (PrescribedSetView & { id: string; position: number })[] }[];
  };
  logs: { id: string; startedAt: string; finishedAt: string | null; note: string | null; adaptations: Adaptations; rows: Row[] }[];
}
interface VersionItem { id: string; programId: string; version: number; status: string; isCurrent: boolean }

const doneText = (s: DoneSet) => `${s.reps ?? "—"} × ${s.loadKg != null ? `${s.loadKg} kg` : "—"}${s.rir != null ? ` · RIR ${s.rir}` : ""}${s.restS != null ? ` · desc. ${s.restS}s` : ""}`;
const hasAdaptations = (a: Adaptations) => !!a.adaptedOrder || a.substitutions.length + a.extraExercises.length + a.extraSets.length > 0;

export default function Treino() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { me, logout } = useMe("trainer");
  const [data, setData] = useState<Cmp | null>(null);
  const [volume, setVolume] = useState<{ indirectWeight: number; muscles: MuscleVolume[] } | null>(null);
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [students, setStudents] = useState<{ id: string; name: string }[]>([]);
  const [target, setTarget] = useState("");
  const [tplName, setTplName] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const load = useCallback(async () => {
    const [c, v, vs, st] = await Promise.all([api(`/versions/${id}/comparison`), api(`/versions/${id}/volume`), api("/versions"), api("/students")]);
    if (!c.ok) return setError(c.status === 404 ? "Treino não encontrado." : "Falha ao carregar.");
    setData(c.data);
    if (v.ok) setVolume(v.data);
    if (vs.ok) setVersions((vs.data as VersionItem[]).filter((x) => x.programId === c.data.version.programId).sort((a, b) => a.version - b.version));
    if (st.ok) { setStudents(st.data); setTarget((t) => t || c.data.version.studentId); }
  }, [id]);
  useEffect(() => { if (me) load(); }, [me, load]);

  async function act(fn: () => Promise<{ ok: boolean; data: any }>, after?: (d: any) => void) {
    setError(""); setInfo("");
    const r = await fn();
    if (!r.ok) return setError(r.data?.error ?? "Falha na operação");
    after ? after(r.data) : load();
  }

  const v = data?.version;
  const published = v?.status === "published";
  return (
    <Shell me={me} logout={logout}>
      <p><Link href="/personal">← Alunos</Link></p>
      {error && <p className="err">{error}</p>}
      {info && <p className="okmsg">{info}</p>}
      {v && data && (
        <>
          <div className="row between">
            <h1>{v.name} <span className="sub">· {v.studentName}</span></h1>
            <span className="row">
              <span className="tag">v{v.version}</span>
              <span className={`tag ${published ? "pub" : ""}`}>{published ? (v.isCurrent ? "Publicado · atual" : "Publicado · anterior") : "Rascunho"}</span>
            </span>
          </div>

          {versions.length > 1 && (
            <p className="muted">Versões deste programa: {versions.map((x, i) => (
              <span key={x.id}>{i > 0 && " · "}{x.id === v.id ? <b>v{x.version}</b> : <Link href={`/personal/treinos/${x.id}`}>v{x.version}</Link>}</span>
            ))}</p>
          )}

          <div className="card">
            <div className="row">
              {v.status === "draft" && (
                <>
                  <Link className="btn small" href={`/personal/treinos/novo?editar=${v.id}`}>Editar rascunho</Link>
                  <button className="btn small" onClick={() => act(() => api(`/versions/${id}/publish`, "POST"))}>Publicar para o aluno</button>
                </>
              )}
              {published && v.isCurrent && (
                <button className="btn small" onClick={() => act(() => api(`/versions/${id}/new-version`, "POST"), (d) => router.push(`/personal/treinos/novo?editar=${d.id}`))}>Nova versão</button>
              )}
              <Link className="btn ghost small" href={`/personal/treinos/novo?copiar=${v.id}&aluno=${v.studentId}`}>Duplicar e editar</Link>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <select style={{ maxWidth: 220 }} aria-label="Duplicar para o aluno" value={target} onChange={(e) => setTarget(e.target.value)}>
                {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button className="btn ghost small" onClick={() => act(() => api(`/versions/${id}/duplicate`, "POST", { studentId: target }), (d) => router.push(`/personal/treinos/${d.id}`))}>Duplicar como rascunho</button>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <input style={{ maxWidth: 260 }} placeholder="Nome do modelo" value={tplName} onChange={(e) => setTplName(e.target.value)} />
              <button className="btn ghost small" disabled={!tplName.trim()} onClick={() => act(() => api("/templates", "POST", { name: tplName, versionId: id }), () => { setInfo(`Modelo “${tplName}” salvo.`); setTplName(""); })}>Salvar como modelo</button>
            </div>
            {published && <p className="muted" style={{ marginBottom: 0 }}>Treino publicado é imutável. “Nova versão” cria um rascunho a partir deste; ao publicar, o aluno passa a ver a nova, e esta fica preservada com os registros.</p>}
          </div>

          <h2>Prescrição</h2>
          <div className="card">
            <table>
              <thead><tr><th>Exercício</th><th className="num">Série</th><th>Tipo</th><th className="num">Reps</th><th className="num">Carga</th><th className="num">Esforço</th><th className="num">Desc.</th><th>Cadência / obs.</th></tr></thead>
              <tbody>
                {v.exercises.flatMap((e) => e.sets.map((s) => (
                  <tr key={s.id}>
                    <td>{s.position === 1 ? e.name : ""}</td>
                    <td className="num">{s.position}</td>
                    <td>{SET_TYPE_LABEL[s.setType ?? "work"]}</td>
                    <td className="num">{repsText(s)}</td>
                    <td className="num">{loadText(s)}</td>
                    <td className="num">{effortText(s) || "—"}</td>
                    <td className="num">{s.restS != null ? `${s.restS} s` : "—"}</td>
                    <td className="muted">{[s.tempo, s.note].filter(Boolean).join(" · ") || "—"}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>

          {volume && (
            <>
              <h2>Volume por músculo</h2>
              <div className="card" data-testid="volume">
                <table>
                  <thead><tr><th>Músculo</th><th className="num">Diretas</th><th className="num">Indiretas</th><th className="num">Ponderado</th><th className="num">Aquec.</th><th className="num">Prep.</th></tr></thead>
                  <tbody>
                    {volume.muscles.map((m) => (
                      <tr key={m.muscle}><td>{m.muscle}</td><td className="num">{m.direct}</td><td className="num">{m.indirect}</td>
                        <td className="num"><b>{m.weighted}</b></td><td className="num">{m.warmup}</td><td className="num">{m.prep}</td></tr>
                    ))}
                  </tbody>
                </table>
                <p className="muted">Ponderado = diretas + indiretas × {volume.indirectWeight}. Só séries de trabalho; aquecimento e preparação à parte. O peso é configurável em <Link href="/personal">Seus alunos</Link>.</p>
              </div>
            </>
          )}

          {published && (
            <>
              <h2>Prescrito × realizado</h2>
              {data.logs.length === 0 && <p className="muted">O aluno ainda não registrou esta versão.</p>}
              {data.logs.map((l) => (
                <div className="card" key={l.id} data-testid="comparison">
                  <div className="row between">
                    <b>{new Date(l.startedAt).toLocaleString("pt-BR")}</b>
                    <span className="tag">{l.finishedAt ? "Concluído" : "Em andamento"}</span>
                  </div>
                  {l.note && <p className="muted">Obs. do aluno: {l.note}</p>}
                  {hasAdaptations(l.adaptations) && (
                    <div style={{ margin: "10px 0", padding: "10px 12px", borderLeft: "4px solid var(--b)", background: "var(--panel)" }} data-testid="adaptations">
                      <b className="hf" style={{ fontSize: 12, letterSpacing: ".1em" }}>Adaptações do aluno (a prescrição não foi alterada)</b>
                      <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 14 }}>
                        {l.adaptations.adaptedOrder && <li>Ordem: {l.adaptations.originalOrder.join(" → ")} <b>⇒</b> {l.adaptations.adaptedOrder.join(" → ")}</li>}
                        {l.adaptations.substitutions.map((s) => <li key={s.prescribed}>{s.prescribed} <b>⇒</b> {s.performed}</li>)}
                        {l.adaptations.extraSets.map((s, i) => <li key={`xs${i}`}>Série extra em {s.performedName ?? s.exerciseName}: {doneText(s)}</li>)}
                        {l.adaptations.extraExercises.map((x) => <li key={x.name}>Exercício extra: {x.name}{x.sets.length ? ` — ${x.sets.map(doneText).join(" · ")}` : ""}</li>)}
                      </ul>
                    </div>
                  )}
                  <table>
                    <thead>
                      <tr><th>Exercício</th><th className="num">Série</th><th className="num">Prescrito</th><th className="num">Realizado</th><th className="num">Dif. reps</th><th className="num">Dif. carga</th><th className="num">Desc. real</th></tr>
                    </thead>
                    <tbody>
                      {l.rows.map((r) => (
                        <tr key={r.versionSetId}>
                          <td>{r.setPosition === 1 ? <>{r.exerciseName}{r.performedName && <span className="muted"> ⇒ {r.performedName}</span>}</> : ""}</td>
                          <td className="num">{r.setPosition}{r.setType !== "work" ? ` (${SET_TYPE_LABEL[r.setType].slice(0, 5)}.)` : ""}</td>
                          <td className="num">{prescribedText(r.prescribed)}</td>
                          <td className="num">{r.done ? `${r.done.reps ?? "—"} × ${r.done.loadKg != null ? `${r.done.loadKg} kg` : "—"}${r.done.rir != null ? ` · RIR ${r.done.rir}` : ""}` : "não feito"}</td>
                          <td className={`num ${diffClass(r.diff?.reps)}`}>{fmtDiff(r.diff?.reps)}</td>
                          <td className={`num ${diffClass(r.diff?.loadKg)}`}>{fmtDiff(r.diff?.loadKg)}</td>
                          <td className="num muted">{r.done?.restS != null ? `${r.done.restS} s` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {l.rows.some((r) => r.done?.note) && (
                    <p className="muted">{l.rows.filter((r) => r.done?.note).map((r) => `${r.exerciseName} #${r.setPosition}: ${r.done!.note}`).join(" · ")}</p>
                  )}
                </div>
              ))}
            </>
          )}
        </>
      )}
    </Shell>
  );
}
