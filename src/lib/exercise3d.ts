// Animações 3D ORIGINAIS dos exercícios oficiais (sem material de terceiros).
// Boneco articulado com membros de comprimento fixo: o movimento é definido por ângulos (cinemática direta) e interpolado
// entre a posição inicial (a) e a final (b). Este módulo é puro (sem three.js): o componente Exercise3D só desenha o resultado.
// Convenção: x = para frente do boneco, y = para cima, z = lado direito. Ângulos em graus, estilo "tela" (90° = para baixo, -90° = para cima).

export type V3 = [number, number, number];
export const SCALE = 0.01; // 1 unidade de comprimento = 1 cm
export const LEN = { torso: 0.7, ua: 0.4, fa: 0.38, thigh: 0.55, shin: 0.55, foot: 0.22, neck: 0.16, head: 0.3 };
export const HALF = { hip: 0.09, shoulder: 0.2 };

export interface Pose { torso: number; thigh: number; shin: number; foot: number; ua: number; fa: number }
export type Anchor = { type: "hip"; y: number } | { type: "ground"; x: number } | { type: "toe"; x: number };
export type Muscle = "quad" | "ham" | "glute" | "calf" | "chest" | "back" | "lowback" | "delt" | "biceps" | "triceps" | "abs";

export interface Joints {
  hipC: V3; shoulderC: V3; head: V3; neckTop: V3;
  hip: [V3, V3]; shoulder: [V3, V3]; elbow: [V3, V3]; wrist: [V3, V3]; knee: [V3, V3]; ankle: [V3, V3]; toe: [V3, V3];
  /** Direção do peito (para onde a frente do tronco aponta). */
  front: V3;
}

export type Shape =
  | { t: "box"; c: V3; s: V3; rz?: number }          // caixa (banco, assento, apoio); rz = giro em torno de z
  | { t: "cyl"; a: V3; b: V3; r: number }            // haste entre dois pontos (barra, cabo, trilho)
  | { t: "disc"; c: V3; r: number; th: number }      // anilha (eixo ao longo de z)
  | { t: "ball"; c: V3; r: number };

export interface Spec {
  anchor: Anchor; a: Pose; b: Pose; muscles: Muscle[];
  /** "frontal": ângulos dos braços medidos no plano frontal (0 = para o lado, 90 = para baixo). */
  armPlane?: "sagittal" | "frontal";
  prone?: boolean; // deitado de bruços: a frente do tronco aponta para baixo
  equip: (j: Joints, u: number) => Shape[];
  tip: string;
}

const rad = (d: number) => (d * Math.PI) / 180;
const d2 = (deg: number): [number, number] => [Math.cos(rad(deg)), -Math.sin(rad(deg))]; // (x, y) com y para cima
const add = (p: V3, q: V3): V3 => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
const sub = (p: V3, q: V3): V3 => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const mul = (p: V3, k: number): V3 => [p[0] * k, p[1] * k, p[2] * k];
const mid = (p: V3, q: V3): V3 => mul(add(p, q), 0.5);
const lerpN = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerpV = (p: V3, q: V3, t: number): V3 => [lerpN(p[0], q[0], t), lerpN(p[1], q[1], t), lerpN(p[2], q[2], t)];
const dir2 = (deg: number, len: number): V3 => { const [x, y] = d2(deg); return [x * len, y * len, 0]; };

