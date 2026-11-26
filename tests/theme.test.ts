import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/app/globals.css", "utf8");
const layout = readFileSync("src/app/layout.tsx", "utf8");

describe("temas claro (padrão) e escuro", () => {
  it("o claro é o padrão (:root) e o escuro é opcional por atributo, ambos com a paleta da marca", () => {
    const root = css.slice(css.indexOf(":root {"), css.indexOf('html[data-theme="dark"]'));
    expect(root).toContain("--paper: #E6EAED"); expect(root).toContain("--ink: #0E1B2B"); expect(root).toContain("--b: #1A73E9"); expect(root).toContain("--v: #2AC38B");
    expect(root).toMatch(/--bg: var\(--paper\)/);
    const dark = css.slice(css.indexOf('html[data-theme="dark"]'), css.indexOf("}", css.indexOf('html[data-theme="dark"]')));
    expect(dark).toMatch(/--bg: var\(--ink\)/); expect(dark).toMatch(/--g: var\(--paper\)/);
  });
  it("verde nunca vira texto no tema claro (regra da marca): o texto verde só existe no escuro", () => {
    const root = css.slice(css.indexOf(":root {"), css.indexOf('html[data-theme="dark"]'));
    expect(root).toMatch(/--vt: var\(--ink\)/);
    expect(css.slice(css.indexOf('html[data-theme="dark"]'))).toMatch(/--vt: var\(--v\)/);
    expect(css).not.toMatch(/\.btn[^{]*\{[^}]*color: var\(--n\)/); // texto sobre botão verde é sempre azul-marinho fixo
  });
  it("não há vermelho na interface (a marca tem só 4 cores)", () => {
    const sources = ["src/app/globals.css", "src/app/scrollfx.css", "src/components/FinanceChart.tsx", "src/components/AnalyticsChart.tsx", "src/components/Exercise3D.tsx"].map((f) => readFileSync(f, "utf8")).join("\n");
    expect(sources).not.toMatch(/#(f00|ff0000|e53935|d32f2f|c62828|ef4444|dc2626)\b/i);
  });
  it("o tema salvo é aplicado antes da primeira pintura (sem piscar) e o padrão é claro", () => {
    expect(layout).toContain('localStorage.getItem("cf-theme")');
    expect(layout).toContain('t==="dark"?"dark":"light"');
    expect(layout).toContain("suppressHydrationWarning");
  });
});
