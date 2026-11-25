// Validação ponta a ponta por HTTP contra um servidor em execução (entregas 1 e 2 + senha).
// Uso: npm run dev (outro terminal) e depois npm run validate [http://localhost:3000]
// Cria contas novas a cada execução (e-mails com sufixo aleatório); não depende do seed.
const BASE = process.argv[2] ?? "http://localhost:3000";
const RUN = Math.random().toString(36).slice(2, 8);

class Client {
  cookie = "";
  async req(method: string, path: string, body?: unknown, opts: { json?: boolean } = {}) {
    const headers: Record<string, string> = {};
    if (method !== "GET" && opts.json !== false) headers["content-type"] = "application/json";
    if (this.cookie) headers.cookie = this.cookie;
    const res = await fetch(BASE + "/api" + path, { method, headers, body: method === "GET" ? undefined : JSON.stringify(body ?? {}) });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, setCookie: set ?? "" };
  }
  get = (p: string) => this.req("GET", p);
  post = (p: string, b?: unknown) => this.req("POST", p, b ?? {});
  put = (p: string, b?: unknown) => this.req("PUT", p, b ?? {});
}

let pass = 0, fail = 0;
const failures: string[] = [];
let group = "";
function section(name: string) { group = name; console.log(`\n== ${name}`); }
function check(name: string, ok: boolean, detail = "") {
  if (ok) { pass++; console.log(`  ok   ${name}`); } else { fail++; failures.push(`${group} :: ${name} ${detail}`); console.log(`  FAIL ${name} ${detail}`); }
}
const uuid = () => crypto.randomUUID();
const wk = (o: any = {}) => ({ reps: 10, loadKg: 40, ...o });

async function trainer(label: string) {
  const c = new Client();
  const r = await c.post("/auth/register", { name: `Personal ${label}`, email: `${label}.${RUN}@v.test`, password: "senha-segura-1", consultancyName: `Cons ${label} ${RUN}` });
  if (r.status !== 201) throw new Error("registro falhou: " + JSON.stringify(r.body));
  return { c, r };
}
async function student(t: Client, label: string) {
  const inv = await t.post("/invites", { studentName: `Aluno ${label}` });
  const c = new Client();
  const acc = await c.post(`/invites/${inv.body.token}/accept`, { name: `Aluno ${label}`, email: `${label}.${RUN}@a.test`, password: "senha-segura-1" });
  if (acc.status !== 201) throw new Error("convite falhou: " + JSON.stringify(acc.body));
  const me = (await c.get("/me")).body;
  return { c, id: me.id as string, token: inv.body.token as string };
}

