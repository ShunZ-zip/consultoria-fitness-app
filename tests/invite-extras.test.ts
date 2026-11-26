import { describe, expect, it } from "vitest";
import * as h from "../src/server/handlers";
import * as h4 from "../src/server/handlers4";
import * as h13 from "../src/server/handlers13";
import { call, registerTrainer } from "./helpers";

async function template(cookie: string, key = "anamnese") {
  const r = await call(h4.createAssessmentTemplate, { cookie, body: { key } });
  expect(r.status).toBe(201);
  return r.body.id as string;
}
async function accept(token: string, label: string) {
  const acc = await call(h.acceptInvite, { params: { token }, body: { name: `Aluno ${label}`, email: `${label}@aluno.com`, password: "senha-segura-1" } });
  expect(acc.status).toBe(201);
  const me = await call(h.me, { cookie: acc.cookie });
  return { cookie: acc.cookie!, id: me.body.id as string };
}
const invite = (cookie: string, extra: Record<string, unknown> = {}) => call(h.createInvite, { cookie, body: { studentName: "Aluna Convidada", ...extra } });

describe("convite com dados opcionais e anamnese automática", () => {
  it("guarda nascimento, WhatsApp (normalizado) e gênero; o personal vê idade e link do WhatsApp", async () => {
    const t = await registerTrainer("ie-a");
    const inv = await invite(t, { birthDate: "1998-03-15", phone: "(11) 91234-5678", gender: "female" });
    expect(inv.status).toBe(201);
    const s = await accept(inv.body.token, "ie-s1");
    const p = (await call(h13.getStudentProfile, { cookie: t, params: { id: s.id } })).body;
    expect(p).toMatchObject({ birthDate: "1998-03-15", phone: "5511912345678", phoneText: "+55 (11) 91234-5678", whatsappUrl: "https://wa.me/5511912345678", gender: "female", genderText: "Feminino" });
    expect(p.age).toBeGreaterThanOrEqual(27);
  });

  it("com modelo de anamnese: nasce uma avaliação PENDENTE para o aluno, com os campos copiados; ele a vê; auditado", async () => {
    const t = await registerTrainer("ie-b"); const tpl = await template(t);
    const inv = await invite(t, { anamnesisTemplateId: tpl });
    const s = await accept(inv.body.token, "ie-s2");
    const mine = (await call(h4.myAssessments, { cookie: s.cookie })).body as any[];
    expect(mine).toHaveLength(1); expect(mine[0]).toMatchObject({ templateName: "Anamnese básica", status: "pending" });
    const detail = (await call(h4.getAssessment, { cookie: s.cookie, params: { id: mine[0].id } })).body;
    expect(detail.fields.length).toBeGreaterThan(3);
    expect(((await call(h4.listStudentAssessments, { cookie: t, params: { id: s.id } })).body as any[])).toHaveLength(1);
    const audit = (await call(h.listAudit, { cookie: t })).body as any[];
    expect(audit.some((x) => x.action === "assessment.create" && x.detail?.via === "convite")).toBe(true);
  });

  it("convite simples não cria perfil nem avaliação", async () => {
    const t = await registerTrainer("ie-c");
    const s = await accept((await invite(t)).body.token, "ie-s3");
    expect((await call(h13.getStudentProfile, { cookie: t, params: { id: s.id } })).body).toMatchObject({ birthDate: null, phone: null, gender: null, age: null, whatsappUrl: null });
    expect((await call(h4.myAssessments, { cookie: s.cookie })).body).toEqual([]);
  });

  it("validação: nascimento futuro, WhatsApp curto, gênero fora da lista, modelo de outra consultoria (404) e id inválido (400)", async () => {
    const a = await registerTrainer("ie-d"); const b = await registerTrainer("ie-e"); const tplB = await template(b);
    expect((await invite(a, { birthDate: "2999-01-01" })).status).toBe(400);
    expect((await invite(a, { phone: "123" })).body.error).toMatch(/WhatsApp inválido/);
    expect((await invite(a, { gender: "xyz" })).status).toBe(400);
    expect((await invite(a, { anamnesisTemplateId: tplB })).status).toBe(404);
    expect((await invite(a, { anamnesisTemplateId: "nao-e-uuid" })).status).toBe(400);
    expect((await invite(a, { birthDate: "", phone: "", gender: null })).status).toBe(201);                // vazio é permitido
  });
});

describe("perfil cadastral do aluno (personal)", () => {
  it("edita, limpa campos e fica auditado", async () => {
    const t = await registerTrainer("ie-f"); const s = await accept((await invite(t)).body.token, "ie-s4");
    const up = await call(h13.updateStudentProfile, { method: "PUT", cookie: t, params: { id: s.id }, body: { birthDate: "1990-07-01", phone: "+1 415 555 2671", gender: "undisclosed" } });
    expect(up.status).toBe(200); expect(up.body).toMatchObject({ phone: "14155552671", phoneText: "+14155552671", genderText: "Prefiro não informar" });
    const cleared = await call(h13.updateStudentProfile, { method: "PUT", cookie: t, params: { id: s.id }, body: { birthDate: null, phone: "", gender: null } });
    expect(cleared.body).toMatchObject({ birthDate: null, phone: null, gender: null });
    expect(((await call(h.listAudit, { cookie: t })).body as any[]).some((x) => x.action === "student.profile_update")).toBe(true);
    expect((await call(h13.updateStudentProfile, { method: "PUT", cookie: t, params: { id: s.id }, body: { phone: "12" } })).status).toBe(400);
  });

  it("ISOLAMENTO e privacidade: outra consultoria 404 (ler e editar), aluno 403 (inclusive o próprio), id inválido 404, sem sessão 401", async () => {
    const a = await registerTrainer("ie-g"); const b = await registerTrainer("ie-h");
    const s1 = await accept((await invite(a, { phone: "11912345678" })).body.token, "ie-s5"); const s2 = await accept((await invite(a)).body.token, "ie-s6");
    expect((await call(h13.getStudentProfile, { cookie: b, params: { id: s1.id } })).status).toBe(404);
    expect((await call(h13.updateStudentProfile, { method: "PUT", cookie: b, params: { id: s1.id }, body: { phone: "11999999999" } })).status).toBe(404);
    expect((await call(h13.getStudentProfile, { cookie: s2.cookie, params: { id: s1.id } })).status).toBe(403);     // aluno x aluno
    expect((await call(h13.getStudentProfile, { cookie: s1.cookie, params: { id: s1.id } })).status).toBe(403);     // nem o próprio por esta rota do personal
    expect((await call(h13.getStudentProfile, { cookie: a, params: { id: "nao-e-uuid" } })).status).toBe(404);
    expect((await call(h13.getStudentProfile, { params: { id: s1.id } })).status).toBe(401);
    expect((await call(h13.getStudentProfile, { cookie: a, params: { id: s1.id } })).body.phone).toBe("5511912345678");   // intacto para o dono
  });
});
