import { ZodError, type ZodType } from "zod";
import { getActor, type Actor, type Role } from "./auth";
import { getDb, type Db } from "./db";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

export interface Ctx {
  req: Request;
  db: Db;
  params: Record<string, string>;
  url: URL;
}
export type Handler = (ctx: Ctx) => Promise<Response>;

/** Envolve um handler: abre o banco, trata erros e exige JSON em escritas (mitiga CSRF). */
export function route(handler: Handler) {
  return async (req: Request, params: Record<string, string> = {}): Promise<Response> => {
    try {
      if (!["GET", "HEAD"].includes(req.method)) {
        const ct = req.headers.get("content-type") ?? "";
        if (!ct.includes("application/json")) throw new HttpError(415, "Content-Type deve ser application/json");
      }
      const db = await getDb();
      return await handler({ req, db, params, url: new URL(req.url) });
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      if (e instanceof ZodError) return json({ error: "Dados inválidos", issues: e.issues }, 400);
      console.error(e);
      return json({ error: "Erro interno" }, 500);
    }
  };
}

/** Exige sessão (401) e, opcionalmente, um papel (403). */
export async function requireActor(ctx: Ctx, role?: Role): Promise<Actor> {
  const actor = await getActor(ctx.db, ctx.req);
  if (!actor) throw new HttpError(401, "Não autenticado");
  if (role && actor.role !== role) throw new HttpError(403, "Sem permissão");
  return actor;
}

export async function body<T>(ctx: Ctx, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await ctx.req.json();
  } catch {
    throw new HttpError(400, "JSON inválido");
  }
  return schema.parse(raw);
}

export function notFound(): never {
  // Mesmo status para "não existe" e "não é seu": não revela a existência de dados alheios.
  throw new HttpError(404, "Não encontrado");
}