/** Posição das articulações para uma pose. Mantém os comprimentos dos segmentos; o ponto de apoio vem da âncora. */
export function joints(p: Pose, anchor: Anchor, armPlane: "sagittal" | "frontal" = "sagittal", prone = false): Joints {
  const hipC: V3 = [0, 0, 0];
  const shoulderC = add(hipC, dir2(p.torso, LEN.torso));
  const head = add(shoulderC, dir2(p.torso, LEN.head));
  const neckTop = add(shoulderC, dir2(p.torso, LEN.neck));
  const sides = [1, -1] as const; // 0 = lado próximo à câmera (z+), 1 = lado distante (z-)
  const hip = sides.map((s) => [0, 0, s * HALF.hip] as V3) as [V3, V3];
  const shoulder = sides.map((s) => add(shoulderC, [0, 0, s * HALF.shoulder])) as [V3, V3];
  const knee = hip.map((h) => add(h, dir2(p.thigh, LEN.thigh))) as [V3, V3];
  const ankle = knee.map((k) => add(k, dir2(p.shin, LEN.shin))) as [V3, V3];
  const toe = ankle.map((a) => add(a, dir2(p.foot, LEN.foot))) as [V3, V3];
  const arm = (ang: number, len: number, s: number): V3 => {
    if (armPlane === "frontal") { const rr = rad(ang); return [0, -Math.sin(rr) * len, s * Math.cos(rr) * len]; }
    return dir2(ang, len);
  };
  const elbow = shoulder.map((sh, i) => add(sh, arm(p.ua, LEN.ua, sides[i]))) as [V3, V3];
  const wrist = elbow.map((e, i) => add(e, arm(p.fa, LEN.fa, sides[i]))) as [V3, V3];
  const tdir = d2(p.torso);
  const front: V3 = [(prone ? -1 : 1) * tdir[1], (prone ? -1 : 1) * -tdir[0], 0];
  const J: Joints = { hipC, shoulderC, head, neckTop, hip, shoulder, elbow, wrist, knee, ankle, toe, front };
  // âncora: translada o conjunto
  let off: V3 = [0, 0, 0];
  if (anchor.type === "hip") off = [0, anchor.y, 0];
  else {
    const low = Math.min(ankle[0][1], toe[0][1]);
    if (anchor.type === "ground") off = [anchor.x - ankle[0][0], 0.04 - low, 0];
    else off = [anchor.x - toe[0][0], 0.04 - toe[0][1], 0];
  }
  const m = (v: V3): V3 => add(v, off);
  const m2 = (v: [V3, V3]): [V3, V3] => [m(v[0]), m(v[1])];
  return { hipC: m(hipC), shoulderC: m(shoulderC), head: m(head), neckTop: m(neckTop), hip: m2(hip), shoulder: m2(shoulder), elbow: m2(elbow), wrist: m2(wrist), knee: m2(knee), ankle: m2(ankle), toe: m2(toe), front };
}

const smooth = (t: number) => t * t * (3 - 2 * t);
/** Posição na repetição: u = 0 (início) → 1 (fim) → 0, com pausa nas pontas. phase em 0..1. */
export function repetition(phase: number): number {
  const p = ((phase % 1) + 1) % 1;
  const hold = 0.12, ramp = 0.38; // 12% parado, 38% subindo, 12% parado, 38% descendo
  if (p < hold) return 0;
  if (p < hold + ramp) return smooth((p - hold) / ramp);
  if (p < 2 * hold + ramp) return 1;
  return smooth(1 - (p - 2 * hold - ramp) / ramp);
}

export function poseAt(spec: Spec, u: number): Pose {
  const o = { torso: 0, thigh: 0, shin: 0, foot: 0, ua: 0, fa: 0 } as Pose;
  (Object.keys(o) as (keyof Pose)[]).forEach((k) => { o[k] = lerpN(spec.a[k], spec.b[k], u); });
  return o;
}
export const jointsAt = (spec: Spec, u: number): Joints => joints(poseAt(spec, u), spec.anchor, spec.armPlane ?? "sagittal", spec.prone ?? false);

