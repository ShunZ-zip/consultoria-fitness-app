// Validação ponta a ponta por HTTP contra um servidor em execução (entregas 1 a 5 + senha).
// Uso: npm run dev (outro terminal) e depois npm run validate [http://localhost:3000]
// Cria contas novas a cada execução (e-mails com sufixo aleatório); não depende do seed.
import { sign } from "../src/server/payments";
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

  section("Caixa de feedbacks (esforço, comentário, resolver, isolamento)");
  const fbLog = (await a1.c.post(`/versions/${v1}/logs`, {})).body.id as string;
  await a1.c.put(`/logs/${fbLog}/sets/${uuid()}`, { versionSetId: sets[0], reps: 10, loadKg: 40, rir: 2 });
  check("esforço fora da escala (0 e 9) é 400 e não conclui", (await a1.c.post(`/logs/${fbLog}/finish`, { effort: 9 })).status === 400 && (await a1.c.post(`/logs/${fbLog}/finish`, { effort: 0 })).status === 400);
  check("aluno conclui com esforço e comentário", (await a1.c.post(`/logs/${fbLog}/finish`, { note: "Ombro cansou no fim", effort: 5 })).status === 200);
  const fbList = (await ana.get("/feedbacks")).body;
  const fbItem = fbList.items.find((i: any) => i.id === fbLog);
  check("personal vê o feedback com esforço, comentário e séries registradas", !!fbItem && fbItem.effortLabel === "Intensa" && fbItem.note === "Ombro cansou no fim" && fbItem.setsDone === 1 && fbItem.resolved === false && fbList.counts.open >= 1);
  check("outra consultoria não vê nem resolve (404); aluno 403", (await beta.get("/feedbacks")).body.items.length === 0 && (await beta.post(`/feedbacks/${fbLog}/resolve`, { resolved: true })).status === 404 && (await a1.c.get("/feedbacks")).status === 403 && (await a1.c.post(`/feedbacks/${fbLog}/resolve`, { resolved: true })).status === 403);
  check("resolver tira da fila e reabrir devolve", (await ana.post(`/feedbacks/${fbLog}/resolve`, { resolved: true })).status === 200 && !(await ana.get("/feedbacks")).body.items.some((i: any) => i.id === fbLog) && (await ana.get("/feedbacks?status=resolved")).body.items.some((i: any) => i.id === fbLog) && (await ana.post(`/feedbacks/${fbLog}/resolve`, { resolved: false })).status === 200 && (await ana.get("/feedbacks")).body.items.some((i: any) => i.id === fbLog));

  section("Iniciar treino com a hora real");
  const iniId = uuid();
  const ini = await a1.c.post(`/versions/${v1}/logs`, { id: iniId, startedAt: new Date(Date.now() - 30 * 60_000).toISOString() });
  const iniAge = Date.now() - Date.parse(ini.body.startedAt);
  check("início informado (30 min atrás) é guardado; reenviar o mesmo id não o altera", ini.status === 200 && iniAge > 29 * 60_000 && iniAge < 31 * 60_000 && (await a1.c.post(`/versions/${v1}/logs`, { id: iniId, startedAt: new Date().toISOString() })).body.startedAt === ini.body.startedAt);
  check("início no futuro ou formato inválido não distorcem (agora / 400)", Date.now() - Date.parse((await a1.c.post(`/versions/${v1}/logs`, { startedAt: new Date(Date.now() + 3600_000).toISOString() })).body.startedAt) < 5_000 && (await a1.c.post(`/versions/${v1}/logs`, { startedAt: "ontem" })).status === 400);
  await a1.c.post(`/logs/${iniId}/finish`, {});

  section("Frequência semanal e engajamento");
  const myEng = await a1.c.get("/me/engagement?tz=-180");
  const prEng = await ana.get(`/students/${a1.id}/engagement?tz=-180`);
  check("aluno vê a própria semana (7 dias) e o personal vê a do aluno, iguais", myEng.status === 200 && myEng.body.week.length === 7 && myEng.body.totalSessions >= 2 && prEng.status === 200 && prEng.body.totalSessions === myEng.body.totalSessions && prEng.body.week.some((d: any) => d.today && d.trained));
  check("engajamento: sessão de hoje = engajado; id inválido 404; outra consultoria 404; aluno 403 na rota do personal; personal 403 na do aluno", prEng.body.status === "engaged" && (await ana.get("/students/nao-e-uuid/engagement")).status === 404 && (await beta.get(`/students/${a1.id}/engagement`)).status === 404 && (await a1.c.get(`/students/${a1.id}/engagement`)).status === 403 && (await ana.get("/me/engagement")).status === 403);

  const cmp = (await ana.get(`/versions/${v1}/comparison`)).body;
  const rows = cmp.logs.find((l: any) => l.id === log).rows;   // por id: outras sessões do aluno nesta versão não mudam a conta
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
  check("v1 e o registro do aluno ficam preservados", (await ana.get(`/versions/${v1}/comparison`)).body.logs.some((l: any) => l.id === log) && (await ana.get(`/versions/${v1}`)).body.exercises[0].sets[0].loadKg === 40);
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

  // ------------------------------------------------------------------ Entrega 3
  section("Entrega 3 · evolução e último treino");
  // a seção de senha redefiniu a senha do a1 e derrubou a sessão dele: entra de novo
  await a1.c.post("/auth/login", { email: `a1.${RUN}@a.test`, password: known.body.devLink ? "nova-senha-77" : "senha-segura-1" });
  const e3 = await student(ana, "e3");
  const e3w = (await ana.post("/versions", { studentId: e3.id, name: "Treino E3", publish: true, exercises: [{ exerciseId: ex["Supino reto"].id, sets: [wk({ loadKg: 60 }), wk({ loadKg: 60 })] }] })).body.id as string;
  const e3d = (await e3.c.get(`/versions/${e3w}`)).body;
  const e3sets: string[] = e3d.exercises.flatMap((e: any) => e.sets.map((s: any) => s.id));
  const e3log = (await e3.c.post(`/versions/${e3w}/logs`, {})).body.id as string;
  for (const s of e3sets) await e3.c.put(`/logs/${e3log}/sets/${uuid()}`, { versionSetId: s, reps: 10, loadKg: 62.5, rir: 2 });
  check("sessão aberta não entra no último treino", Object.keys((await e3.c.get(`/versions/${e3w}/last`)).body).length === 0);
  await e3.c.post(`/logs/${e3log}/finish`, { note: "" });
  const last = (await e3.c.get(`/versions/${e3w}/last`)).body;
  check("último treino mostra a melhor série da sessão concluída", last[e3d.exercises[0].id]?.best?.loadKg === 62.5 && last[e3d.exercises[0].id].sets.length === 2);
  const evo = await ana.get(`/students/${e3.id}/evolution`);
  check("personal vê a evolução com a ressalva sobre hipertrofia", evo.status === 200 && evo.body.summary.sessionsCompleted === 1 && /não representa necessariamente hipertrofia/.test(evo.body.summary.note) && evo.body.exercises.length >= 1);
  const e3perm = (await ana.get(`/students/${e3.id}/permissions`)).body;
  await ana.put(`/students/${e3.id}/permissions`, { ...e3perm, viewHistory: false });
  check("aluno sem a permissão não vê a própria evolução (403)", (await e3.c.get("/me/evolution")).status === 403);
  await ana.put(`/students/${e3.id}/permissions`, { ...e3perm, viewHistory: true });
  check("com a permissão, o aluno vê a própria evolução", (await e3.c.get("/me/evolution")).status === 200);
  check("isolamento da evolução e do último treino", (await beta.get(`/students/${e3.id}/evolution`)).status === 404 && (await e3.c.get(`/students/${a1.id}/evolution`)).status === 403 && (await a2.c.get(`/versions/${e3w}/last`)).status === 404 && (await ana.get(`/versions/${e3w}/last`)).status === 403);

  // ------------------------------------------------------------------ Entrega 4
  section("Entrega 4 · biblioteca e mídia por escopo");
  const own = await ana.post("/exercises", { name: `Remada TRX ${RUN}`, equipment: "TRX", primaryMuscles: ["Dorsais"], secondaryMuscles: ["Bíceps"] });
  check("personal cria exercício próprio; outra consultoria não o vê", own.status === 201 && !(await beta.get("/exercises")).body.some((e: any) => e.id === own.body.id) && (await b1.c.get(`/exercises/${own.body.id}/media`)).status === 404);
  check("nome repetido do catálogo e aluno criando são recusados", (await ana.post("/exercises", { name: "supino RETO", primaryMuscles: ["Peitoral"] })).status === 409 && (await a1.c.post("/exercises", { name: "X", primaryMuscles: ["Y"] })).status === 403);
  const sup = ex["Supino reto"].id as string;
  const vid = await ana.post(`/exercises/${sup}/media`, { title: `Meu supino ${RUN}`, url: "https://exemplo.com/meu.mp4" });
  check("vídeo próprio só em https", vid.status === 201 && (await ana.post(`/exercises/${sup}/media`, { title: "x", url: "http://exemplo.com/a.mp4" })).status === 400 && (await ana.post(`/exercises/${sup}/media`, { title: "x", url: "javascript:alert(1)" })).status === 400);
  const titles = async (c: Client) => ((await c.get(`/exercises/${sup}/media`)).body.resolved.items as any[]).map((i) => i.title);
  check("adicionar não muda o que o aluno vê até configurar", !(await titles(a2.c)).includes(`Meu supino ${RUN}`));
  check("regra geral 'ambas' vale para todos os alunos", (await ana.put(`/exercises/${sup}/media-preference`, { mode: "both", ownMediaId: vid.body.id })).status === 200 && (await titles(a2.c)).includes(`Meu supino ${RUN}`));
  check("regra por aluno prevalece; outro aluno segue a geral", (await ana.put(`/exercises/${sup}/media-preference`, { mode: "official", studentId: a2.id })).status === 200 && !(await titles(a2.c)).includes(`Meu supino ${RUN}`) && (await titles(a1.c)).includes(`Meu supino ${RUN}`));
  check("outra consultoria não recebe a personalização nem usa vídeo alheio", !(await titles(b1.c)).includes(`Meu supino ${RUN}`) && (await beta.put(`/exercises/${sup}/media-preference`, { mode: "own", ownMediaId: vid.body.id })).status === 400);
  check("aluno vê só o resultado e não altera mídia (403)", Object.keys((await a1.c.get(`/exercises/${sup}/media`)).body).sort().join() === "exercise,resolved" && (await a1.c.put(`/exercises/${sup}/media-preference`, { mode: "own", ownMediaId: vid.body.id })).status === 403);

  section("Entrega 4 · avaliações");
  const tpl4 = await ana.post("/assessment-templates", { key: "triagem" });
  check("modelo pronto da consultoria; outra consultoria não vê; aluno 403", tpl4.status === 201 && (await beta.get("/assessment-templates")).body.templates.length === 0 && (await a1.c.get("/assessment-templates")).status === 403);
  const asm = await ana.post(`/students/${a1.id}/assessments`, { templateId: tpl4.body.id });
  check("personal envia; o aluno vê pendente", asm.status === 201 && asm.body.status === "pending" && (await a1.c.get("/me/assessments")).body.some((x: any) => x.id === asm.body.id && x.status === "pending"));
  const ans = { dor_peito: false, tontura: false, pressao: false, cronica: false, lesao_atual: true, detalhes: "joelho direito" };
  check("resposta inválida recusada; válida aceita uma vez só", (await a1.c.post(`/assessments/${asm.body.id}/submit`, { answers: { dor_peito: "não" } })).status === 400 && (await a1.c.post(`/assessments/${asm.body.id}/submit`, { answers: ans })).status === 200 && (await a1.c.post(`/assessments/${asm.body.id}/submit`, { answers: ans })).status === 409);
  check("dado de saúde isolado: outro aluno e outra consultoria recebem 404", (await a2.c.get(`/assessments/${asm.body.id}`)).status === 404 && (await beta.get(`/assessments/${asm.body.id}`)).status === 404 && (await beta.get(`/students/${a1.id}/assessments`)).status === 404 && (await a2.c.post(`/assessments/${asm.body.id}/submit`, { answers: ans })).status === 404);
  await ana.get(`/assessments/${asm.body.id}`);
  const aud4 = (await ana.get("/audit")).body as any[];
  check("leitura pelo personal fica na auditoria sem as respostas", aud4.some((x) => x.action === "assessment.view") && aud4.some((x) => x.action === "assessment.create") && !JSON.stringify(aud4).includes("joelho"));

  section("Entrega 4 · check-ins");
  const good = { sono: 7, fadiga: 4, estresse: 3, motivacao: 8, dor: "Não" };
  check("aluno responde e fica em dia; resposta inválida é recusada", (await a2.c.post("/me/checkin", { answers: { sono: 7 } })).status === 400 && (await a2.c.post("/me/checkin", { answers: good })).status === 201 && (await a2.c.get("/me/checkin")).body.due === false);
  const hurt = await e3.c.post("/me/checkin", { answers: { ...good, fadiga: 9, dor: "Sim, desconforto significativo" } });
  const panel = (await ana.get("/checkins")).body as any[];
  check("painel: alerta vem primeiro; só a própria consultoria", hurt.status === 201 && panel[0].studentId === e3.id && panel[0].priority === 2 && !panel.some((p) => p.studentId === b1.id));
  check("configuração por aluno; aluno e outra consultoria não alteram", (await ana.put(`/students/${a2.id}/checkin-config`, { frequencyDays: 3, questionIds: ["sono", "dor"] })).status === 200 && (await a2.c.get("/me/checkin")).body.frequencyDays === 3 && (await a2.c.put("/checkin-config", { frequencyDays: 1, questionIds: ["sono"] })).status === 403 && (await beta.put(`/students/${a2.id}/checkin-config`, { frequencyDays: 1, questionIds: ["sono"] })).status === 404 && (await beta.get(`/students/${a2.id}/checkins`)).status === 404);

  section("Entrega 4 · chat privado");
  check("mensagem do aluno chega ao personal como não lida; ler zera", (await a1.c.post("/me/chat", { body: "Treino de hoje ficou pesado" })).status === 201 && (await ana.get("/chat/unread")).body.count >= 1 && (await ana.post(`/chat/${a1.id}/read`, {})).status === 200 && (await ana.get(`/chat/${a1.id}`)).body.some((m: any) => m.body === "Treino de hoje ficou pesado" && m.mine === false));
  check("personal responde e o aluno vê", (await ana.post(`/chat/${a1.id}`, { body: "Vamos reduzir a carga" })).status === 201 && (await a1.c.get("/me/chat")).body.some((m: any) => m.body === "Vamos reduzir a carga" && m.mine === false));
  check("vazio e longo demais recusados", (await a1.c.post("/me/chat", { body: "   " })).status === 400 && (await a1.c.post("/me/chat", { body: "x".repeat(2001) })).status === 400);
  check("isolamento: a conversa de um aluno não vaza para o outro nem para outra consultoria", !JSON.stringify((await a2.c.get("/me/chat")).body).includes("Treino de hoje ficou pesado") && (await beta.get(`/chat/${a1.id}`)).status === 404 && (await beta.post(`/chat/${a1.id}`, { body: "oi" })).status === 404 && (await a2.c.get("/chat")).status === 403);
  let chatLast = 0;
  for (let i = 0; i < 32; i++) chatLast = (await e3.c.post("/me/chat", { body: `m${i}` })).status;
  check("excesso de mensagens por minuto: 429", chatLast === 429, String(chatLast));

  // ------------------------------------------------------------------ Entrega 5
  section("Entrega 5 · cobrança, webhook assinado e painel");
  const SECRET = "dev-webhook-secret"; // padrão fora de produção
  const hook = async (body: unknown, sig?: string | null) => {
    const raw = JSON.stringify(body);
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (sig !== null) headers["x-signature"] = sig ?? sign(SECRET, raw);
    const res = await fetch(BASE + "/api/webhooks/payments", { method: "POST", headers, body: raw });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const evt = (ref: string, type: string, o: { id?: string; amount?: number; fee?: number; method?: string } = {}) => ({ id: o.id ?? uuid(), type, data: { ref, amountCents: o.amount, feeCents: o.fee, method: o.method } });
  const mk = async (studentId: string, cents = 20000) => { const r = await ana.post(`/students/${studentId}/charges`, { description: "Mensalidade", amountCents: cents, dueDate: "2099-01-01" }); return { id: r.body.id as string, ref: `sim_ch_${r.body.id}`, status: r.status }; };
  const billing = async (c: Client, studentId: string) => (await c.get(`/students/${studentId}/billing`)).body.charges as any[];
  const ch1 = await mk(a1.id);
  const ch2 = await mk(a1.id);
  const probe = await hook(evt(ch1.ref, "payment.confirmed", { amount: 20000 }), null);
  if (probe.status === 503) {
    console.log("  (servidor em produção sem segredo: o webhook recusa tudo; coberto em tests/delivery5.test.ts)");
  } else {
    check("webhook sem assinatura ou com assinatura errada: 401", probe.status === 401 && (await hook(evt(ch1.ref, "payment.confirmed", { amount: 20000 }), "00".repeat(32))).status === 401 && (await billing(ana, a1.id)).find((c) => c.id === ch1.id).status === "pending");
    const paid = evt(ch1.ref, "payment.confirmed", { amount: 20000, fee: 518, method: "pix" });
    const results: string[] = []; for (let i = 0; i < 4; i++) results.push((await hook(paid)).body.result);
    const row = (await billing(ana, a1.id)).find((c) => c.id === ch1.id);
    check("o mesmo evento 4 vezes aplica uma só (taxa e método intactos)", results.join() === "applied,duplicate,duplicate,duplicate" && row.status === "paid" && row.feeCents === 518 && row.method === "pix");
    check("valor divergente é rejeitado e não altera a cobrança", (await hook(evt(ch2.ref, "payment.confirmed", { amount: 1 }))).body.result === "rejected" && (await billing(ana, a1.id)).find((c) => c.id === ch2.id).status === "pending");
    check("falha depois de pago é ignorada; estorno funciona", (await hook(evt(ch1.ref, "payment.failed"))).body.result === "ignored" && (await hook(evt(ch1.ref, "payment.refunded"))).body.result === "applied" && (await billing(ana, a1.id)).find((c) => c.id === ch1.id).status === "refunded");
    check("cobrança do aluno e assinatura da plataforma não se misturam (a referência decide o alvo)", (await hook(evt(ch2.ref, "payment.canceled"))).body.scope === "student_charge" && (await hook(evt("sim_inv_" + uuid(), "payment.confirmed", { amount: 100 }))).body.result !== "applied");
  }

  section("Entrega 5 · contrato, ciclo, recebimento manual e painel");
  const ctr = await ana.post(`/students/${a2.id}/contracts`, { description: "Consultoria mensal", amountCents: 15000, dueDay: 10 });
  check("contrato mensal criado; valor e dia inválidos recusados", ctr.status === 201 && (await ana.post(`/students/${a2.id}/contracts`, { description: "x", amountCents: 0, dueDay: 10 })).status === 400 && (await ana.post(`/students/${a2.id}/contracts`, { description: "x", amountCents: 100, dueDay: 40 })).status === 400);
  const cycle1 = await ana.post("/billing/cycle", {});
  const cycle2 = await ana.post("/billing/cycle", {});
  check("ciclo do mês não duplica cobrança por contrato", cycle1.status === 200 && cycle2.body.generated === 0);
  const ch3 = await mk(a2.id, 9000);
  check("recebimento manual só vale para cobrança em aberto e é auditado", (await ana.post(`/charges/${ch3.id}/mark-paid`, { method: "cash" })).status === 200 && (await ana.post(`/charges/${ch3.id}/mark-paid`, { method: "cash" })).status === 409 && ((await ana.get("/audit")).body as any[]).some((x) => /charge/.test(x.action)));
  const ch4 = await mk(a2.id, 7000);
  check("cancelamento: outra consultoria 404, aluno 403, personal 200", (await beta.post(`/charges/${ch4.id}/cancel`, {})).status === 404 && (await a2.c.post(`/charges/${ch4.id}/cancel`, {})).status === 403 && (await ana.post(`/charges/${ch4.id}/cancel`, {})).status === 200);
  await ana.post("/expenses", { description: "Aluguel", category: "Espaço", amountCents: 5000, date: new Date().toISOString().slice(0, 10) });
  const dash = (await ana.get("/billing/dashboard")).body;
  check("painel do mês: recebido, despesas e resultado coerentes", dash.receivedCents >= 9000 && dash.expensesCents === 5000 && dash.resultCents === dash.netReceivedCents - dash.expensesCents && /futura/.test(dash.notIncluded), JSON.stringify(dash));
  check("painel e eventos isolados por consultoria; aluno 403", (await beta.get("/billing/dashboard")).body.receivedCents === 0 && (await beta.get("/billing/events")).body.length === 0 && (await a1.c.get("/billing/dashboard")).status === 403 && (await a1.c.post("/billing/cycle", {})).status === 403);

  section("Entrega 5 · cobranças do aluno, simulador e assinatura");
  const mine = (await a2.c.get("/me/billing")).body;
  check("aluno vê só as próprias cobranças e a contratação", mine.charges.length > 0 && !JSON.stringify(mine).includes(ch2.id) && mine.contracts.length === 1);
  const open = mine.charges.find((c: any) => ["pending", "overdue"].includes(c.status));
  check("aluno simula o próprio pagamento; cobrança alheia: 404", !!open && (await a2.c.post(`/me/charges/${open.id}/simulate`, { outcome: "paid" })).body.result === "applied" && (await a2.c.post(`/me/charges/${ch2.id}/simulate`, { outcome: "paid" })).status === 404);
  const saas = (await ana.get("/saas")).body;
  check("assinatura: plano gratuito por padrão e planos marcados como proposta", saas.subscription.planId === "free" && saas.plansAreProposal === true);
  check("trocar de plano inicia o teste; plano inválido 400; aluno 403; limite não bloqueia", (await ana.post("/saas/plan", { planId: "starter" })).status === 200 && (await ana.get("/saas")).body.subscription.status === "trialing" && (await ana.post("/saas/plan", { planId: "invalido" })).status === 400 && (await a1.c.post("/saas/plan", { planId: "premium" })).status === 403 && (await ana.post("/versions", { studentId: a1.id, name: "Sem bloqueio por limite", exercises: [{ exerciseId: sup, sets: [wk()] }] })).status === 201);
  check("assinatura de uma consultoria não aparece na outra", (await beta.get("/saas")).body.subscription.planId === "free");
  if (probe.status !== 503) {
    // Com o teste já usado, voltar a um plano pago gera a fatura da plataforma: ela é paga por webhook assinado (HTTP real).
    await ana.post("/saas/plan", { planId: "free" });
    await ana.post("/saas/plan", { planId: "starter" });
    const inv = (await ana.get("/saas")).body.invoices.find((i: any) => i.status === "pending");
    const ref = inv ? `sim_inv_${inv.id}` : "";
    const bad = inv ? await hook(evt(ref, "payment.confirmed", { amount: 1 })) : null;
    const ok = inv ? evt(ref, "payment.confirmed", { amount: inv.amountCents, method: "pix" }) : null;
    const r1 = ok ? (await hook(ok)).body.result : "", r2 = ok ? (await hook(ok)).body.result : "";
    const after = (await ana.get("/saas")).body;
    check("fatura da plataforma paga por webhook: valor errado rejeitado, evento repetido ignorado, assinatura ativa", !!inv && bad?.body.result === "rejected" && r1 === "applied" && r2 === "duplicate" && after.invoices.find((i: any) => i.id === inv.id).status === "paid" && after.subscription.status === "active" && (await beta.get("/saas")).body.invoices.length === 0);
  }

  section("Rotinas (metadados, visibilidade para o aluno, isolamento)");
  const rt = await ana.post(`/students/${a1.id}/routines`, { name: "Mesociclo HTTP", goal: "Hipertrofia", level: "Intermediário", notes: "Aquecer 10 min" });
  check("criar rotina; nome vazio e datas incoerentes são 400", rt.status === 201 && (await ana.post(`/students/${a1.id}/routines`, { name: " " })).status === 400 && (await ana.post(`/students/${a1.id}/routines`, { name: "x", startsOn: "2026-05-10", endsOn: "2026-05-01" })).status === 400);
  const rtWk = await ana.post("/versions", { studentId: a1.id, name: "Treino em rotina", publish: true, routineId: rt.body.id, exercises: [{ exerciseId: sup, sets: [wk()] }] });
  const seeRt = async () => ((await a1.c.get("/versions")).body as any[]).some((v) => v.name === "Treino em rotina");
  check("treino criado dentro da rotina; o aluno o vê e lê as orientações", rtWk.status === 201 && (await seeRt()) && (await a1.c.get("/me/routines")).body.some((r: any) => r.id === rt.body.id && r.notes === "Aquecer 10 min"));
  check("arquivar esconde do aluno (e restaurar devolve); o personal continua vendo o treino", (await ana.post(`/routines/${rt.body.id}/status`, { status: "archived" })).status === 200 && !(await seeRt()) && !(await a1.c.get("/me/routines")).body.some((r: any) => r.id === rt.body.id) && ((await ana.get("/versions")).body as any[]).some((v) => v.name === "Treino em rotina" && v.routineName === "Mesociclo HTTP") && (await ana.post(`/routines/${rt.body.id}/status`, { status: "active" })).status === 200 && (await seeRt()));
  const soon = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10), later = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10);
  const fut = await ana.post(`/students/${a1.id}/routines`, { name: "Futura HTTP", startsOn: soon, endsOn: later, visibility: "from_start" });
  await ana.post("/versions", { studentId: a1.id, name: "Treino da futura", publish: true, routineId: fut.body.id, exercises: [{ exerciseId: sup, sets: [wk()] }] });
  check("rotina que começa no futuro com 'só a partir do início' não aparece para o aluno (nem as orientações); o personal vê o motivo", fut.status === 201 && !((await a1.c.get("/versions")).body as any[]).some((v) => v.name === "Treino da futura") && !(await a1.c.get("/me/routines")).body.some((r: any) => r.id === fut.body.id) && ((await ana.get(`/students/${a1.id}/routines`)).body as any[]).find((r) => r.id === fut.body.id)?.hiddenReason === "not_started");
  check("ISOLAMENTO: outra consultoria 404 (listar e excluir rotina); aluno 403; treino em rotina de outro aluno 404", (await beta.get(`/students/${a1.id}/routines`)).status === 404 && (await beta.post(`/routines/${rt.body.id}/status`, { status: "deleted" })).status === 404 && (await a1.c.get(`/students/${a1.id}/routines`)).status === 403 && (await a1.c.post(`/routines/${rt.body.id}/status`, { status: "deleted" })).status === 403 && (await ana.post("/versions", { studentId: a2.id, name: "Rotina do outro aluno", routineId: rt.body.id, exercises: [{ exerciseId: sup, sets: [wk()] }] })).status === 404);

  section("Ordem dos treinos do aluno");
  const progOrder = async (c: Client) => [...new Set(((await c.get("/versions")).body as any[]).filter((v) => v.studentId === a1.id).map((v) => v.programId as string))];
  const before = await progOrder(ana);
  const reversed = [...before].reverse();
  const reo = await ana.post(`/students/${a1.id}/workouts/order`, { programIds: reversed });
  const trainerOrder = await progOrder(ana), studentOrder = await progOrder(a1.c);
  check("personal reordena os treinos; o aluno vê os seus (publicados) na mesma ordem relativa", before.length >= 2 && reo.status === 200 && trainerOrder.join() === reversed.join() && studentOrder.length >= 1 && studentOrder.join() === trainerOrder.filter((id) => studentOrder.includes(id)).join());
  check("ordenar: programa de outra consultoria 404, aluno 403, lista vazia 400", (await ana.post(`/students/${a1.id}/workouts/order`, { programIds: [] })).status === 400 && (await beta.post(`/students/${a1.id}/workouts/order`, { programIds: before })).status === 404 && (await a1.c.post(`/students/${a1.id}/workouts/order`, { programIds: before })).status === 403);

  section("Perfil: nome, espaço e senha");
  check("personal altera nome e nome do espaço; o aluno vê o espaço novo; aluno não renomeia o espaço (403)", (await ana.put("/me/profile", { name: "Personal Renomeado", consultancyName: "Espaço Renomeado" })).status === 200 && (await ana.get("/me")).body.name === "Personal Renomeado" && (await a2.c.get("/me")).body.consultancyName === "Espaço Renomeado" && (await a2.c.put("/me/profile", { name: "Aluno", consultancyName: "Invasão" })).status === 403);
  check("trocar senha: atual errada 400, igual à atual 400, curta 400; correta 200", (await a2.c.post("/me/password", { currentPassword: "errada-12345", newPassword: "nova-senha-99" })).status === 400 && (await a2.c.post("/me/password", { currentPassword: "senha-segura-1", newPassword: "senha-segura-1" })).status === 400 && (await a2.c.post("/me/password", { currentPassword: "senha-segura-1", newPassword: "curta" })).status === 400 && (await a2.c.post("/me/password", { currentPassword: "senha-segura-1", newPassword: "nova-senha-99" })).status === 200 && (await a2.c.get("/me")).status === 200);

  section("Convite com dados do aluno e anamnese automática");
  const anTpl = await ana.post("/assessment-templates", { key: "anamnese" });
  const invX = await ana.post("/invites", { studentName: "Aluna Extras", birthDate: "1996-08-20", phone: "(21) 99876-5432", gender: "female", anamnesisTemplateId: anTpl.body.id });
  const accX = new Client();
  const accRes = await accX.post(`/invites/${invX.body.token}/accept`, { name: "Aluna Extras", email: `extras.${RUN}@a.test`, password: "senha-segura-1" });
  const idX = (await accX.get("/me")).body.id as string;
  const profX = (await ana.get(`/students/${idX}/profile`)).body;
  check("convite com extras: perfil guardado (WhatsApp normalizado, idade) e anamnese pendente para a aluna", invX.status === 201 && accRes.status === 201 && profX.phone === "5521998765432" && profX.age >= 29 && profX.genderText === "Feminino" && ((await accX.get("/me/assessments")).body as any[]).some((x) => x.templateName === "Anamnese básica" && x.status === "pending"));
  check("dados do aluno: outra consultoria 404, aluno 403; nascimento futuro, WhatsApp curto e modelo alheio são recusados", (await beta.get(`/students/${idX}/profile`)).status === 404 && (await accX.get(`/students/${idX}/profile`)).status === 403 && (await ana.post("/invites", { studentName: "x", birthDate: "2999-01-01" })).status === 400 && (await ana.post("/invites", { studentName: "x", phone: "12" })).status === 400 && (await beta.post("/invites", { studentName: "x", anamnesisTemplateId: anTpl.body.id })).status === 404);

  console.log(`\n${pass} verificações ok, ${fail} falhas`);
  if (fail) { console.log("\nFalhas:\n" + failures.map((f) => " - " + f).join("\n")); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
