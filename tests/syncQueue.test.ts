import { describe, expect, it } from "vitest";
import { SyncQueue, type QueueStorage, type QueuedOp, type Sender } from "../src/lib/syncQueue";

function mem(): QueueStorage & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; }, removeItem: (k) => { delete data[k]; } };
}
const op = (id: string, label = id): Omit<QueuedOp, "at"> => ({ id, method: "PUT", path: `/x/${id}`, body: { id }, label });

describe("fila de sincronização offline", () => {
  it("guarda no armazenamento (sobrevive a recarregar) e envia em ordem", async () => {
    const st = mem(); const sent: string[] = [];
    const send: Sender = async (o) => { sent.push(o.id); return { status: 200 }; };
    const q = new SyncQueue("k", st, send);
    q.enqueue(op("a")); q.enqueue(op("b")); q.enqueue(op("c"));
    expect(new SyncQueue("k", st, send).pending().map((o) => o.id)).toEqual(["a", "b", "c"]); // nova instância = recarregou a página
    expect(await q.flush()).toMatchObject({ sent: 3, remaining: 0, stopped: false });
    expect(sent).toEqual(["a", "b", "c"]);
    expect(q.pending()).toEqual([]);
  });

  it("sem rede: mantém tudo e continua depois, sem perder nem pular operações", async () => {
    const st = mem(); let online = false; const sent: string[] = [];
    const send: Sender = async (o) => { if (!online) throw new Error("offline"); sent.push(o.id); return { status: 200 }; };
    const q = new SyncQueue("k", st, send);
    q.enqueue(op("a")); q.enqueue(op("b"));
    expect(await q.flush()).toMatchObject({ sent: 0, remaining: 2, stopped: true });
    expect(q.pending()).toHaveLength(2);
    online = true;
    expect(await q.flush()).toMatchObject({ sent: 2, remaining: 0 });
    expect(sent).toEqual(["a", "b"]);
  });

  it("falha no meio: a operação com problema fica na fila e a ordem se mantém", async () => {
    const st = mem(); const sent: string[] = []; let failB = true;
    const send: Sender = async (o) => { if (o.id === "b" && failB) throw new Error("caiu"); sent.push(o.id); return { status: 200 }; };
    const q = new SyncQueue("k", st, send);
    ["a", "b", "c"].forEach((i) => q.enqueue(op(i)));
    await q.flush();
    expect(sent).toEqual(["a"]);
    expect(q.pending().map((o) => o.id)).toEqual(["b", "c"]);
    failB = false; await q.flush();
    expect(sent).toEqual(["a", "b", "c"]);
  });

  it("5xx é temporário (tenta de novo); 4xx vira conflito e a fila segue", async () => {
    const st = mem(); const sent: string[] = []; let srv = 503;
    const send: Sender = async (o) => {
      if (o.id === "a") return { status: srv };
      if (o.id === "b") return { status: 403, message: "O personal não liberou esta alteração" };
      sent.push(o.id); return { status: 200 };
    };
    const q = new SyncQueue("k", st, send);
    ["a", "b", "c"].forEach((i) => q.enqueue(op(i)));
    expect(await q.flush()).toMatchObject({ stopped: true, remaining: 3 }); // 503 em "a": nada sai
    srv = 200;
    const r = await q.flush();
    expect(r).toMatchObject({ sent: 2, conflicts: 1, remaining: 0 });
    expect(sent).toEqual(["c"]);
    expect(q.conflicts()).toEqual([expect.objectContaining({ status: 403, message: "O personal não liberou esta alteração", op: expect.objectContaining({ id: "b" }) })]);
    q.discardConflict("b");
    expect(q.conflicts()).toEqual([]);
  });

  it("a mesma operação (mesmo id) vale só pelo último valor", async () => {
    const st = mem(); const bodies: unknown[] = [];
    const send: Sender = async (o) => { bodies.push(o.body); return { status: 200 }; };
    const q = new SyncQueue("k", st, send);
    q.enqueue({ ...op("s1"), body: { reps: 8 } }); q.enqueue({ ...op("s1"), body: { reps: 9 } });
    expect(q.pending()).toHaveLength(1);
    await q.flush();
    expect(bodies).toEqual([{ reps: 9 }]);
  });

  it("chamadas simultâneas de flush não enviam em dobro", async () => {
    const st = mem(); let calls = 0;
    const send: Sender = async () => { calls++; await new Promise((r) => setTimeout(r, 5)); return { status: 200 }; };
    const q = new SyncQueue("k", st, send);
    q.enqueue(op("a")); q.enqueue(op("b"));
    await Promise.all([q.flush(), q.flush(), q.flush()]);
    expect(calls).toBe(2);
  });

  it("armazenamento corrompido não derruba a fila", () => {
    const st = mem(); st.setItem("k", "{{não é json");
    const q = new SyncQueue("k", st, async () => ({ status: 200 }));
    expect(q.pending()).toEqual([]);
    q.enqueue(op("a")); expect(q.pending()).toHaveLength(1);
  });

  it("filas de treinos diferentes são independentes", async () => {
    const st = mem();
    const send: Sender = async () => ({ status: 200 });
    const a = new SyncQueue("treino-1", st, send); const b = new SyncQueue("treino-2", st, send);
    a.enqueue(op("x")); expect(b.pending()).toEqual([]);
  });
});
