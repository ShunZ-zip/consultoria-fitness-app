"use client";
import type { Answers, Field } from "../lib/assessment";

/** Formulário gerado a partir dos campos (avaliações e check-ins). Escala = controle deslizante, como no protótipo. */
export default function FieldsForm({ fields, value, onChange, errors = {}, idPrefix = "f" }: {
  fields: Field[]; value: Answers; onChange: (v: Answers) => void; errors?: Record<string, string>; idPrefix?: string;
}) {
  const set = (id: string, v: string | number | boolean | null) => onChange({ ...value, [id]: v });
  return (
    <div>
      {fields.map((f) => {
        const id = `${idPrefix}-${f.id}`;
        const v = value[f.id];
        return (
          <div key={f.id} style={{ marginBottom: 14 }}>
            <label htmlFor={id} style={{ color: "var(--g)", fontSize: 14, margin: "0 0 6px" }}>
              {f.label}{f.unit ? ` (${f.unit})` : ""}{f.required ? " *" : ""}
            </label>
            {f.type === "text" && <textarea id={id} rows={2} value={(v as string) ?? ""} onChange={(e) => set(f.id, e.target.value)} />}
            {f.type === "number" && (
              <input id={id} inputMode="decimal" value={v == null ? "" : String(v)}
                onChange={(e) => { const t = e.target.value.replace(",", "."); set(f.id, t.trim() === "" ? null : Number.isNaN(Number(t)) ? (v as number | null) ?? null : Number(t)); }} />
            )}
            {f.type === "scale" && (
              <div className="row" style={{ gap: 12 }}>
                <input id={id} type="range" min={f.min ?? 0} max={f.max ?? 10} step={1} value={typeof v === "number" ? v : Math.round(((f.min ?? 0) + (f.max ?? 10)) / 2)}
                  onChange={(e) => set(f.id, Number(e.target.value))} style={{ flex: 1, accentColor: "#2AC38B", padding: 0 }} aria-valuetext={typeof v === "number" ? String(v) : "não respondido"} />
                <b style={{ minWidth: 70, textAlign: "right" }}>{typeof v === "number" ? `${v}/${f.max ?? 10}` : "—"}</b>
              </div>
            )}
            {f.type === "yesno" && (
              <div className="row" role="radiogroup" aria-labelledby={id}>
                {[["Sim", true], ["Não", false]].map(([lbl, val]) => (
                  <label key={String(lbl)} style={{ display: "flex", gap: 6, alignItems: "center", margin: 0, color: "var(--g)", cursor: "pointer" }}>
                    <input type="radio" name={id} checked={v === val} onChange={() => set(f.id, val as boolean)} style={{ width: 18, height: 18, accentColor: "#2AC38B" }} /> {lbl as string}
                  </label>
                ))}
              </div>
            )}
            {f.type === "choice" && (
              <div role="radiogroup" aria-labelledby={id}>
                {(f.options ?? []).map((o) => (
                  <label key={o} style={{ display: "flex", gap: 8, alignItems: "center", margin: "4px 0", color: "var(--g)", cursor: "pointer" }}>
                    <input type="radio" name={id} checked={v === o} onChange={() => set(f.id, o)} style={{ width: 18, height: 18, accentColor: "#2AC38B" }} /> {o}
                  </label>
                ))}
              </div>
            )}
            {errors[f.id] && <div className="err" style={{ margin: "6px 0 0" }}>{f.label}: {errors[f.id]}</div>}
          </div>
        );
      })}
    </div>
  );
}

/** Texto legível de uma resposta (para listas e detalhes). */
export function answerText(f: Field, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (f.type === "yesno") return v ? "Sim" : "Não";
  if (f.type === "scale") return `${v}/${f.max ?? 10}`;
  if (f.type === "number") return `${v}${f.unit ? ` ${f.unit}` : ""}`;
  return String(v);
}
