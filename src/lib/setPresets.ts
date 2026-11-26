// Presets de séries: modelos prontos para preencher as séries de um exercício de uma vez.
// Cada preset usa os MESMOS campos da prescrição por série (nada novo no modelo de dados): o personal ajusta depois.
// Os presets do app são propostas didáticas; "Seus presets" são do personal (tabela set_presets).
export type PresetSetType = "warmup" | "prep" | "work";
export interface PresetSet {
  setType: PresetSetType; reps: number | null; repsMax: number | null; loadKg: number | null; loadPct: number | null;
  rir: number | null; rpe: number | null; restS: number | null; tempo: string | null; note: string | null;
}
export interface AppPreset { id: string; name: string; description: string; sets: PresetSet[] }

const set = (o: Partial<PresetSet> = {}): PresetSet => ({
  setType: "work", reps: null, repsMax: null, loadKg: null, loadPct: null, rir: null, rpe: null, restS: 60, tempo: null, note: null, ...o,
});
const times = (n: number, o: Partial<PresetSet>) => Array.from({ length: n }, () => set(o));

/** Preset usado por "Usar preset padrão". */
export const DEFAULT_PRESET_ID = "3x12";

export const APP_PRESETS: AppPreset[] = [
  { id: "3x12", name: "3×12", description: "3 séries de 12 repetições, 60 s de descanso.", sets: times(3, { reps: 12 }) },
  {
    id: "piramide-crescente", name: "Pirâmide crescente", description: "4 séries: 12, 10, 8 e 6 repetições, subindo a carga a cada série.",
    sets: [12, 10, 8, 6].map((reps, i) => set({ reps, restS: 90, note: i === 0 ? "Comece leve e suba a carga a cada série." : null })),
  },
  {
    id: "piramide-decrescente", name: "Pirâmide decrescente", description: "4 séries: 6, 8, 10 e 12 repetições, reduzindo a carga a cada série.",
    sets: [6, 8, 10, 12].map((reps, i) => set({ reps, restS: 90, note: i === 0 ? "Comece pesado e reduza a carga a cada série." : null })),
  },
  {
    id: "drop-set", name: "Drop set", description: "3 séries de 8 a 10; na última, reduza a carga e siga sem descanso.",
    sets: [set({ reps: 8, repsMax: 10, restS: 90 }), set({ reps: 8, repsMax: 10, restS: 90 }),
      set({ reps: 8, repsMax: 10, restS: 0, note: "Drop set: ao chegar perto da falha, reduza cerca de 20% da carga e continue sem descanso." })],
  },
  {
    id: "falha-ultima", name: "Falha na última série", description: "3 séries de 10; só a última vai até a falha (RIR 0).",
    sets: [set({ reps: 10, rir: 2, restS: 90 }), set({ reps: 10, rir: 2, restS: 90 }), set({ reps: 10, rir: 0, restS: 90, note: "Última série até a falha técnica." })],
  },
  {
    id: "rest-pause", name: "Rest-pause", description: "1 série até perto da falha, pausa curta e mais repetições.",
    sets: [set({ reps: 8, repsMax: 12, rir: 0, restS: 120, note: "Rest-pause: ao falhar, descanse 15 s e faça mais repetições; repita 2 vezes." })],
  },
  {
    id: "isometria", name: "Isometria", description: "3 séries segurando a posição; a duração fica na orientação.",
    sets: times(3, { reps: 1, restS: 60, note: "Segure a posição por 30 s." }),
  },
  {
    id: "cluster", name: "Cluster", description: "4 séries de 5 com pausas curtas entre grupos de repetições.",
    sets: times(4, { reps: 5, restS: 120, note: "Cluster: 2 repetições, 15 s de pausa, 2 repetições, 15 s de pausa, 1 repetição." }),
  },
  {
    id: "tempo-controlado", name: "Tempo controlado / cadência", description: "3 séries de 10 com cadência 3-1-1-0.",
    sets: times(3, { reps: 10, tempo: "3-1-1-0", restS: 75 }),
  },
];

export const appPreset = (id: string) => APP_PRESETS.find((p) => p.id === id);

/** Cópia independente das séries (o editor muda cada série sem afetar o preset). */
export const cloneSets = (sets: PresetSet[]): PresetSet[] => sets.map((s) => ({ ...s }));

/** Texto curto para listas: "3 séries · 12 reps". */
export function describeSets(sets: PresetSet[]): string {
  const n = sets.length;
  const reps = sets.map((s) => (s.reps == null ? "?" : s.repsMax ? `${s.reps}–${s.repsMax}` : String(s.reps)));
  const same = reps.every((r) => r === reps[0]);
  return `${n} ${n === 1 ? "série" : "séries"} · ${same ? `${reps[0]} reps` : reps.join("/") + " reps"}`;
}