async function main() {
  const ping = await fetch(BASE + "/api/me").catch(() => null);
  if (!ping) { console.error(`Servidor não respondeu em ${BASE}. Rode "npm run dev" antes.`); process.exit(2); }

  const { c: ana, r: reg } = await trainer("ana");
  const { c: beta } = await trainer("beta");
  const cat = (await ana.get("/exercises")).body as any[];
  const ex = Object.fromEntries(cat.map((e) => [e.name, e]));

  // ------------------------------------------------------------------ Entrega 1
  section("Entrega 1 · fluxo: convite, treino, registro, comparação");
  check("cookie de sessão é HttpOnly e SameSite=Lax", /HttpOnly/i.test(reg.setCookie) && /SameSite=Lax/i.test(reg.setCookie), reg.setCookie);
  const a1 = await student(ana, "a1");
  const a2 = await student(ana, "a2");
  const b1 = await student(beta, "b1");
  check("aluno aceitou o convite e tem papel de aluno", (await a1.c.get("/me")).body.role === "student");
  check("lista de convites não expõe o token", !JSON.stringify((await ana.get("/invites")).body).includes(a1.token));
  check("convite é de uso único", (await new Client().post(`/invites/${a1.token}/accept`, { name: "X", email: `x.${RUN}@a.test`, password: "senha-segura-1" })).status === 404);

  const draft = await ana.post("/versions", { studentId: a1.id, name: "Treino A", exercises: [
    { exerciseId: ex["Supino reto"].id, alternativeIds: [ex["Supino inclinado com halteres"].id], sets: [wk({ rir: 2 }), wk({ rir: 2 })] },
    { exerciseId: ex["Remada curvada"].id, sets: [wk({ loadKg: 50 })] },
  ] });
  const v1 = draft.body.id as string;
  check("rascunho invisível ao aluno", (await a1.c.get("/versions")).body.length === 0 && (await a1.c.get(`/versions/${v1}`)).status === 404);
  check("personal publica", (await ana.post(`/versions/${v1}/publish`)).status === 200);
  const detail = (await a1.c.get(`/versions/${v1}`)).body;
  const sets: string[] = detail.exercises.flatMap((e: any) => e.sets.map((s: any) => s.id));
  const veIds: string[] = detail.exercises.map((e: any) => e.id);
  check("aluno vê o treino publicado com 3 séries", sets.length === 3);

  const log = (await a1.c.post(`/versions/${v1}/logs`, {})).body.id as string;
  const resend = uuid();
  const done = [{ reps: 10, loadKg: 40, rir: 2 }, { reps: 8, loadKg: 42.5, rir: 1 }, { reps: 10, loadKg: 50 }];
  for (const [i, s] of sets.entries()) await a1.c.put(`/logs/${log}/sets/${i === 1 ? resend : uuid()}`, { versionSetId: s, ...done[i] });
  for (let i = 0; i < 2; i++) await a1.c.put(`/logs/${log}/sets/${resend}`, { versionSetId: sets[1], ...done[1] });
  const logs = (await a1.c.get(`/versions/${v1}/logs`)).body;
  check("reenviar a mesma série não duplica (3 séries registradas)", logs[0].sets.length === 3, String(logs[0].sets.length));
  await a1.c.post(`/logs/${log}/finish`, { note: "ok" });

  const cmp = (await ana.get(`/versions/${v1}/comparison`)).body;
  const rows = cmp.logs[0].rows;
  check("comparação: prescrito e realizado lado a lado", rows.length === 3 && rows[1].prescribed.reps === 10 && rows[1].done.reps === 8);
  check("comparação: diferenças (−2 reps, +2,5 kg)", rows[1].diff.reps === -2 && rows[1].diff.loadKg === 2.5);
  check("prescrição publicada segue intacta após o registro", (await ana.get(`/versions/${v1}`)).body.exercises[0].sets[1].reps === 10);

  section("Entrega 1 · isolamento");
  const st = (c: Client, p: string) => c.get(p).then((r) => r.status);
  check("aluno A2 não lê o treino do A1", (await st(a2.c, `/versions/${v1}`)) === 404);
  check("aluno A2 não lê registros do A1", (await st(a2.c, `/versions/${v1}/logs`)) === 404);
  check("aluno A2 não grava no registro do A1", (await a2.c.put(`/logs/${log}/sets/${uuid()}`, { versionSetId: sets[0], reps: 99 })).status === 404);
  check("aluno A2 não finaliza o registro do A1", (await a2.c.post(`/logs/${log}/finish`)).status === 404);
  check("aluno de outra consultoria não vê nada", (await st(b1.c, `/versions/${v1}`)) === 404 && (await b1.c.get("/versions")).body.length === 0);
  check("personal de outra consultoria: 404 no treino e na comparação", (await st(beta, `/versions/${v1}`)) === 404 && (await st(beta, `/versions/${v1}/comparison`)) === 404);
  check("personal de outra consultoria não prescreve para aluno alheio", (await beta.post("/versions", { studentId: a1.id, name: "x", exercises: [{ exerciseId: ex["Supino reto"].id, sets: [{ reps: 5 }] }] })).status === 404);
  check("aluno não usa endpoints do personal (403)", (await st(a1.c, "/students")) === 403 && (await st(a1.c, `/versions/${v1}/comparison`)) === 403 && (await a1.c.post("/invites", { studentName: "x" })).status === 403);
  check("sem sessão: 401", (await st(new Client(), "/versions")) === 401);
  check("escrita sem JSON: 415", (await ana.req("POST", "/invites", { studentName: "x" }, { json: false })).status === 415);

  // ------------------------------------------------------------------ Entrega 2
  section("Entrega 2 · editor, versões, duplicar, modelos");
  const adv = await ana.post("/versions", { studentId: a2.id, name: "Avançado", exercises: [{ exerciseId: ex["Supino reto"].id, sets: [
    { setType: "warmup", reps: 12, loadPct: 40, restS: 45 },
    { setType: "prep", reps: 6, loadPct: 70, rpe: 6 },
    { setType: "work", reps: 8, repsMax: 12, loadPct: 80, rpe: 8.5, restS: 120, tempo: "3-1-1-0", note: "pausa" },
    { setType: "work", reps: 8, repsMax: 12, loadKg: 60, rir: 2 },
  ] }, { exerciseId: ex["Tríceps na polia"].id, sets: [wk(), wk()] }] });
  const s0 = (await ana.get(`/versions/${adv.body.id}`)).body.exercises[0].sets;
  check("campos por série: tipo, faixa, % 1RM, RPE, cadência, nota", s0[2].repsMax === 12 && s0[2].loadPct === 80 && s0[2].rpe === 8.5 && s0[2].tempo === "3-1-1-0" && s0[0].setType === "warmup");
  const bad = async (set: any) => (await ana.post("/versions", { studentId: a2.id, name: "x", exercises: [{ exerciseId: ex["Supino reto"].id, sets: [set] }] })).status;
  check("combinações inválidas recusadas (faixa, kg+%, RIR+RPE)", (await bad({ reps: 10, repsMax: 8 })) === 400 && (await bad({ reps: 8, loadKg: 5, loadPct: 5 })) === 400 && (await bad({ reps: 8, rir: 1, rpe: 8 })) === 400);
  const put = await ana.put(`/versions/${adv.body.id}`, { exercises: [{ exerciseId: ex["Tríceps na polia"].id, sets: [wk()] }, { exerciseId: ex["Supino reto"].id, sets: [wk(), wk()] }] });
  const re = (await ana.get(`/versions/${adv.body.id}`)).body;
  check("rascunho editável e reordenável", put.status === 200 && re.exercises[0].name === "Tríceps na polia" && re.exercises[1].sets.length === 2);
  await ana.post(`/versions/${adv.body.id}/publish`);
  check("publicado não aceita edição (409)", (await ana.put(`/versions/${adv.body.id}`, { exercises: [{ exerciseId: ex["Supino reto"].id, sets: [wk()] }] })).status === 409);

  const nv = await ana.post(`/versions/${v1}/new-version`);
  check("nova versão cria rascunho v2 (repetir devolve o mesmo)", nv.status === 201 && nv.body.version === 2 && (await ana.post(`/versions/${v1}/new-version`)).body.id === nv.body.id);
  await ana.put(`/students/${a1.id}/permissions`, { ...(await ana.get(`/students/${a1.id}/permissions`)).body, viewHistory: false });
  await ana.put(`/versions/${nv.body.id}`, { exercises: [{ exerciseId: ex["Supino reto"].id, sets: [wk({ loadKg: 45 }), wk({ loadKg: 45 }), wk({ loadKg: 45 })] }] });
  await ana.post(`/versions/${nv.body.id}/publish`);
  check("aluno passa a ver só a v2 (sem permissão de histórico)", JSON.stringify((await a1.c.get("/versions")).body.map((x: any) => x.version)) === "[2]");
  check("v1 e o registro do aluno ficam preservados", (await ana.get(`/versions/${v1}/comparison`)).body.logs.length === 1 && (await ana.get(`/versions/${v1}`)).body.exercises[0].sets[0].loadKg === 40);
  check("não se abre novo registro na versão anterior (409)", (await a1.c.post(`/versions/${v1}/logs`, {})).status === 409);

  const dup = await ana.post(`/versions/${v1}/duplicate`, { studentId: a2.id, name: "Cópia" });
  check("duplicar para outro aluno da consultoria (rascunho)", dup.status === 201 && (await ana.get(`/versions/${dup.body.id}`)).body.studentId === a2.id);
  check("duplicar para aluno de outra consultoria: 404", (await ana.post(`/versions/${v1}/duplicate`, { studentId: b1.id })).status === 404);
  const tpl = await ana.post("/templates", { name: "Modelo", versionId: v1 });
  check("modelo salvo e lido só pela própria consultoria", tpl.status === 201 && (await ana.get(`/templates/${tpl.body.id}`)).status === 200 && (await beta.get(`/templates/${tpl.body.id}`)).status === 404 && (await beta.get("/templates")).body.length === 0);

  section("Entrega 2 · volume por músculo e auditoria");
  const vol = async (id: string) => Object.fromEntries((await ana.get(`/versions/${id}/volume`)).body.muscles.map((m: any) => [m.muscle, m]));
  const volId = (await ana.post("/versions", { studentId: a2.id, name: "Vol", exercises: [
    { exerciseId: ex["Supino reto"].id, sets: [{ setType: "warmup", reps: 12 }, { setType: "prep", reps: 6 }, wk(), wk(), wk(), wk()] },
    { exerciseId: ex["Tríceps na polia"].id, sets: [wk(), wk(), wk()] }] })).body.id;
  let m = await vol(volId);
  check("diretas, indiretas, aquecimento e preparação separados", m["Peitoral"].direct === 4 && m["Peitoral"].warmup === 1 && m["Peitoral"].prep === 1 && m["Tríceps"].direct === 3 && m["Tríceps"].indirect === 4);
  check("ponderado = diretas + indiretas × 0,5", m["Tríceps"].weighted === 5);
  check("peso inválido recusado", (await ana.put("/settings", { indirectWeight: 0.3 })).status === 400);
  await ana.put("/settings", { indirectWeight: 0.25 });
  m = await vol(volId);
  check("alterar o peso muda o ponderado (3 + 4 × 0,25 = 4)", m["Tríceps"].weighted === 4);
  const aud = (await ana.get("/audit")).body as any[];
  check("alteração de configuração auditada (de 0,5 para 0,25, por quem)", aud.some((x) => x.action === "settings.indirect_weight" && x.detail.from === 0.5 && x.detail.to === 0.25 && x.actorName.startsWith("Personal ana")));
  check("configuração e auditoria isoladas por consultoria", (await beta.get("/settings")).body.indirectWeight === 0.5 && (await beta.get("/audit")).body.length === 0);

  section("Entrega 2 · autonomia por aluno (opção C)");
  const defaults = (await ana.get(`/students/${a2.id}/permissions`)).body;
  check("padrão do protótipo: 5 de 9 habilitadas", Object.keys(defaults).length === 9 && Object.values(defaults).filter(Boolean).length === 5);
  const pub = (await ana.post("/versions", { studentId: a2.id, name: "P", publish: true, exercises: [
    { exerciseId: ex["Supino reto"].id, alternativeIds: [ex["Supino inclinado com halteres"].id], sets: [wk(), wk()] }, { exerciseId: ex["Remada curvada"].id, sets: [wk()] }] })).body.id;
  const pd = (await a2.c.get(`/versions/${pub}`)).body;
  const pl = (await a2.c.post(`/versions/${pub}/logs`, {})).body.id;
  const ves: string[] = pd.exercises.map((e: any) => e.id);
  check("aluno sempre registra o realizado", (await a2.c.put(`/logs/${pl}/sets/${uuid()}`, { versionSetId: pd.exercises[0].sets[0].id, reps: 9, loadKg: 40 })).status === 200);
  check("volume bloqueado por padrão para o aluno (403) e treino alheio é 404", (await a2.c.get(`/versions/${pub}/volume`)).status === 403 && (await a2.c.get(`/versions/${v1}/volume`)).status === 404);
  check("ordem permitida por padrão", (await a2.c.put(`/logs/${pl}/order`, { order: [ves[1], ves[0]] })).status === 200);
  check("alternativa autorizada aceita; fora da lista recusada", (await a2.c.put(`/logs/${pl}/substitutions/${ves[0]}`, { exerciseId: ex["Supino inclinado com halteres"].id })).status === 200 && (await a2.c.put(`/logs/${pl}/substitutions/${ves[0]}`, { exerciseId: ex["Rosca direta"].id })).status === 403);
  check("exercício extra e série extra bloqueados por padrão (403)", (await a2.c.post(`/logs/${pl}/extra-exercises`, { exerciseId: ex["Rosca direta"].id })).status === 403 && (await a2.c.put(`/logs/${pl}/sets/${uuid()}`, { versionExerciseId: ves[0], position: 1, reps: 5 })).status === 403);
  check("aluno não altera as próprias permissões (403)", (await a2.c.put(`/students/${a2.id}/permissions`, { ...defaults, substituteFree: true })).status === 403);
  await ana.put(`/students/${a2.id}/permissions`, { ...defaults, addExercises: true, editSets: true });
  check("após liberar: exercício extra e série extra aceitos", (await a2.c.post(`/logs/${pl}/extra-exercises`, { exerciseId: ex["Rosca direta"].id })).status === 201 && (await a2.c.put(`/logs/${pl}/sets/${uuid()}`, { versionExerciseId: ves[0], position: 1, reps: 5 })).status === 200);
  const cmp2 = (await ana.get(`/versions/${pub}/comparison`)).body.logs[0];
  check("comparação separa prescrito, adaptado e realizado", cmp2.adaptations.adaptedOrder?.[0] === "Remada curvada" && cmp2.adaptations.substitutions.length === 1 && cmp2.adaptations.extraExercises.length === 1 && cmp2.rows[0].prescribed.reps === 10);

  section("Senha · esqueci a senha");
  const known = await new Client().post("/auth/forgot", { email: `a1.${RUN}@a.test` });
  const unknown = await new Client().post("/auth/forgot", { email: `ninguem.${RUN}@a.test` });
  check("resposta igual para e-mail cadastrado e inexistente (mesma mensagem)", known.status === 200 && unknown.status === 200 && known.body.message === unknown.body.message);
  check("sem devLink para e-mail inexistente", !unknown.body.devLink);
  if (known.body.devLink) {
    const token = known.body.devLink.split("/").pop();
    check("link válido", (await new Client().get(`/auth/reset/${token}`)).status === 200);
    check("redefine a senha", (await new Client().post("/auth/reset", { token, password: "nova-senha-77" })).status === 200);
    check("senha antiga não entra; nova entra", (await new Client().post("/auth/login", { email: `a1.${RUN}@a.test`, password: "senha-segura-1" })).status === 401 && (await new Client().post("/auth/login", { email: `a1.${RUN}@a.test`, password: "nova-senha-77" })).status === 200);
    check("sessão antiga caiu e o link não vale mais", (await a1.c.get("/me")).status === 401 && (await new Client().post("/auth/reset", { token, password: "outra-senha-88" })).status === 404);
  } else {
    console.log("  (servidor em produção: sem devLink; passos de redefinição cobertos em tests/password-reset.test.ts)");
  }

  console.log(`\n${pass} verificações ok, ${fail} falhas`);
  if (fail) { console.log("\nFalhas:\n" + failures.map((f) => " - " + f).join("\n")); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
