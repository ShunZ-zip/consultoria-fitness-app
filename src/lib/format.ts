export interface PrescribedSetView {
  setType?: "warmup" | "prep" | "work";
  reps: number | null; repsMax?: number | null;
  loadKg: number | null; loadPct?: number | null;
  rir: number | null; rpe?: number | null;
  restS: number | null; tempo?: string | null; note?: string | null;
}

export const SET_TYPE_LABEL: Record<string, string> = { warmup: "Aquecimento", prep: "Preparação", work: "Trabalho" };

export function repsText(s: PrescribedSetView): string {
  if (s.reps == null) return "—";
  return s.repsMax != null && s.repsMax !== s.reps ? `${s.reps}–${s.repsMax}` : String(s.reps);
}
export function loadText(s: PrescribedSetView): string {
  if (s.loadPct != null) return `${s.loadPct}% 1RM`;
  return s.loadKg != null ? `${s.loadKg} kg` : "—";
}
export function effortText(s: PrescribedSetView): string {
  if (s.rir != null) return `RIR ${s.rir}`;
  if (s.rpe != null) return `RPE ${s.rpe}`;
  return "";
}
/** Ex.: "8–12 × 80% 1RM · RIR 2" */
export function prescribedText(s: PrescribedSetView): string {
  const base = `${repsText(s)} × ${loadText(s)}`;
  const e = effortText(s);
  return e ? `${base} · ${e}` : base;
}
