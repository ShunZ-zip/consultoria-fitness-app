import { describe, expect, it } from "vitest";
import { ageOn, cleanProfile, formatPhone, genderLabel, isValidBirthDate, normalizePhone, whatsappLink } from "../src/lib/studentProfile";

const TODAY = "2026-11-26";

describe("dados cadastrais do aluno (regras puras)", () => {
  it("telefone: DDD + número ganha o 55; com 55 fica; lixo e curto viram nulo", () => {
    expect(normalizePhone("(11) 91234-5678")).toBe("5511912345678");
    expect(normalizePhone("11 3456-7890")).toBe("551134567890");
    expect(normalizePhone("+55 (21) 99876-5432")).toBe("5521998765432");
    expect(normalizePhone("011 91234 5678")).toBe("5511912345678");        // zero de tronco
    expect(normalizePhone("+1 415 555 2671")).toBe("14155552671");          // internacional como veio
    expect(normalizePhone("1234")).toBeNull(); expect(normalizePhone("abc")).toBeNull(); expect(normalizePhone("")).toBeNull(); expect(normalizePhone(null)).toBeNull();
  });

  it("formatação e link do WhatsApp", () => {
    expect(formatPhone("5511912345678")).toBe("+55 (11) 91234-5678");
    expect(formatPhone("551134567890")).toBe("+55 (11) 3456-7890");
    expect(formatPhone("14155552671")).toBe("+14155552671"); expect(formatPhone(null)).toBe("");
    expect(whatsappLink("5511912345678")).toBe("https://wa.me/5511912345678");
  });

  it("nascimento: data real, não futura, de 1900 em diante", () => {
    expect(isValidBirthDate("1998-03-15", TODAY)).toBe(true);
    expect(isValidBirthDate(TODAY, TODAY)).toBe(true);
    expect(isValidBirthDate("2026-11-27", TODAY)).toBe(false);
    expect(isValidBirthDate("1899-12-31", TODAY)).toBe(false);
    expect(isValidBirthDate("2001-02-30", TODAY)).toBe(false); expect(isValidBirthDate("15/03/1998", TODAY)).toBe(false); expect(isValidBirthDate(null, TODAY)).toBe(false);
  });

  it("idade completa: antes e depois do aniversário", () => {
    expect(ageOn("1998-11-26", TODAY)).toBe(28);       // faz anos hoje
    expect(ageOn("1998-11-27", TODAY)).toBe(27);       // amanhã
    expect(ageOn("1998-01-01", TODAY)).toBe(28);
    expect(ageOn("2026-11-26", TODAY)).toBe(0);
  });

  it("cleanProfile: normaliza, aceita vazio e devolve mensagens em pt-BR", () => {
    expect(cleanProfile({}, TODAY)).toEqual({ data: { birthDate: null, phone: null, gender: null } });
    expect(cleanProfile({ birthDate: "1998-03-15", phone: "(11) 91234-5678", gender: "female" }, TODAY)).toEqual({ data: { birthDate: "1998-03-15", phone: "5511912345678", gender: "female" } });
    expect(cleanProfile({ birthDate: "2030-01-01" }, TODAY)).toEqual({ error: "Data de nascimento inválida" });
    expect(cleanProfile({ phone: "123" }, TODAY)).toMatchObject({ error: expect.stringMatching(/WhatsApp inválido/) });
    expect(cleanProfile({ gender: "xyz" }, TODAY)).toEqual({ error: "Gênero inválido" });
    expect(cleanProfile({ phone: "  ", birthDate: "" }, TODAY)).toEqual({ data: { birthDate: null, phone: null, gender: null } });
    expect(genderLabel("undisclosed")).toBe("Prefiro não informar"); expect(genderLabel(null)).toBeNull();
  });
});
