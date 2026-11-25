import { randomUUID } from "node:crypto";
import * as h from "../src/server/handlers";

type Handler = (req: Request, params?: Record<string, string>) => Promise<Response>;

export interface Res<T = any> { status: number; body: T; cookie?: string }

/** Chama o handler da API diretamente, como o Next faria (Request -> Response). */
export async function call<T = any>(
  handler: Handler,
  opts: { method?: string; body?: unknown; cookie?: string; params?: Record<string, string>; json?: boolean } = {},
): Promise<Res<T>> {
  const method = opts.method ?? (opts.body !== undefined ? "POST" : "GET");
  const headers: Record<string, string> = {};
  if (opts.json !== false && method !== "GET") headers["content-type"] = "application/json";
  if (opts.cookie) headers.cookie = opts.cookie;
  const req = new Request("http://test.local/api", {
    method, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : method === "GET" ? undefined : "{}",
  });
  const res = await handler(req, opts.params ?? {});
  const text = await res.text();
  const set = res.headers.get("set-cookie");
  return { status: res.status, body: text ? JSON.parse(text) : null, cookie: set ? set.split(";")[0] : undefined };
}

export async function registerTrainer(label: string) {
  const r = await call(h.register, {
    body: { name: `Personal ${label}`, email: `${label}@teste.com`, password: "senha-segura-1", consultancyName: `Consultoria ${label}` },
  });
  if (r.status !== 201) throw new Error("registro falhou " + JSON.stringify(r.body));
  return r.cookie!;
}

export async function inviteStudent(trainerCookie: string, label: string) {
  const inv = await call(h.createInvite, { body: { studentName: `Aluno ${label}` }, cookie: trainerCookie });
  const acc = await call(h.acceptInvite, {
    params: { token: inv.body.token },
    body: { name: `Aluno ${label}`, email: `${label}@aluno.com`, password: "senha-segura-1" },
  });
  if (acc.status !== 201) throw new Error("convite falhou " + JSON.stringify(acc.body));
  const me = await call(h.me, { cookie: acc.cookie });
  return { cookie: acc.cookie!, id: me.body.id as string, token: inv.body.token as string };
}

export async function firstExercises(cookie: string, n = 2): Promise<string[]> {
  const r = await call(h.listExercises, { cookie });
  return r.body.slice(0, n).map((e: any) => e.id);
}

export async function publishWorkout(trainerCookie: string, studentId: string, publish = true) {
  const [e1, e2] = await firstExercises(trainerCookie);
  const r = await call(h.createVersion, {
    cookie: trainerCookie,
    body: {
      studentId, name: "Treino A", publish,
      exercises: [
        { exerciseId: e1, sets: [{ reps: 10, loadKg: 40, rir: 2, restS: 90 }, { reps: 10, loadKg: 40, rir: 2, restS: 90 }] },
        { exerciseId: e2, sets: [{ reps: 12, loadKg: 20, rir: 1, restS: 60 }] },
      ],
    },
  });
  if (r.status !== 201) throw new Error("treino falhou " + JSON.stringify(r.body));
  return r.body.id as string;
}

export const uuid = () => randomUUID();
export { h };

/** Atualiza só algumas permissões do aluno (o resto permanece). */
export async function setPerms(trainerCookie: string, studentId: string, patch: Record<string, boolean>) {
  const cur = (await call(h.getStudentPermissions, { cookie: trainerCookie, params: { id: studentId } })).body;
  return call(h.putStudentPermissions, { method: "PUT", cookie: trainerCookie, params: { id: studentId }, body: { ...cur, ...patch } });
}
