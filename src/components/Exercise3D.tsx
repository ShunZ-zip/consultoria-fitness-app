"use client";
import { useEffect, useRef, useState } from "react";
import { add, jointsAt, lerpV, mul, repetition, SPECS, type Joints, type Muscle, type Shape, type V3 } from "../lib/exercise3d";

type THREEns = typeof import("three");
const COLORS = { body: 0xd3d9df, far: 0x8e99a6, muscle: 0x2ac38b, equip: 0x1a73e9, stage: "#14273D", ground: 0x8a97a6 };
const PERIOD = 3.6; // segundos por repetição

interface Part { mesh: import("three").Object3D; update: (j: Joints) => void }

/** Animação 3D do exercício: boneco articulado que o aluno pode girar (arrastar) e ver de lado, de frente ou em 3/4. O músculo principal fica em verde. */
export default function Exercise3D({ name }: { name: string }) {
  const spec = SPECS[name];
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ view: (v: "side" | "front" | "three") => void; setPaused: (p: boolean) => void; setSlow: (s: boolean) => void } | null>(null);
  const [paused, setPaused] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState("");
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (!spec || !host.current) return;
    const el = host.current;
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      let THREE: THREEns, OrbitControls: typeof import("three/examples/jsm/controls/OrbitControls.js").OrbitControls;
      try {
        THREE = await import("three");
        OrbitControls = (await import("three/examples/jsm/controls/OrbitControls.js")).OrbitControls;
      } catch { setError("Não foi possível carregar o visualizador 3D."); return; }
      if (disposed) return;
      let renderer: import("three").WebGLRenderer;
      try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { setError("Seu aparelho não conseguiu abrir o 3D."); return; }
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      const startPaused = mq.matches; setReduced(startPaused); setPaused(startPaused);
      let isPaused = startPaused, speed = 1;

      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      el.appendChild(renderer.domElement);
      renderer.domElement.style.display = "block"; renderer.domElement.style.touchAction = "none";
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(34, 4 / 3, 0.1, 30);
      const target = new THREE.Vector3(0.1, 1.0, 0);
      scene.add(new THREE.AmbientLight(0xffffff, 0.85));
      const sun = new THREE.DirectionalLight(0xffffff, 1.1); sun.position.set(2.5, 4, 3); scene.add(sun);
      const rim = new THREE.DirectionalLight(0xffffff, 0.4); rim.position.set(-3, 2, -3); scene.add(rim);

      const ground = new THREE.Mesh(new THREE.CircleGeometry(1.7, 48), new THREE.MeshBasicMaterial({ color: COLORS.ground, transparent: true, opacity: 0.22 }));
      ground.rotation.x = -Math.PI / 2; scene.add(ground);

      const mBody = new THREE.MeshStandardMaterial({ color: COLORS.body, roughness: 0.65 });
      const mFar = new THREE.MeshStandardMaterial({ color: COLORS.far, roughness: 0.7 });
      const mMuscle = new THREE.MeshStandardMaterial({ color: COLORS.muscle, emissive: 0x0b4d37, roughness: 0.4 });
      const mEquip = new THREE.MeshStandardMaterial({ color: COLORS.equip, roughness: 0.5 });
      const geos: import("three").BufferGeometry[] = [];
      const track = <G extends import("three").BufferGeometry>(g: G) => { geos.push(g); return g; };

      const V = (p: V3) => new THREE.Vector3(p[0], p[1], p[2]);
      const m4 = new THREE.Matrix4();
      /** Orienta e posiciona um objeto entre a e b (eixo local y ao longo do segmento, eixo local z = lado). */
      const orient = (o: import("three").Object3D, a: V3, b: V3) => {
        const d = V(b).sub(V(a)); const len = d.length(); const y = len > 1e-6 ? d.clone().divideScalar(len) : new THREE.Vector3(0, 1, 0);
        const ref = Math.abs(y.z) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
        const x = new THREE.Vector3().crossVectors(y, ref).normalize(); const z = new THREE.Vector3().crossVectors(x, y);
        m4.makeBasis(x, y, z); o.quaternion.setFromRotationMatrix(m4);
        o.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
        return len;
      };

      const root = new THREE.Group(); scene.add(root);
      const parts: Part[] = [];
      const j0 = jointsAt(spec, 0);
      const capsule = (r: number, from: (j: Joints) => V3, to: (j: Joints) => V3, mat: import("three").Material, sz = 1, sx = 1) => {
        const len0 = V(to(j0)).distanceTo(V(from(j0)));
        const mesh = new THREE.Mesh(track(new THREE.CapsuleGeometry(r, Math.max(0.001, len0 - 2 * r), 6, 16)), mat);
        mesh.scale.set(sx, 1, sz); root.add(mesh);
        parts.push({ mesh, update: (j) => { orient(mesh, from(j), to(j)); } });
      };
      const sphere = (r: number, at: (j: Joints) => V3, mat: import("three").Material, sc: V3 = [1, 1, 1], upFrom?: (j: Joints) => [V3, V3]) => {
        const mesh = new THREE.Mesh(track(new THREE.SphereGeometry(r, 20, 14)), mat);
        mesh.scale.set(sc[0], sc[1], sc[2]); root.add(mesh);
        parts.push({ mesh, update: (j) => { if (upFrom) { const [a, b] = upFrom(j); orient(mesh, a, b); mesh.position.set(...at(j)); } else mesh.position.set(...at(j)); } });
      };
      const frac = (a: V3, b: V3, t: number) => lerpV(a, b, t);

      // corpo: tronco, pescoço, cabeça
      capsule(0.12, (j) => j.hipC, (j) => j.shoulderC, mBody, 1.55, 1.05);
      capsule(0.045, (j) => j.shoulderC, (j) => j.neckTop, mBody);
      sphere(0.11, (j) => j.head, mBody);
      for (const i of [1, 0] as const) { // lado distante primeiro (mais escuro)
        const mat = i === 1 ? mFar : mBody;
        capsule(0.085, (j) => j.hip[i], (j) => j.knee[i], mat);
        capsule(0.06, (j) => j.knee[i], (j) => j.ankle[i], mat);
        capsule(0.04, (j) => j.ankle[i], (j) => j.toe[i], mat);
        capsule(0.05, (j) => j.shoulder[i], (j) => j.elbow[i], mat);
        capsule(0.04, (j) => j.elbow[i], (j) => j.wrist[i], mat);
        sphere(0.05, (j) => j.wrist[i], mat);
        sphere(0.06, (j) => j.shoulder[i], mat); sphere(0.05, (j) => j.elbow[i], mat); sphere(0.07, (j) => j.knee[i], mat); sphere(0.07, (j) => j.hip[i], mat);
      }

      // músculos em verde (por cima do corpo, um pouco maiores)
      const muscleParts = (m: Muscle) => {
        const back = (j: Joints, k: number): V3 => mul(j.front, -k);
        const front = (j: Joints, k: number): V3 => mul(j.front, k);
        const tors = (j: Joints, t: number, off: V3): V3 => add(frac(j.hipC, j.shoulderC, t), off);
        switch (m) {
          case "quad": case "ham": for (const i of [0, 1] as const) capsule(0.097, (j) => frac(j.hip[i], j.knee[i], 0.12), (j) => frac(j.hip[i], j.knee[i], 0.92), mMuscle); break;
          case "calf": for (const i of [0, 1] as const) capsule(0.072, (j) => frac(j.knee[i], j.ankle[i], 0.12), (j) => frac(j.knee[i], j.ankle[i], 0.78), mMuscle); break;
          case "glute": for (const i of [0, 1] as const) sphere(0.1, (j) => add(j.hip[i], back(j, 0.04)), mMuscle); break;
          case "delt": for (const i of [0, 1] as const) sphere(0.075, (j) => j.shoulder[i], mMuscle); break;
          case "biceps": case "triceps": for (const i of [0, 1] as const) capsule(0.062, (j) => frac(j.shoulder[i], j.elbow[i], 0.18), (j) => frac(j.shoulder[i], j.elbow[i], 0.88), mMuscle); break;
          case "chest": capsule(0.075, (j) => tors(j, 0.74, add(front(j, 0.085), [0, 0, 0])), (j) => tors(j, 0.92, front(j, 0.085)), mMuscle, 2.4, 1); break;
          case "back": capsule(0.08, (j) => tors(j, 0.18, back(j, 0.085)), (j) => tors(j, 0.86, back(j, 0.085)), mMuscle, 1.9, 1); break;
          case "lowback": capsule(0.08, (j) => tors(j, 0.5, back(j, 0.085)), (j) => tors(j, 0.97, back(j, 0.085)), mMuscle, 1.6, 1); break;
          case "abs": capsule(0.075, (j) => tors(j, 0.34, front(j, 0.09)), (j) => tors(j, 0.8, front(j, 0.09)), mMuscle, 1.5, 1); break;
        }
      };
      spec.muscles.forEach(muscleParts);

      // equipamento (formas fixas em quantidade; posições atualizadas a cada quadro)
      const shapes0 = spec.equip(j0, 0);
      const eq: { s: Shape; mesh: import("three").Mesh }[] = shapes0.map((s) => {
        let geo: import("three").BufferGeometry;
        if (s.t === "ball") geo = new THREE.SphereGeometry(1, 16, 12); else if (s.t === "box") geo = new THREE.BoxGeometry(1, 1, 1); else geo = new THREE.CylinderGeometry(1, 1, 1, 20);
        const mesh = new THREE.Mesh(track(geo), mEquip); root.add(mesh); return { s, mesh };
      });
      const updateEquip = (shapes: Shape[]) => {
        shapes.forEach((s, i) => {
          const mesh = eq[i]?.mesh; if (!mesh) return;
          if (s.t === "box") { mesh.position.set(...s.c); mesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), s.rz ?? 0); mesh.scale.set(...s.s); }
          else if (s.t === "ball") { mesh.position.set(...s.c); mesh.quaternion.identity(); mesh.scale.set(s.r, s.r, s.r); }
          else if (s.t === "disc") { mesh.position.set(...s.c); mesh.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2); mesh.scale.set(s.r, s.th, s.r); }
          else { const len = orient(mesh, s.a, s.b); mesh.scale.set(s.r, len, s.r); }
        });
      };

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enablePan = false; controls.minDistance = 2.2; controls.maxDistance = 6.5; controls.target.copy(target); controls.enableDamping = true; controls.dampingFactor = 0.08;
      const setView = (v: "side" | "front" | "three") => {
        const dist = 4.8; const az = v === "side" ? 0 : v === "front" ? Math.PI / 2 : Math.PI / 4;
        camera.position.set(target.x + Math.sin(az) * dist, target.y + 0.3, Math.cos(az) * dist); controls.update();
      };
      setView("three");

      const size = () => { const w = el.clientWidth || 320; const h = Math.round(w * 0.75); renderer.setSize(w, h, false); renderer.domElement.style.width = "100%"; renderer.domElement.style.height = `${h}px`; camera.aspect = w / h; camera.updateProjectionMatrix(); };
      size();
      const ro = new ResizeObserver(size); ro.observe(el);

      let phase = 0, last = performance.now(), visible = true, raf = 0;
      const io = new IntersectionObserver((e) => { visible = e[0]?.isIntersecting ?? true; }, { threshold: 0.05 }); io.observe(el);
      const frame = (now: number) => {
        raf = requestAnimationFrame(frame);
        const dt = Math.min(0.1, (now - last) / 1000); last = now;
        if (!visible || document.hidden) return;
        if (!isPaused) phase += (dt / PERIOD) * speed;
        const u = repetition(phase);
        const j = jointsAt(spec, u);
        parts.forEach((p) => p.update(j));
        updateEquip(spec.equip(j, u));
        controls.update();
        renderer.render(scene, camera);
      };
      raf = requestAnimationFrame(frame);

      api.current = { view: setView, setPaused: (p) => { isPaused = p; }, setSlow: (s) => { speed = s ? 0.4 : 1; } };
      cleanup = () => {
        cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); controls.dispose();
        geos.forEach((g) => g.dispose()); [mBody, mFar, mMuscle, mEquip].forEach((m) => m.dispose()); renderer.dispose();
        if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement);
        api.current = null;
      };
    })();
    return () => { disposed = true; cleanup(); };
  }, [name, spec]);

  if (!spec) return null;
  const btn = (label: string, on: () => void, pressed?: boolean) => (
    <button type="button" className="btn ghost small" onClick={on} aria-pressed={pressed}>{label}</button>
  );
  return (
    <div data-testid="exercise-3d">
      <div ref={host} role="img" aria-label={`Animação 3D do exercício ${name}. Arraste para girar. Em verde, o músculo principal.`}
        style={{ background: COLORS.stage, borderRadius: 8, overflow: "hidden", minHeight: 200, cursor: "grab" }}>
        {error && <p className="muted" style={{ padding: 16 }}>{error}</p>}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        {btn(paused ? "Reproduzir" : "Pausar", () => { const p = !paused; setPaused(p); api.current?.setPaused(p); })}
        {btn(slow ? "Velocidade normal" : "Câmera lenta", () => { const s = !slow; setSlow(s); api.current?.setSlow(s); }, slow)}
        {btn("Lado", () => api.current?.view("side"))}
        {btn("Frente", () => api.current?.view("front"))}
        {btn("3/4", () => api.current?.view("three"))}
      </div>
      <p className="muted" style={{ margin: "6px 0 0" }}>Arraste para girar o boneco. <b style={{ color: "var(--v)" }}>Verde</b> = músculo principal; <b style={{ color: "var(--b)" }}>azul</b> = equipamento. {spec.tip}{reduced ? " Movimento reduzido: toque em Reproduzir para ver o movimento." : ""}</p>
    </div>
  );
}
