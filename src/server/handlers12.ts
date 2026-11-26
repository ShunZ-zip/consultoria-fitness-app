// Perfil da própria conta: nome, nome do espaço (só personal) e troca de senha.
// A troca de senha exige a senha atual, limita tentativas erradas e derruba as OUTRAS sessões (a atual continua).
// Trocar o e-mail NÃO está aqui: exigiria confirmação por e-mail (provedor ainda não escolhido).
import { z } from "zod";
import { hashPassword, readCookie, SESSION_COOKIE, sha256, verifyPassword } from "./auth";
import { audit } from "./handlers";
import { body, HttpError, json, requireActor, route } from "./http";

const MAX_FAILURES = 5;            // tentativas erradas de senha atual...
const WINDOW_MINUTES = 15;         // ...dentro desta janela bloqueiam novas tentativas

export const updateProfile = route(async (ctx) => {
  const a = await requireActor(ctx);
  const input = await body(ctx, z.object({
    name: z.string().trim().min(1, "Informe o seu nome").max(120),
    consultancyName: z.string().trim().min(1).max(120).optional(),
  }));
  if (input.consultancyName !== undefined && a.role !== "trainer") throw new HttpError(403, "Só o personal altera o nome do espaço");
  await ctx.db.transaction(async (tx) => {
    await tx.query("update users set name = $2 where id = $1", [a.userId, input.name]);
    if (input.consultancyName !== undefined) await tx.query("update consultancies set name = $2 where id = $1", [a.consultancyId, input.consultancyName]);
    await audit(tx, a, "profile.update", { nameChanged: input.name !== a.name, consultancyRenamed: input.consultancyName !== undefined });
  });
  return json({ name: input.name, ...(input.consultancyName !== undefined ? { consultancyName: input.consultancyName } : {}) });
});

export const changePassword = route(async (ctx) => {
  const a = await requireActor(ctx);
  const input = await body(ctx, z.object({
    currentPassword: z.string().min(1, "Informe a senha atual").max(200),
    newPassword: z.string().min(8, "A nova senha precisa de no mínimo 8 caracteres").max(200),
  }));
  const failures = (await ctx.db.query<{ n: number }>(
    `select count(*)::int as n from audit_log where actor_id = $1 and action = 'password.change_failed' and at > now() - ($2 || ' minutes')::interval`,
    [a.userId, String(WINDOW_MINUTES)])).rows[0].n;
  if (failures >= MAX_FAILURES) throw new HttpError(429, `Muitas tentativas. Aguarde ${WINDOW_MINUTES} minutos e tente de novo.`);
  const row = (await ctx.db.query<{ password_hash: string }>("select password_hash from users where id = $1", [a.userId])).rows[0];
  if (!row || !(await verifyPassword(input.currentPassword, row.password_hash))) {
    await audit(ctx.db, a, "password.change_failed", {});
    throw new HttpError(400, "Senha atual incorreta");
  }
  if (input.newPassword === input.currentPassword) throw new HttpError(400, "A nova senha precisa ser diferente da atual");
  const hash = await hashPassword(input.newPassword);
  const current = readCookie(ctx.req, SESSION_COOKIE);
  await ctx.db.transaction(async (tx) => {
    await tx.query("update users set password_hash = $2 where id = $1", [a.userId, hash]);
    // Derruba as outras sessões (aparelhos esquecidos ou de quem soubesse a senha antiga); a sessão atual continua.
    if (current) await tx.query("delete from sessions where user_id = $1 and token_hash <> $2", [a.userId, sha256(current)]);
    else await tx.query("delete from sessions where user_id = $1", [a.userId]);
    await audit(tx, a, "password.change", {});
  });
  return json({ ok: true });
});
