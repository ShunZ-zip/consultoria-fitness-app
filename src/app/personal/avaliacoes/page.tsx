"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Shell from "../../../components/Shell";
import type { BuiltinTemplate, Field, FieldType } from "../../../lib/assessment";
import { api, useMe } from "../../../lib/client";

interface Tpl { id: string; name: string; kind: string; fields: Field[] }
const TYPES: { v: FieldType; l: string }[] = [{ v: "text", l: "Texto" }, { v: "number", l: "Número" }, { v: "scale", l: "Escala 0–10" }, { v: "yesno", l: "Sim/Não" }, { v: "choice", l: "Escolha" }];
const slug = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);

export default function ModelosAvaliacao() {
  const { me, logout } = useMe("trainer");
  const [templates, setTemplates] = useState<Tpl[]>([]);
  const [builtins, setBuiltins] = useState<BuiltinTemplate[]>([]);
  const [name, setName] = useState("");
  const [rows, setRows] = useState<{ label: string; type: FieldType; unit: string; options: string }[]>([{ label: "", type: "text", unit: "", options: "" }]);
  const [error, setError] = useState(""); const [info, setInfo] = useState("");

  const load = useCallback(async () => { const r = await api("/assessment-templates"); if (r.ok) { setTemplates(r.data.templates); setBuiltins(r.data.builtins); } }, []);
  useEffect(() => { if (me) load(); }, [me, load]);

  async function addBuiltin(key: string) {
    setError(""); setInfo("");
    const r = await api("/assessment-templates", "POST", { key });
    if (!r.ok) return setError(r.data?.error ?? "Falha ao adicionar");
    setInfo("Modelo adicionado."); load();
  }
  async function create() {
    setError(""); setInfo("");
    const used = new Set<string>();
    const fields = rows.filter((r) => r.label.trim()).map((r, i) => {
      let id = slug(r.label) || `campo_${i + 1}`; while (used.has(id)) id += "_"; used.add(id);
      return { id, label: r.label.trim(), type: r.type, ...(r.unit ? { unit: r.unit } : {}), ...(r.type === "choice" ? { options: r.options.split(",").map((o) => o.trim()).filter(Boolean) } : {}) };
    });
    const r = await api("/assessment-templates", "POST", { name, fields });
    if (!r.ok) return setError(r.data?.issues?.[0]?.message ?? r.data?.error ?? "Confira o nome e os campos (escolha precisa de ao menos 2 opções).");
    setInfo("Modelo criado."); setName(""); setRows([{ label: "", type: "text", unit: "", options: "" }]); load();
  }
  const have = (key: string) => templates.some((t) => t.name === builtins.find((b) => b.key === key)?.name);

  return (
    <Shell me={me} logout={logout}>
      <p><Link href="/personal">← Alunos</Link></p>
      <h1>Modelos de avaliação</h1>
      <p className="muted">Anamnese, medidas, testes e questionários próprios. As respostas são dados de saúde: ficam restritas ao aluno e a você, e a sua leitura é registrada na auditoria. Fotos corporais ainda não estão disponíveis.</p>
      {error && <p className="err">{error}</p>}{info && <p className="okmsg">{info}</p>}

      <h2>Modelos prontos</h2>
      {builtins.map((b) => (
        <div className="card row between" key={b.key}>
          <span><b>{b.name}</b><div className="muted">{b.fields.length} campos{b.note ? ` · ${b.note}` : ""}</div></span>
          <button className="btn small" disabled={have(b.key)} onClick={() => addBuiltin(b.key)}>{have(b.key) ? "Já adicionado" : "Adicionar"}</button>
        </div>
      ))}

      <h2>Meus modelos ({templates.length})</h2>
      {templates.map((t) => <div className="card" key={t.id}><b>{t.name}</b><div className="muted">{t.fields.map((f) => f.label).join(" · ")}</div></div>)}
      {templates.length === 0 && <p className="muted">Adicione um modelo pronto ou crie o seu abaixo.</p>}

      <h2>Criar questionário próprio</h2>
      <div className="card">
        <label htmlFor="tn" style={{ marginTop: 0 }}>Nome</label>
        <input id="tn" value={name} onChange={(e) => setName(e.target.value)} />
        {rows.map((r, i) => (
          <div className="row" key={i} style={{ marginTop: 8 }}>
            <input style={{ flex: 3, minWidth: 180 }} placeholder="Pergunta ou medida" aria-label="Pergunta ou medida" value={r.label} onChange={(e) => setRows(rows.map((x, y) => (y === i ? { ...x, label: e.target.value } : x)))} />
            <select style={{ flex: 1, minWidth: 120 }} value={r.type} onChange={(e) => setRows(rows.map((x, y) => (y === i ? { ...x, type: e.target.value as FieldType } : x)))} aria-label="Tipo">
              {TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
            </select>
            {r.type === "number" && <input style={{ width: 90 }} placeholder="Unidade" aria-label="Unidade" value={r.unit} onChange={(e) => setRows(rows.map((x, y) => (y === i ? { ...x, unit: e.target.value } : x)))} />}
            {r.type === "choice" && <input style={{ flex: 2, minWidth: 160 }} placeholder="Opções (vírgula)" aria-label="Opções (vírgula)" value={r.options} onChange={(e) => setRows(rows.map((x, y) => (y === i ? { ...x, options: e.target.value } : x)))} />}
            <button className="btn ghost small" aria-label="Remover campo" onClick={() => setRows(rows.filter((_, y) => y !== i))}>×</button>
          </div>
        ))}
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn ghost small" onClick={() => setRows([...rows, { label: "", type: "text", unit: "", options: "" }])}>+ Campo</button>
          <button className="btn small" disabled={!name.trim() || !rows.some((r) => r.label.trim())} onClick={create}>Criar modelo</button>
        </div>
      </div>
    </Shell>
  );
}
