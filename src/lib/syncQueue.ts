// Fila de sincronização offline. Cada operação é uma chamada idempotente da API (o id da série /
// do registro / do exercício extra é gerado no cliente), então reenviar após falha parcial nunca duplica.
// Regras:
//  - operações saem em ordem; erro de REDE (sem resposta) interrompe e tenta de novo depois;
//  - resposta 4xx = conflito (ex.: permissão revogada, versão substituída): a operação vai para
//    "conflitos" para o aluno ver e descartar, e a fila segue;
//  - resposta 5xx é tratada como temporária (interrompe e tenta de novo).
export interface QueuedOp { id: string; method: "POST" | "PUT"; path: string; body: unknown; label: string; at: number }
export interface Conflict { op: QueuedOp; status: number; message: string }

export interface QueueStorage { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
export type Sender = (op: QueuedOp) => Promise<{ status: number; message?: string }>;

interface State { ops: QueuedOp[]; conflicts: Conflict[] }

export class SyncQueue {
  private flushing: Promise<FlushResult> | null = null;
  constructor(private key: string, private storage: QueueStorage, private send: Sender) {}

  private read(): State {
    try { const raw = this.storage.getItem(this.key); if (raw) return JSON.parse(raw) as State; } catch { /* corrompido: recomeça */ }
    return { ops: [], conflicts: [] };
  }
  private write(s: State) { this.storage.setItem(this.key, JSON.stringify(s)); }

  enqueue(op: Omit<QueuedOp, "at">): void {
    const s = this.read();
    // Mesma operação (mesmo id) substitui a anterior: só vale o último valor da série.
    const rest = s.ops.filter((o) => o.id !== op.id);
    rest.push({ ...op, at: Date.now() });
    this.write({ ...s, ops: rest });
  }
  pending(): QueuedOp[] { return this.read().ops; }
  conflicts(): Conflict[] { return this.read().conflicts; }
  discardConflict(opId: string): void { const s = this.read(); this.write({ ...s, conflicts: s.conflicts.filter((c) => c.op.id !== opId) }); }

  /** Envia o que está pendente. Chamadas simultâneas compartilham o mesmo envio. */
  flush(): Promise<FlushResult> {
    if (this.flushing) return this.flushing;
    this.flushing = this.run().finally(() => { this.flushing = null; });
    return this.flushing;
  }

  private async run(): Promise<FlushResult> {
    let sent = 0; let conflicts = 0;
    for (;;) {
      const s = this.read();
      const op = s.ops[0];
      if (!op) return { sent, conflicts, remaining: 0, stopped: false };
      let res: { status: number; message?: string };
      try { res = await this.send(op); } catch { return { sent, conflicts, remaining: s.ops.length, stopped: true }; }
      const cur = this.read();
      if (res.status >= 200 && res.status < 300) { sent++; this.write({ ...cur, ops: cur.ops.filter((o) => o.id !== op.id) }); }
      else if (res.status >= 400 && res.status < 500) {
        conflicts++;
        this.write({ ops: cur.ops.filter((o) => o.id !== op.id), conflicts: [...cur.conflicts, { op, status: res.status, message: res.message ?? "Não foi possível sincronizar" }] });
      } else return { sent, conflicts, remaining: cur.ops.length, stopped: true };
    }
  }
}

export interface FlushResult { sent: number; conflicts: number; remaining: number; stopped: boolean }
