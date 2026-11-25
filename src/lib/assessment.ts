// Avaliações configuráveis: modelos de campos + validação das respostas.
// Fotos corporais NÃO fazem parte desta entrega (exigem armazenamento privado e política de LGPD).
// O PAR-Q+ oficial NÃO está reproduzido: o modelo de triagem abaixo é próprio do app e não o substitui.
export type FieldType = "text" | "number" | "scale" | "yesno" | "choice";
export interface Field { id: string; label: string; type: FieldType; unit?: string; options?: string[]; min?: number; max?: number; required?: boolean }
export type Answers = Record<string, string | number | boolean | null>;

export interface BuiltinTemplate { key: string; name: string; kind: "measures" | "anamnesis" | "screening" | "tests"; note?: string; fields: Field[] }

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    key: "medidas", name: "Medidas corporais", kind: "measures", fields: [
      { id: "peso", label: "Peso", type: "number", unit: "kg", required: true },
      { id: "altura", label: "Altura", type: "number", unit: "cm" },
      { id: "cintura", label: "Perímetro da cintura", type: "number", unit: "cm" },
      { id: "quadril", label: "Perímetro do quadril", type: "number", unit: "cm" },
      { id: "braco", label: "Perímetro do braço", type: "number", unit: "cm" },
      { id: "coxa", label: "Perímetro da coxa", type: "number", unit: "cm" },
      { id: "dobra_triceps", label: "Dobra cutânea tricipital", type: "number", unit: "mm" },
      { id: "dobra_abdominal", label: "Dobra cutânea abdominal", type: "number", unit: "mm" },
      { id: "bioimpedancia_gordura", label: "Gordura corporal (bioimpedância, aparelho externo)", type: "number", unit: "%" },
    ],
  },
  {
    key: "anamnese", name: "Anamnese básica", kind: "anamnesis", fields: [
      { id: "objetivo", label: "Qual é o seu principal objetivo?", type: "text", required: true },
      { id: "experiencia", label: "Experiência com musculação", type: "choice", options: ["Nenhuma", "Menos de 1 ano", "1 a 3 anos", "Mais de 3 anos"], required: true },
      { id: "dias", label: "Quantos dias por semana pode treinar?", type: "number", unit: "dias" },
      { id: "lesoes", label: "Lesões ou dores atuais ou passadas", type: "text" },
      { id: "medicamentos", label: "Medicamentos de uso contínuo", type: "text" },
      { id: "restricoes", label: "Restrições ou observações importantes", type: "text" },
    ],
  },
  {
    key: "triagem", name: "Triagem de prontidão (modelo do app)", kind: "screening",
    note: "Modelo próprio do app. NÃO é o PAR-Q+ e não substitui avaliação médica nem do profissional.",
    fields: [
      { id: "dor_peito", label: "Sente dor no peito ao fazer esforço?", type: "yesno", required: true },
      { id: "tontura", label: "Já teve tontura intensa ou desmaio durante esforço?", type: "yesno", required: true },
      { id: "pressao", label: "Tem pressão alta ou condição cardíaca diagnosticada?", type: "yesno", required: true },
      { id: "cronica", label: "Tem alguma condição crônica de saúde em tratamento?", type: "yesno", required: true },
      { id: "lesao_atual", label: "Tem alguma lesão ou dor articular atual?", type: "yesno", required: true },
      { id: "gestante", label: "Está gestante ou no pós-parto recente?", type: "yesno" },
      { id: "detalhes", label: "Se respondeu sim a algo, descreva", type: "text" },
    ],
  },
  {
    key: "testes", name: "Testes de desempenho", kind: "tests", fields: [
      { id: "forca_exercicio", label: "Exercício do teste de força", type: "text" },
      { id: "forca_carga", label: "Carga máxima na repetição indicada", type: "number", unit: "kg" },
      { id: "forca_reps", label: "Repetições realizadas", type: "number", unit: "reps" },
      { id: "cardio_teste", label: "Teste cardiorrespiratório (descrição)", type: "text" },
      { id: "cardio_resultado", label: "Resultado do teste cardiorrespiratório", type: "number" },
      { id: "cardio_unidade", label: "Unidade do resultado", type: "text" },
    ],
  },
];

export interface ValidationResult { ok: boolean; errors: Record<string, string>; clean: Answers }

export function validateAnswers(fields: Field[], answers: Record<string, unknown>): ValidationResult {
  const errors: Record<string, string> = {}; const clean: Answers = {};
  const known = new Set(fields.map((f) => f.id));
  for (const k of Object.keys(answers)) if (!known.has(k)) errors[k] = "Campo desconhecido";
  for (const f of fields) {
    const v = answers[f.id];
    const empty = v === undefined || v === null || v === "";
    if (empty) { if (f.required) errors[f.id] = "Obrigatório"; clean[f.id] = null; continue; }
    switch (f.type) {
      case "text":
        if (typeof v !== "string") errors[f.id] = "Texto inválido";
        else if (v.length > 2000) errors[f.id] = "Máximo de 2000 caracteres";
        else clean[f.id] = v.trim();
        break;
      case "number":
        if (typeof v !== "number" || !Number.isFinite(v)) errors[f.id] = "Número inválido";
        else if (v < 0 || v > 100000) errors[f.id] = "Fora do intervalo";
        else clean[f.id] = v;
        break;
      case "scale": {
        const lo = f.min ?? 0, hi = f.max ?? 10;
        if (typeof v !== "number" || !Number.isInteger(v) || v < lo || v > hi) errors[f.id] = `Escolha de ${lo} a ${hi}`;
        else clean[f.id] = v;
        break;
      }
      case "yesno":
        if (typeof v !== "boolean") errors[f.id] = "Responda sim ou não"; else clean[f.id] = v;
        break;
      case "choice":
        if (typeof v !== "string" || !(f.options ?? []).includes(v)) errors[f.id] = "Opção inválida"; else clean[f.id] = v;
        break;
    }
  }
  return { ok: Object.keys(errors).length === 0, errors, clean };
}

/** Variação numérica entre a avaliação atual e a anterior do mesmo modelo (para medidas). */
export function numericDeltas(fields: Field[], current: Answers, previous: Answers | null): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const f of fields) {
    if (f.type !== "number") continue;
    const a = current[f.id], b = previous?.[f.id];
    out[f.id] = typeof a === "number" && typeof b === "number" ? Math.round((a - b) * 100) / 100 : null;
  }
  return out;
}
