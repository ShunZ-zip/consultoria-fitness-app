// Mídia do exercício: animação oficial, vídeo próprio do personal, ou as duas (CONFIRMADO).
// Escopo: vale para todos os alunos do personal quando o exercício é prescrito, ou para um aluno específico
// (a regra do aluno prevalece). Outra consultoria nunca recebe essa personalização.
export type MediaMode = "official" | "own" | "both";
export interface MediaItem { id: string; kind: "animation" | "video"; title: string; url: string; license: string | null }
export interface MediaPref { studentId: string | null; mode: MediaMode; ownMediaId: string | null }
export interface ResolvedMedia { mode: MediaMode; fallback: boolean; items: (MediaItem & { source: "official" | "own" })[] }

/** Preferência do aluno > preferência geral da consultoria > nenhuma. */
export function pickPref(prefs: MediaPref[], studentId: string | null): MediaPref | null {
  return (studentId && prefs.find((p) => p.studentId === studentId)) || prefs.find((p) => p.studentId === null) || null;
}

export function resolveMedia(official: MediaItem[], own: MediaItem[], pref: MediaPref | null): ResolvedMedia {
  const o = official.map((m) => ({ ...m, source: "official" as const }));
  const chosenOwn = (() => {
    const mine = own.map((m) => ({ ...m, source: "own" as const }));
    if (pref?.ownMediaId) return mine.filter((m) => m.id === pref.ownMediaId);
    return mine.slice(0, 1); // sem escolha explícita: o vídeo próprio mais antigo
  })();
  const mode: MediaMode = pref?.mode ?? "official";
  if (mode === "both") return { mode, fallback: false, items: [...o, ...chosenOwn] };
  if (mode === "own") return chosenOwn.length ? { mode, fallback: false, items: chosenOwn } : { mode, fallback: o.length > 0, items: o };
  return o.length ? { mode, fallback: false, items: o } : { mode, fallback: chosenOwn.length > 0, items: chosenOwn };
}

/** Só https (sem javascript:, data:, http:). Evita links maliciosos no aparelho do aluno. */
export function isSafeMediaUrl(raw: string): boolean {
  try { const u = new URL(raw); return u.protocol === "https:" && !!u.hostname; } catch { return false; }
}
export const isDirectVideoFile = (url: string) => /\.(mp4|webm|mov)(\?.*)?$/i.test(url);

export const isImageFile = (url: string) => /\.(svg|gif|webp|png)(\?.*)?$/i.test(url);
