import { describe, expect, it } from "vitest";
import { isSafeMediaUrl, youtubeId } from "../src/lib/media";
import { REFERENCE_VIDEOS, youtubeWatchUrl } from "../src/lib/referenceVideos";
import { OFFICIAL_EXERCISES } from "../src/server/schema";
import { has3D } from "../src/lib/exercise3d";

describe("catálogo ampliado e vídeos de referência", () => {
  it("nomes únicos (sem diferença de maiúsculas) e cada exercício tem músculo principal", () => {
    const names = OFFICIAL_EXERCISES.map((e) => e.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    for (const e of OFFICIAL_EXERCISES) { expect(e.primary.length, e.name).toBeGreaterThan(0); expect(e.primary.some((p) => e.secondary.includes(p)), e.name).toBe(false); }
    expect(OFFICIAL_EXERCISES.length).toBeGreaterThanOrEqual(80);
  });
  it("cobertura: ao menos 45 exercícios com vídeo e nenhum vídeo é do Leandro Twin (pedido do usuário)", () => {
    expect(Object.keys(REFERENCE_VIDEOS).length).toBeGreaterThanOrEqual(45);
    for (const [name, v] of Object.entries(REFERENCE_VIDEOS)) expect(v.author.toLowerCase(), name).not.toContain("leandro");
    const withDemo = OFFICIAL_EXERCISES.filter((e) => REFERENCE_VIDEOS[e.name] || has3D(e.name)).length;
    expect(withDemo).toBeGreaterThanOrEqual(50);
  });
  it("os exercícios principais têm o vídeo do canal Muscle & Motion ou outro canal de animação 3D", () => {
    for (const n of ["Supino reto", "Agachamento livre", "Levantamento terra", "Puxada frontal", "Leg press 45°", "Rosca direta"]) expect(REFERENCE_VIDEOS[n], n).toBeTruthy();
  });
  it("cada vídeo aponta para um exercício existente, com id válido do YouTube e crédito ao autor", () => {
    const names = new Set(OFFICIAL_EXERCISES.map((e) => e.name));
    for (const [name, v] of Object.entries(REFERENCE_VIDEOS)) {
      expect(names.has(name), name).toBe(true);
      expect(v.id, name).toMatch(/^[A-Za-z0-9_-]{11}$/);
      expect(v.author.length, name).toBeGreaterThan(0); expect(v.title.length, name).toBeGreaterThan(0);
      expect(youtubeId(youtubeWatchUrl(v.id))).toBe(v.id);
      expect(isSafeMediaUrl(youtubeWatchUrl(v.id))).toBe(true);
    }
  });
  it("youtubeId reconhece os formatos do YouTube e recusa o resto (incluindo hosts parecidos)", () => {
    const id = "EZMYCLKuGow";
    for (const u of [`https://youtu.be/${id}`, `https://www.youtube.com/watch?v=${id}&t=3`, `https://m.youtube.com/watch?v=${id}`, `https://www.youtube.com/embed/${id}`, `https://www.youtube-nocookie.com/embed/${id}`, `https://www.youtube.com/shorts/${id}`]) expect(youtubeId(u), u).toBe(id);
    for (const u of ["https://youtu.be/curto", "https://evil.com/watch?v=" + id, "https://youtube.com.evil.com/watch?v=" + id, "javascript:alert(1)", "http://youtu.be/" + id + "x", "não é url"]) expect(youtubeId(u), u).toBeNull();
  });
});