// ------------------------------------------------------------------ equipamento
const bar = (c: V3, r = 0.14): Shape[] => [
  { t: "cyl", a: add(c, [0, 0, -0.65]), b: add(c, [0, 0, 0.65]), r: 0.014 },
  { t: "disc", c: add(c, [0, 0, 0.5]), r, th: 0.04 }, { t: "disc", c: add(c, [0, 0, -0.5]), r, th: 0.04 },
];
const dumbbells = (j: Joints, r = 0.065): Shape[] => [0, 1].flatMap((i) => [
  { t: "cyl", a: add(j.wrist[i], [0, 0, -0.07]), b: add(j.wrist[i], [0, 0, 0.07]), r: 0.014 } as Shape,
  { t: "disc", c: add(j.wrist[i], [0, 0, 0.07]), r, th: 0.035 } as Shape, { t: "disc", c: add(j.wrist[i], [0, 0, -0.07]), r, th: 0.035 } as Shape,
]);
const seat = (j: Joints, hy = j.hipC): Shape[] => [{ t: "box", c: [hy[0] + 0.1, hy[1] - 0.1, 0], s: [0.55, 0.1, 0.5] }];
const backrest = (j: Joints, ang: number, len = 0.8): Shape[] => {
  const o: V3 = [j.hipC[0] - 0.1, j.hipC[1] - 0.04, 0];
  return [{ t: "cyl", a: o, b: add(o, dir2(ang, len)), r: 0.07 }];
};
const lyingBench = (j: Joints): Shape[] => [{ t: "box", c: [j.hipC[0] - 0.25, j.hipC[1] - 0.15, 0], s: [1.5, 0.12, 0.34] }, { t: "box", c: [j.hipC[0] - 0.9, j.hipC[1] - 0.36, 0], s: [0.1, 0.4, 0.3] }, { t: "box", c: [j.hipC[0] + 0.4, j.hipC[1] - 0.36, 0], s: [0.1, 0.4, 0.3] }];
const cable = (top: V3, j: Joints): Shape[] => [{ t: "cyl", a: top, b: mid(j.wrist[0], j.wrist[1]), r: 0.006 }, { t: "cyl", a: add(mid(j.wrist[0], j.wrist[1]), [0, 0, -0.18]), b: add(mid(j.wrist[0], j.wrist[1]), [0, 0, 0.18]), r: 0.014 }];
const shoulderBar = (j: Joints): Shape[] => bar(add(j.shoulderC, [-0.04, 0.1, 0]), 0.17);
const wristBar = (j: Joints, r = 0.14): Shape[] => bar(mid(j.wrist[0], j.wrist[1]), r);

const stand = (o: Partial<Pose> = {}): Pose => ({ torso: -90, thigh: 90, shin: 90, foot: 0, ua: 92, fa: 92, ...o });

