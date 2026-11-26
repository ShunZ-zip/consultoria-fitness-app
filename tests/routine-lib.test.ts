import { describe, expect, it } from "vitest";
import { effectiveStatus, hiddenReason, isDateKey, periodText, subtitle, validateRoutine, visibleToStudent, type RoutineRule } from "../src/lib/routine";

const base: RoutineRule = { status: "active", startsOn: "2026-11-01", endsOn: "2026-12-01", visibility: "always", autoArchive: false };
const TODAY = "2026-11-26";

describe("rotina: regras puras", () => {
  it("datas: formato e calendário reais", () => {
    expect(isDateKey("2026-11-26")).toBe(true);
    expect(isDateKey("2026-02-30")).toBe(false); expect(isDateKey("26/11/2026")).toBe(false); expect(isDateKey(null)).toBe(false);
  });

  it("validação: fim antes do início, 'a partir do início' sem início e 'arquivar ao vencer' sem fim", () => {
    expect(validateRoutine(base)).toBeNull();
    expect(validateRoutine({ ...base, endsOn: "2026-10-31" })).toMatch(/antes do início/);
    expect(validateRoutine({ ...base, startsOn: null, visibility: "from_start" })).toMatch(/data de início/);
    expect(validateRoutine({ ...base, endsOn: null, autoArchive: true })).toMatch(/data de fim/);
    expect(validateRoutine({ ...base, startsOn: "2026-02-30" })).toMatch(/inválida/);
    expect(validateRoutine({ ...base, startsOn: null, endsOn: null })).toBeNull();
  });

  it("estado efetivo: venceu + arquivar ao vencer = arquivada; sem a opção continua ativa; excluída nunca volta sozinha", () => {
    const venceu = { ...base, endsOn: "2026-11-25" };
    expect(effectiveStatus({ ...venceu, autoArchive: true }, TODAY)).toBe("archived");
    expect(effectiveStatus({ ...venceu, autoArchive: false }, TODAY)).toBe("active");
    expect(effectiveStatus({ ...base, endsOn: TODAY, autoArchive: true }, TODAY)).toBe("active");  // no dia do fim ainda vale
    expect(effectiveStatus({ ...base, status: "deleted", autoArchive: true }, TODAY)).toBe("deleted");
  });

  it("o aluno vê só rotina ativa e (se for o caso) já iniciada", () => {
    expect(visibleToStudent(base, TODAY)).toBe(true);
    expect(hiddenReason({ ...base, status: "archived" }, TODAY)).toBe("archived");
    expect(hiddenReason({ ...base, status: "deleted" }, TODAY)).toBe("deleted");
    const futura = { ...base, startsOn: "2026-12-01", endsOn: "2027-01-01" };
    expect(hiddenReason({ ...futura, visibility: "from_start" }, TODAY)).toBe("not_started");
    expect(visibleToStudent({ ...futura, visibility: "always" }, TODAY)).toBe(true);   // "sempre" mostra mesmo antes do início
    expect(visibleToStudent({ ...futura, visibility: "from_start" }, "2026-12-01")).toBe(true); // no dia do início já aparece
    expect(hiddenReason({ ...base, endsOn: "2026-11-01", autoArchive: true }, TODAY)).toBe("archived");
  });

  it("textos de período e subtítulo", () => {
    expect(periodText("2026-06-03", "2026-07-03")).toBe("03/06/2026 a 03/07/2026");
    expect(periodText("2026-06-03", null)).toBe("a partir de 03/06/2026"); expect(periodText(null, "2026-07-03")).toBe("até 03/07/2026"); expect(periodText(null, null)).toBe("Sem período");
    expect(subtitle("Hipertrofia", "Intermediário")).toBe("Hipertrofia · Intermediário"); expect(subtitle("Força", null)).toBe("Força"); expect(subtitle(null, null)).toBe("");
  });
});
