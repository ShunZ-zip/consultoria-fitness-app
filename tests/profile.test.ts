import { describe, expect, it } from "vitest";
import * as h from "../src/server/handlers";
import * as h12 from "../src/server/handlers12";
import { call, inviteStudent, registerTrainer } from "./helpers";

const login = (email: string, password: string) => call(h.login, { body: { email, password } });

describe("perfil: nome e nome do espaço", () => {
  it("troca o nome (os dois papéis) e o nome do espaço (só o personal); aparece em /me; auditado", async () => {
    const t = await registerTrainer("pf-a"); const s = await inviteStudent(t, "pf-s1");
    expect((await call(h12.updateProfile, { method: "PUT", cookie: t, body: { name: "Cauã Henry", consultancyName: "Espaço Novo" } })).status).toBe(200);
    expect((await call(h.me, { cookie: t })).body).toMatchObject({ name: "Cauã Henry", consultancyName: "Espaço Novo" });
    expect((await call(h12.updateProfile, { method: "PUT", cookie: s.cookie, body: { name: "Aluna Maria" } })).status).toBe(200);
    const me = (await call(h.me, { cookie: s.cookie })).body;
    expect(me.name).toBe("Aluna Maria"); expect(me.consultancyName).toBe("Espaço Novo");                 // o aluno vê o nome novo do espaço
    expect(((await call(h.listAudit, { cookie: t })).body as any[]).some((x) => x.action === "profile.update")).toBe(true);
  });

  it("validação e permissões: aluno não renomeia o espaço (403), nome vazio 400, sem sessão 401; não mexe em outra conta", async () => {
    const a = await registerTrainer("pf-b"); const b = await registerTrainer("pf-c"); const s = await inviteStudent(a, "pf-s2");
    expect((await call(h12.updateProfile, { method: "PUT", cookie: s.cookie, body: { name: "x", consultancyName: "Invasão" } })).status).toBe(403);
    expect((await call(h12.updateProfile, { method: "PUT", cookie: a, body: { name: "  " } })).status).toBe(400);
    expect((await call(h12.updateProfile, { method: "PUT", cookie: a, body: { name: "Ok", consultancyName: "" } })).status).toBe(400);
    expect((await call(h12.updateProfile, { method: "PUT", body: { name: "Ok" } })).status).toBe(401);
    await call(h12.updateProfile, { method: "PUT", cookie: a, body: { name: "Só do A", consultancyName: "Só do A" } });
    expect((await call(h.me, { cookie: b })).body.consultancyName).toBe("Consultoria pf-c");              // a outra consultoria não mudou
    expect((await call(h.me, { cookie: s.cookie })).body.name).toBe("Aluno pf-s2");
  });
});

describe("perfil: trocar senha", () => {
  it("exige a senha atual; a nova passa a valer, a antiga não; as outras sessões caem e a atual continua", async () => {
    const t = await registerTrainer("pf-d");
    const other = await login("pf-d@teste.com", "senha-segura-1");            // outro aparelho
    expect(other.status).toBe(200);
    const bad = await call(h12.changePassword, { cookie: t, body: { currentPassword: "errada-123", newPassword: "nova-senha-9" } });
    expect(bad.status).toBe(400); expect(bad.body.error).toMatch(/atual incorreta/);
    expect((await call(h12.changePassword, { cookie: t, body: { currentPassword: "senha-segura-1", newPassword: "nova-senha-9" } })).status).toBe(200);
    expect((await login("pf-d@teste.com", "senha-segura-1")).status).toBe(401);                                // antiga não vale
    expect((await login("pf-d@teste.com", "nova-senha-9")).status).toBe(200);                                  // nova vale
    expect((await call(h.me, { cookie: other.cookie })).status).toBe(401);                                     // outro aparelho caiu
    expect((await call(h.me, { cookie: t })).status).toBe(200);                                                // este continua
    expect(((await call(h.listAudit, { cookie: t })).body as any[]).map((x) => x.action)).toEqual(expect.arrayContaining(["password.change", "password.change_failed"]));
  });

  it("regras da nova senha: mínimo de 8, diferente da atual, campos obrigatórios; sem sessão 401", async () => {
    const t = await registerTrainer("pf-e");
    const go = (body: unknown) => call(h12.changePassword, { cookie: t, body });
    expect((await go({ currentPassword: "senha-segura-1", newPassword: "curta" })).status).toBe(400);
    const same = await go({ currentPassword: "senha-segura-1", newPassword: "senha-segura-1" });
    expect(same.status).toBe(400); expect(same.body.error).toMatch(/diferente/);
    expect((await go({ newPassword: "nova-senha-9" })).status).toBe(400);
    expect((await call(h12.changePassword, { body: { currentPassword: "x", newPassword: "nova-senha-9" } })).status).toBe(401);
    expect((await login("pf-e@teste.com", "senha-segura-1")).status).toBe(200);                                // nada mudou
  });

  it("5 tentativas erradas bloqueiam (429), até com a senha certa; o bloqueio é por usuário", async () => {
    const a = await registerTrainer("pf-f"); const b = await registerTrainer("pf-g");
    for (let i = 0; i < 5; i++) expect((await call(h12.changePassword, { cookie: a, body: { currentPassword: "errada-" + i + "xx", newPassword: "nova-senha-9" } })).status).toBe(400);
    expect((await call(h12.changePassword, { cookie: a, body: { currentPassword: "senha-segura-1", newPassword: "nova-senha-9" } })).status).toBe(429);
    expect((await login("pf-f@teste.com", "senha-segura-1")).status).toBe(200);                                // senha não mudou
    expect((await call(h12.changePassword, { cookie: b, body: { currentPassword: "senha-segura-1", newPassword: "nova-senha-9" } })).status).toBe(200); // outro usuário livre
  });

  it("o aluno também troca a própria senha", async () => {
    const t = await registerTrainer("pf-h"); const s = await inviteStudent(t, "pf-s3");
    expect((await call(h12.changePassword, { cookie: s.cookie, body: { currentPassword: "senha-segura-1", newPassword: "senha-nova-77" } })).status).toBe(200);
    expect((await login("pf-s3@aluno.com", "senha-nova-77")).status).toBe(200);
  });
});
