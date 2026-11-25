// Volume por músculo (regra de monitoramento, PROPOSTA do documento):
//   volume ponderado = séries diretas + séries indiretas × peso
// Só séries de TRABALHO entram em diretas/indiretas. Aquecimento e preparação são
// contadas à parte (no músculo primário) e nunca somam ao ponderado.
// Convenção provisória: exercício com vários músculos primários conta 1 direta em cada um.
export type SetType = "warmup" | "prep" | "work";

export interface VolumeExercise {
  primary: string[];
  secondary: string[];
  sets: { setType: SetType }[];
}

export interface MuscleVolume {
  muscle: string;
  direct: number;
  indirect: number;
  weighted: number;
  warmup: number;
  prep: number;
}

export const ALLOWED_WEIGHTS = [0, 0.25, 0.5, 0.75, 1] as const;
export const DEFAULT_INDIRECT_WEIGHT = 0.5;

export function computeVolume(exercises: VolumeExercise[], indirectWeight: number): MuscleVolume[] {
  const m = new Map<string, MuscleVolume>();
  const get = (muscle: string) => {
    let v = m.get(muscle);
    if (!v) m.set(muscle, (v = { muscle, direct: 0, indirect: 0, weighted: 0, warmup: 0, prep: 0 }));
    return v;
  };
  for (const e of exercises) {
    for (const s of e.sets) {
      if (s.setType === "work") {
        for (const p of e.primary) get(p).direct += 1;
        for (const q of e.secondary) get(q).indirect += 1;
      } else {
        for (const p of e.primary) get(p)[s.setType] += 1;
      }
    }
  }
  const out = [...m.values()];
  for (const v of out) v.weighted = Math.round((v.direct + v.indirect * indirectWeight) * 100) / 100;
  return out.sort((a, b) => b.weighted - a.weighted || b.direct - a.direct || a.muscle.localeCompare(b.muscle, "pt-BR"));
}
