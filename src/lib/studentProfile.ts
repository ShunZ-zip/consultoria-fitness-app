// Dados cadastrais opcionais do aluno (nascimento, WhatsApp, gênero). São dados pessoais: só o aluno e o personal da
// consultoria acessam. Regras puras de validação e apresentação (testáveis).
export const GENDERS = [
  { v: "female", l: "Feminino" }, { v: "male", l: "Masculino" }, { v: "other", l: "Outro" }, { v: "undisclosed", l: "Prefiro não informar" },
] as const;
export type Gender = (typeof GENDERS)[number]["v"];
export const genderLabel = (g: string | null | undefined) => GENDERS.find((x) => x.v === g)?.l ?? null;

/**
 * Telefone só com dígitos e DDI. Com "+" o país já veio no número e nada é acrescentado. Sem "+": 10 ou 11 dígitos (DDD + número, formato brasileiro) ganham o 55;
 * 12 ou 13 começando em 55 ficam como estão; outros números internacionais de 11 a 15 dígitos são aceitos como vieram.
 */
export function normalizePhone(input: string | null | undefined): string | null {
  const raw = String(input ?? "");
  const d = raw.replace(/\D/g, "").replace(/^0+/, "");
  if (/^\s*\+/.test(raw)) return d.length >= 11 && d.length <= 15 ? d : null;   // com "+" o país já foi informado: não acrescenta o 55
  if (d.length === 10 || d.length === 11) return "55" + d;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  if (d.length >= 11 && d.length <= 15) return d;
  return null;
}

/** "+55 (11) 91234-5678" para números brasileiros; "+" + dígitos para os demais. */
export function formatPhone(digits: string | null | undefined): string {
  if (!digits) return "";
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(digits);
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : `+${digits}`;
}
export const whatsappLink = (digits: string) => `https://wa.me/${digits}`;

/** AAAA-MM-DD real, não no futuro e a partir de 1900. */
export function isValidBirthDate(key: unknown, today: string): key is string {
  if (typeof key !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const d = new Date(key + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === key && key <= today && key >= "1900-01-01";
}

/** Idade completa em anos na data `today` (AAAA-MM-DD). */
export function ageOn(birth: string, today: string): number {
  const [by, bm, bd] = birth.split("-").map(Number), [ty, tm, td] = today.split("-").map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

export interface ProfileInput { birthDate: string | null; phone: string | null; gender: Gender | null }

/** Valida e normaliza; devolve a mensagem de erro (pt-BR) ou os dados limpos. */
export function cleanProfile(raw: { birthDate?: string | null; phone?: string | null; gender?: string | null }, today: string): { error: string } | { data: ProfileInput } {
  const birthDate = raw.birthDate || null;
  if (birthDate && !isValidBirthDate(birthDate, today)) return { error: "Data de nascimento inválida" };
  let phone: string | null = null;
  if (raw.phone && raw.phone.trim()) { phone = normalizePhone(raw.phone); if (!phone) return { error: "WhatsApp inválido: informe o DDD e o número" }; }
  const gender = raw.gender || null;
  if (gender && !GENDERS.some((g) => g.v === gender)) return { error: "Gênero inválido" };
  return { data: { birthDate, phone, gender: gender as Gender | null } };
}
