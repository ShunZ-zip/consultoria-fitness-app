import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDb } from "../src/server/db";
import { outbox } from "../src/server/mailer";
import { call, h, inviteStudent, registerTrainer } from "./helpers";

const forgot = (email: string) => call(h.forgotPassword, { body: { email } });
const reset = (token: string, password: string) => call(h.resetPassword, { body: { token, password } });
const login = (email: string, password: string) => call(h.login, { body: { email, password } });
/** Lê o token do último e-mail "enviado" para o endereço. */
const tokenFor = (email: string) => {
  const mail = [...outbox()].reverse().find((m) => m.to === email);
  return mail?.text.match(/redefinir-senha\/([\w-]+)/)?.[1] ?? null;
};

let trainer: string;
beforeAll(async () => {
  await resetDb();
  trainer = await registerTrainer("ana"); // ana@teste.com / senha-segura-1
});
beforeEach(async () => {
  outbox().length = 0;
  // Pedidos de testes anteriores saem da janela de 1 hora do limite (a validade do link não muda).
  await (await getDb()).query("update password_resets set created_at = now() - interval '2 hours'");
});

describe("esqueci a senha", () => {
  it("responde igual para e-mail cadastrado e inexistente (não revela contas)", async () => {
    const known = await forgot("ana@teste.com");
    const unknown = await forgot("ninguem@teste.com");
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
    expect(JSON.stringify(known.body)).not.toMatch(/devLink|redefinir-senha/); // nunca devolve o link fora do dev local
  });

  it("envia e-mail só para quem tem conta, com link de uso único", async () => {
    await forgot("ninguem@teste.com");
    expect(outbox()).toHaveLength(0);
    await forgot("ana@teste.com");
    expect(outbox()).toHaveLength(1);
    expect(outbox()[0].to).toBe("ana@teste.com");
    expect(tokenFor("ana@teste.com")).toBeTruthy();
  });

  it("guarda só o hash do token", async () => {
    await forgot("ana@teste.com");
    const token = tokenFor("ana@teste.com")!;
    const db = await getDb();
    expect((await db.query("select 1 from password_resets where token_hash = $1", [token])).rows).toHaveLength(0);
  });

  it("limita a 3 pedidos por hora por conta", async () => {
    const s = await inviteStudent(trainer, "limite");
    outbox().length = 0;
    for (let i = 0; i < 6; i++) await forgot("limite@aluno.com");
    expect(outbox().filter((m) => m.to === "limite@aluno.com")).toHaveLength(3);
    void s;
  });

  it("valida o e-mail e exige JSON", async () => {
    expect((await call(h.forgotPassword, { body: { email: "invalido" } })).status).toBe(400);
    expect((await call(h.forgotPassword, { body: { email: "ana@teste.com" }, json: false })).status).toBe(415);
  });
});

describe("redefinir a senha", () => {
  it("troca a senha, derruba sessões antigas e o link vale uma vez", async () => {
    const oldSession = (await login("ana@teste.com", "senha-segura-1")).cookie!;
    expect((await call(h.me, { cookie: oldSession })).status).toBe(200);

    await forgot("ana@teste.com");
    const token = tokenFor("ana@teste.com")!;
    expect((await call(h.checkResetToken, { params: { token } })).status).toBe(200);

    expect((await reset(token, "nova-senha-123")).status).toBe(200);
    expect((await login("ana@teste.com", "senha-segura-1")).status).toBe(401); // senha antiga não vale
    expect((await login("ana@teste.com", "nova-senha-123")).status).toBe(200);
    expect((await call(h.me, { cookie: oldSession })).status).toBe(401);       // sessão antiga derrubada

    expect((await reset(token, "outra-senha-456")).status).toBe(404);          // uso único
    expect((await call(h.checkResetToken, { params: { token } })).status).toBe(404);
    expect((await login("ana@teste.com", "nova-senha-123")).status).toBe(200); // segue a mesma
  });

  it("usar um link invalida os outros pendentes da conta", async () => {
    await forgot("ana@teste.com");
    const first = tokenFor("ana@teste.com")!;
    await forgot("ana@teste.com");
    const second = tokenFor("ana@teste.com")!;
    expect(first).not.toBe(second);
    expect((await reset(second, "terceira-senha-1")).status).toBe(200);
    expect((await reset(first, "quarta-senha-12")).status).toBe(404);
    expect((await login("ana@teste.com", "terceira-senha-1")).status).toBe(200);
  });

  it("recusa link expirado, inventado e senha curta", async () => {
    await forgot("ana@teste.com");
    const token = tokenFor("ana@teste.com")!;
    expect((await reset(token, "curta")).status).toBe(400);                    // senha curta não consome o link
    expect((await call(h.checkResetToken, { params: { token } })).status).toBe(200);

    const db = await getDb();
    await db.query("update password_resets set expires_at = now() - interval '1 minute' where used_at is null");
    expect((await reset(token, "senha-valida-1")).status).toBe(404);
    expect((await call(h.checkResetToken, { params: { token } })).status).toBe(404);

    expect((await reset("token-que-nao-existe-123", "senha-valida-1")).status).toBe(404);
    expect((await call(h.checkResetToken, { params: { token: "inventado" } })).status).toBe(404);
  });

  it("o link só altera a conta dona dele (aluno e personal são independentes)", async () => {
    const fresh = (await login("ana@teste.com", "terceira-senha-1")).cookie!; // a sessão antiga caiu no reset
    const s = await inviteStudent(fresh, "dono"); // dono@aluno.com
    const before = (await login("ana@teste.com", "terceira-senha-1")).status;
    outbox().length = 0;
    await forgot("dono@aluno.com");
    expect((await reset(tokenFor("dono@aluno.com")!, "senha-do-aluno-1")).status).toBe(200);
    expect((await login("dono@aluno.com", "senha-do-aluno-1")).status).toBe(200);
    expect((await call(h.me, { cookie: s.cookie })).status).toBe(401);        // sessão do aluno caiu
    expect(before).toBe(200);
    expect((await login("ana@teste.com", "terceira-senha-1")).status).toBe(200); // personal intacto
  });
});