export const SPECS: Record<string, Spec> = {
  "Agachamento livre": { tip: "Joelhos acompanham a ponta dos pés; tronco firme; desça até onde mantiver a coluna neutra.", anchor: { type: "ground", x: 0 },
    a: stand({ torso: -88, thigh: 92, shin: 88, ua: 100, fa: -110 }), b: { torso: -62, thigh: 12, shin: 112, foot: 0, ua: 100, fa: -110 }, muscles: ["quad", "glute"], equip: (j) => shoulderBar(j) },
  "Leg press 45°": { tip: "Pés na plataforma na largura dos ombros; não estique os joelhos até travar.", anchor: { type: "hip", y: 0.5 },
    a: { torso: -150, thigh: -75, shin: 25, foot: 20, ua: -20, fa: 20 }, b: { torso: -150, thigh: -38, shin: -38, foot: 20, ua: -20, fa: 20 }, muscles: ["quad", "glute"],
    equip: (j) => { const c = add(mid(j.ankle[0], j.ankle[1]), dir2(-38, 0.08)); const p1 = add(c, dir2(52, 0.32)), p2 = add(c, dir2(-128, 0.32));
      return [{ t: "box", c: [j.hipC[0] - 0.12, j.hipC[1] - 0.12, 0], s: [0.5, 0.1, 0.5] }, ...backrest(j, -150, 0.85), { t: "cyl", a: add(p1, [0, 0, 0.3]), b: add(p2, [0, 0, 0.3]), r: 0.03 }, { t: "cyl", a: add(p1, [0, 0, -0.3]), b: add(p2, [0, 0, -0.3]), r: 0.03 }, { t: "cyl", a: add(p1, [0, 0, -0.3]), b: add(p1, [0, 0, 0.3]), r: 0.03 }, { t: "cyl", a: add(p2, [0, 0, -0.3]), b: add(p2, [0, 0, 0.3]), r: 0.03 }]; } },
  "Cadeira extensora": { tip: "Estenda os joelhos sem balançar o corpo; volte devagar.", anchor: { type: "hip", y: 0.5 },
    a: { torso: -92, thigh: -2, shin: 88, foot: 0, ua: 70, fa: 20 }, b: { torso: -92, thigh: -2, shin: 8, foot: -75, ua: 70, fa: 20 }, muscles: ["quad"],
    equip: (j) => [...seat(j), ...backrest(j, -92, 0.85), { t: "cyl", a: add(j.ankle[0], [0.03, 0.02, 0]), b: add(j.ankle[1], [0.03, 0.02, 0]), r: 0.045 }] },
  "Mesa flexora": { tip: "Quadril colado no banco; flexione os joelhos sem tirar o quadril.", anchor: { type: "hip", y: 0.55 }, prone: true,
    a: { torso: 180, thigh: 0, shin: 0, foot: -70, ua: 180, fa: 180 }, b: { torso: 180, thigh: 0, shin: -105, foot: -175, ua: 180, fa: 180 }, muscles: ["ham"],
    equip: (j) => [...lyingBench(j), { t: "cyl", a: add(j.ankle[0], [0.03, 0.04, 0]), b: add(j.ankle[1], [0.03, 0.04, 0]), r: 0.04 }] },
  "Stiff": { tip: "Joelhos levemente flexionados; leve o quadril para trás mantendo a coluna reta.", anchor: { type: "ground", x: 0 },
    a: stand({ torso: -92 }), b: { torso: -18, thigh: 76, shin: 100, foot: 0, ua: 92, fa: 92 }, muscles: ["ham", "glute", "lowback"], equip: (j) => wristBar(j) },
  "Panturrilha em pé": { tip: "Suba na ponta dos pés o máximo que conseguir e desça controlando.", anchor: { type: "toe", x: 0.1 },
    a: { torso: -90, thigh: 90, shin: 90, foot: 8, ua: 95, fa: -100 }, b: { torso: -90, thigh: 90, shin: 90, foot: 55, ua: 95, fa: -100 }, muscles: ["calf"],
    equip: (j) => [{ t: "box", c: [j.toe[0][0] - 0.1, 0.02, 0], s: [0.35, 0.04, 0.4] }, { t: "box", c: [j.shoulderC[0], j.shoulderC[1] + 0.12, 0], s: [0.16, 0.12, 0.5] }] },
  "Supino reto": { tip: "Escápulas juntas no banco; a barra desce até o peito e sobe em linha.", anchor: { type: "hip", y: 0.52 },
    a: { torso: 180, thigh: -10, shin: 90, foot: 0, ua: -90, fa: -90 }, b: { torso: 180, thigh: -10, shin: 90, foot: 0, ua: 75, fa: -80 }, muscles: ["chest"],
    equip: (j) => [...lyingBench(j), ...wristBar(j, 0.15)] },
  "Supino inclinado com halteres": { tip: "Banco inclinado; desça os halteres até a linha do peito e empurre para cima.", anchor: { type: "hip", y: 0.5 },
    a: { torso: -145, thigh: 10, shin: 80, foot: 0, ua: -55, fa: -55 }, b: { torso: -145, thigh: 10, shin: 80, foot: 0, ua: 85, fa: -75 }, muscles: ["chest"],
    equip: (j) => [...backrest(j, -145, 0.95), ...seat(j), ...dumbbells(j)] },
  "Crucifixo": { tip: "Cotovelos levemente flexionados; abra os braços até sentir o peito alongar e feche em arco.", anchor: { type: "hip", y: 0.52 }, armPlane: "frontal",
    a: { torso: 180, thigh: -10, shin: 90, foot: 0, ua: -90, fa: -90 }, b: { torso: 180, thigh: -10, shin: 90, foot: 0, ua: -8, fa: -8 }, muscles: ["chest"],
    equip: (j) => [...lyingBench(j), ...dumbbells(j)] },
  "Remada curvada": { tip: "Tronco inclinado e coluna neutra; puxe a barra em direção ao abdômen.", anchor: { type: "ground", x: 0 },
    a: { torso: -28, thigh: 70, shin: 105, foot: 0, ua: 90, fa: 90 }, b: { torso: -28, thigh: 70, shin: 105, foot: 0, ua: 150, fa: 95 }, muscles: ["back"], equip: (j) => wristBar(j) },
  "Puxada frontal": { tip: "Peito aberto; leve a barra até a parte alta do peito, cotovelos para baixo.", anchor: { type: "hip", y: 0.5 },
    a: { torso: -98, thigh: -5, shin: 95, foot: 0, ua: -75, fa: -85 }, b: { torso: -98, thigh: -5, shin: 95, foot: 0, ua: 100, fa: -110 }, muscles: ["back"],
    equip: (j) => [...seat(j), { t: "box", c: [j.hipC[0] + 0.5, j.hipC[1] + 0.2, 0], s: [0.12, 0.12, 0.5] }, ...cable([j.hipC[0] + 0.15, 2.3, 0], j)] },
  "Desenvolvimento com halteres": { tip: "Sentado com apoio nas costas; empurre os halteres para cima sem arquear a lombar.", anchor: { type: "hip", y: 0.5 },
    a: { torso: -92, thigh: -3, shin: 92, foot: 0, ua: 75, fa: -85 }, b: { torso: -92, thigh: -3, shin: 92, foot: 0, ua: -85, fa: -90 }, muscles: ["delt"],
    equip: (j) => [...seat(j), ...backrest(j, -92, 0.95), ...dumbbells(j)] },
  "Elevação lateral": { tip: "Braços sobem para os lados até a altura dos ombros, cotovelos levemente flexionados.", anchor: { type: "ground", x: 0 }, armPlane: "frontal",
    a: stand({ ua: 88, fa: 90 }), b: stand({ ua: 5, fa: 8 }), muscles: ["delt"], equip: (j) => dumbbells(j, 0.05) },
  "Rosca direta": { tip: "Cotovelos colados ao corpo; só o antebraço se move.", anchor: { type: "ground", x: 0 },
    a: stand({ ua: 92, fa: 90 }), b: stand({ ua: 92, fa: -65 }), muscles: ["biceps"], equip: (j) => wristBar(j, 0.1) },
  "Tríceps na polia": { tip: "Cotovelos fixos ao lado do corpo; estenda os braços até embaixo.", anchor: { type: "ground", x: 0 },
    a: stand({ torso: -86, ua: 95, fa: -50 }), b: stand({ torso: -86, ua: 95, fa: 85 }), muscles: ["triceps"], equip: (j) => cable([j.shoulderC[0] + 0.2, 2.3, 0], j) },
  "Abdominal na máquina": { tip: "Encurte a distância entre o peito e o quadril expirando; volte devagar.", anchor: { type: "hip", y: 0.5 },
    a: { torso: -100, thigh: -5, shin: 95, foot: 0, ua: 45, fa: -140 }, b: { torso: -55, thigh: -5, shin: 95, foot: 0, ua: 45, fa: -140 }, muscles: ["abs"],
    equip: (j) => [...seat(j), ...backrest(j, -105, 0.8)] },
};

export const slugify = (name: string) => name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const SLUG_TO_NAME: Record<string, string> = Object.fromEntries(Object.keys(SPECS).map((n) => [slugify(n), n]));
export const has3D = (name: string) => name in SPECS;
export const MODEL_URL_PREFIX = "3d:";
export const modelUrl = (name: string) => `${MODEL_URL_PREFIX}${slugify(name)}`;
export const nameFromModelUrl = (url: string): string | null => (url.startsWith(MODEL_URL_PREFIX) ? SLUG_TO_NAME[url.slice(MODEL_URL_PREFIX.length)] ?? null : null);

export { sub, mid, add, mul, dir2 };
