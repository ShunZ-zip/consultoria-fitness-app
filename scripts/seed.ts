// Dados FICTÍCIOS para testar localmente. Uso: npm run seed
import { BUILTIN_TEMPLATES } from "../src/lib/assessment";
import { computeFlags } from "../src/lib/checkin";
import { hashPassword, uid } from "../src/server/auth";
import { getDb } from "../src/server/db";

const PASSWORD = "demo12345";
const DAY = 86400000;

async function main() {
  const db = await getDb();
  const existing = await db.query("select 1 from users where email = 'personal.alfa@demo.test'");
  if (existing.rows.length > 0) {
    console.log("Seed já aplicado. Para recomeçar, apague a pasta data/ e rode de novo.");
    return;
  }
  const hash = await hashPassword(PASSWORD);

  async function consultancy(name: string, trainer: [string, string], students: [string, string][]) {
    const cid = uid();
    await db.query("insert into consultancies (id, name) values ($1,$2)", [cid, name]);
    const ids: Record<string, string> = {};
    for (const [role, [n, e]] of [
      ...[["trainer", trainer]] as const,
      ...students.map((s) => ["student", s] as const),
    ]) {
      const id = uid();
      ids[e] = id;
      await db.query("insert into users (id, email, name, password_hash) values ($1,$2,$3,$4)", [id, e, n, hash]);
      await db.query("insert into memberships (user_id, consultancy_id, role) values ($1,$2,$3)", [id, cid, role]);
    }
    return { cid, ids };
  }

  const alfa = await consultancy("Consultoria Alfa", ["Personal Alfa", "personal.alfa@demo.test"], [
    ["Aluno Um", "aluno1@demo.test"],
    ["Aluno Dois", "aluno2@demo.test"],
  ]);
  await consultancy("Consultoria Beta", ["Personal Beta", "personal.beta@demo.test"], [
    ["Aluno Três", "aluno3@demo.test"],
  ]);

  // Histórico fictício do Aluno Um: 6 semanas, 2 sessões por semana (uma falta), cargas crescentes.
  const trainerId = alfa.ids["personal.alfa@demo.test"];
  const studentId = alfa.ids["aluno1@demo.test"];
  const exId = async (name: string) => (await db.query<{ id: string }>("select id from exercises where consultancy_id is null and name = $1", [name])).rows[0].id;
  const supino = await exId("Supino reto"), remada = await exId("Remada curvada");

  const programId = uid(), versionId = uid();
  const start = new Date(Date.now() - 40 * DAY);
  await db.query("insert into programs (id, consultancy_id, student_id, name, created_by, weekly_frequency) values ($1,$2,$3,'Superiores A',$4,2)", [programId, alfa.cid, studentId, trainerId]);
  await db.query("insert into program_versions (id, program_id, version) values ($1,$2,1)", [versionId, programId]);
  const prescribed: { ve: string; sets: string[] }[] = [];
  for (const [i, [ex, nm, reps]] of ([[supino, "Supino reto", 10], [remada, "Remada curvada", 10]] as const).entries()) {
    const ve = uid();
    await db.query("insert into version_exercises (id, version_id, position, exercise_id, exercise_name) values ($1,$2,$3,$4,$5)", [ve, versionId, i + 1, ex, nm]);
    const sets: string[] = [];
    for (let j = 0; j < 3; j++) {
      const sid = uid(); sets.push(sid);
      await db.query("insert into version_sets (id, version_exercise_id, position, reps, rir, rest_s) values ($1,$2,$3,$4,2,90)", [sid, ve, j + 1, reps]);
    }
    prescribed.push({ ve, sets });
  }
  await db.query("update program_versions set status = 'published', published_at = $2 where id = $1", [versionId, start]);

  const supinoLoads = [50, 50, 52.5, 52.5, 55, 55, 57.5, 57.5, 60, 60, 62.5];
  const remadaLoads = [40, 42.5, 42.5, 45, 45, 47.5, 47.5, 50, 50, 52.5, 52.5];
  let sessionIdx = 0;
  for (let week = 0; week < 6; week++) {
    for (const dow of [0, 3]) {
      if (week === 3 && dow === 3) continue; // uma sessão perdida
      const at = new Date(start.getTime() + (week * 7 + dow) * DAY + 18 * 3600000);
      const logId = uid();
      // Caixa de feedbacks: esforço percebido e comentário; só as 2 últimas sessões ficam abertas.
      const effort = [3, 4, 4, 5, 5, 5, 6, 5, 6, 6, 7][sessionIdx] ?? 5;
      const comment = sessionIdx === 10 ? "Ombro direito incomodou no supino, reduzi a carga na última série." : null;
      const finishedAt = new Date(at.getTime() + 3600000);
      await db.query("insert into workout_logs (id, student_id, version_id, started_at, finished_at, effort, note, feedback_resolved_at) values ($1,$2,$3,$4,$5,$6,$7,$8)",
        [logId, studentId, versionId, at, finishedAt, effort, comment, sessionIdx < 9 ? finishedAt : null]);
      const loads = [supinoLoads[sessionIdx], remadaLoads[sessionIdx]];
      for (const [k, p] of prescribed.entries()) {
        for (const [j, sid] of p.sets.entries()) {
          const reps = j === 2 ? 8 : 10; // a última série costuma cair
          await db.query("insert into logged_sets (id, log_id, version_set_id, reps, load_kg, rir, created_at) values ($1,$2,$3,$4,$5,2,$6)", [uid(), logId, sid, reps, loads[k], at]);
        }
      }
      sessionIdx++;
    }
  }

  // Entrega 4: as animações oficiais são registradas ao abrir o banco (src/server/officialMedia.ts).

  const medidas = BUILTIN_TEMPLATES.find((t) => t.key === "medidas")!;
  const tplId = uid();
  await db.query("insert into assessment_templates (id, consultancy_id, name, kind, fields, created_by) values ($1,$2,$3,$4,$5::jsonb,$6)", [tplId, alfa.cid, medidas.name, medidas.kind, JSON.stringify(medidas.fields), trainerId]);
  for (const [days, peso, cintura] of [[35, 82.4, 91], [7, 80.9, 88.5]] as const) {
    const at = new Date(Date.now() - days * DAY);
    await db.query(
      `insert into assessments (id, consultancy_id, student_id, template_id, template_name, fields, answers, status, requested_by, filled_by, created_at, submitted_at)
       values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,'done',$8,'trainer',$9,$9)`,
      [uid(), alfa.cid, studentId, tplId, medidas.name, JSON.stringify(medidas.fields), JSON.stringify({ peso, cintura, altura: 178 }), trainerId, at]);
  }

  for (const [days, answers] of [
    [8, { sono: 7, fadiga: 4, estresse: 3, motivacao: 8, dor: "Não" }],
    [1, { sono: 5, fadiga: 8, estresse: 6, motivacao: 6, dor: "Sim, desconforto leve", observacoes: "Ombro direito incomodou no supino" }],
  ] as const) {
    await db.query("insert into checkins (id, consultancy_id, student_id, answers, flags, created_at) values ($1,$2,$3,$4::jsonb,$5::jsonb,$6)",
      [uid(), alfa.cid, studentId, JSON.stringify(answers), JSON.stringify(computeFlags(answers)), new Date(Date.now() - days * DAY)]);
  }

  for (const [hoursAgo, sender, bodyText, read] of [
    [30, studentId, "Oi! O supino ficou pesado ontem na última série.", true],
    [29, trainerId, "Boa! Mantenha a carga e tente fechar as 10 repetições com RIR 2.", true],
    [2, studentId, "Senti o ombro direito incomodar no supino. Pode olhar?", false],
  ] as const) {
    await db.query("insert into messages (id, consultancy_id, student_id, sender_id, body, created_at, read_at) values ($1,$2,$3,$4,$5,$6,$7)",
      [uid(), alfa.cid, studentId, sender, bodyText, new Date(Date.now() - hoursAgo * 3600000), read ? new Date() : null]);
  }

  // Entrega 5: contrato mensal, cobranças (paga, pendente, em atraso) e uma despesa (tudo fictício, provedor simulado).
  const today = new Date(); const ym = today.toISOString().slice(0, 7);
  const contractId = uid();
  await db.query("insert into student_contracts (id, consultancy_id, student_id, description, amount_cents, due_day, start_month, created_by) values ($1,$2,$3,'Acompanhamento mensal',20000,10,$4,$5)", [contractId, alfa.cid, studentId, new Date(Date.now() - 70 * DAY).toISOString().slice(0, 7), trainerId]);
  const chargeRows: [string, string, string, string | null][] = [
    [new Date(Date.now() - 62 * DAY).toISOString().slice(0, 7), "paid", "pix", new Date(Date.now() - 60 * DAY).toISOString()],
    [new Date(Date.now() - 31 * DAY).toISOString().slice(0, 7), "overdue", "", null],
    [ym, "pending", "", null],
  ];
  for (const [period, status, method, paidAt] of chargeRows) {
    const id = uid();
    await db.query(
      `insert into student_charges (id, consultancy_id, student_id, contract_id, period, description, amount_cents, fee_cents, due_date, status, method, provider_ref, created_by, paid_at)
       values ($1,$2,$3,$4,$5,'Acompanhamento mensal',20000,$6,$7,$8,$9,$10,$11,$12)`,
      [id, alfa.cid, studentId, contractId, period, status === "paid" ? 518 : 0, `${period}-10`, status, method || null, `sim_ch_${id}`, trainerId, paidAt]);
  }
  await db.query("insert into expenses (id, consultancy_id, description, category, amount_cents, date, created_by) values ($1,$2,'Aluguel do espaço','Espaço',15000,$3,$4)", [uid(), alfa.cid, `${ym}-02`, trainerId]);

  // Conta de TESTE local: login "admin" / senha "admin" (só para ver a tela final com números de exemplo; dados fictícios).
  const adminHash = await hashPassword("admin");
  const adm = uid();
  await db.query("insert into consultancies (id, name) values ($1,'Consultoria Modelo (teste)')", [adm]);
  const admTrainer = uid();
  await db.query("insert into users (id, email, name, password_hash) values ($1,'admin','Admin Teste',$2)", [admTrainer, adminHash]);
  await db.query("insert into memberships (user_id, consultancy_id, role) values ($1,$2,'trainer')", [admTrainer, adm]);
  const modelStudents: [string, number, number][] = [["Aluno Modelo 1", 25000, 5], ["Aluno Modelo 2", 18000, 10], ["Aluno Modelo 3", 32000, 15], ["Aluno Modelo 4", 15000, 20], ["Aluno Modelo 5", 22000, 25], ["Aluno Modelo 6", 28000, 8]];
  const monthOf = (back: number) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - back); return d.toISOString().slice(0, 7); };
  const methods = ["pix", "card", "boleto", "pix", "cash", "pix"];
  for (const [i, [nm, cents, dueDay]] of modelStudents.entries()) {
    const sid = uid();
    await db.query("insert into users (id, email, name, password_hash) values ($1,$2,$3,$4)", [sid, `modelo${i + 1}@demo.test`, nm, adminHash]);
    await db.query("insert into memberships (user_id, consultancy_id, role) values ($1,$2,'student')", [sid, adm]);
    const cId = uid();
    await db.query("insert into student_contracts (id, consultancy_id, student_id, description, amount_cents, due_day, start_month, created_by) values ($1,$2,$3,'Acompanhamento mensal',$4,$5,$6,$7)", [cId, adm, sid, cents, dueDay, monthOf(3), admTrainer]);
    for (const back of [3, 2, 1, 0]) {
      const period = monthOf(back);
      // meses antigos pagos; o anterior: alguns atrasados; o atual: alguns pagos, outros pendentes
      const status = back >= 2 ? "paid" : back === 1 ? (i % 3 === 2 ? "overdue" : "paid") : (i % 2 === 0 ? "paid" : "pending");
      const id = uid();
      const fee = status === "paid" ? Math.round(cents * 0.0259) : 0;
      await db.query(
        `insert into student_charges (id, consultancy_id, student_id, contract_id, period, description, amount_cents, fee_cents, due_date, status, method, provider_ref, created_by, paid_at)
         values ($1,$2,$3,$4,$5,'Acompanhamento mensal',$6,$7,$8,$9,$10,$11,$12,$13)`,
        [id, adm, sid, cId, period, cents, fee, `${period}-${String(dueDay).padStart(2, "0")}`, status, status === "paid" ? methods[i] : null, `sim_ch_${id}`, admTrainer, status === "paid" ? new Date(`${period}-${String(dueDay).padStart(2, "0")}T12:00:00Z`) : null]);
    }
  }
  for (const [d, cat, desc, cents, back] of [[3, "Espaço", "Aluguel do espaço", 60000, 0], [12, "Software", "Ferramentas e hospedagem", 8900, 0], [18, "Marketing", "Anúncios", 25000, 0], [5, "Espaço", "Aluguel do espaço", 60000, 1]] as const) {
    await db.query("insert into expenses (id, consultancy_id, description, category, amount_cents, date, created_by) values ($1,$2,$3,$4,$5,$6,$7)", [uid(), adm, desc, cat, cents, `${monthOf(back)}-${String(d).padStart(2, "0")}`, admTrainer]);
  }
  // Aluno Modelo 1: treino publicado e 3 sessões no topo da faixa de reps com RIR na meta (dispara a sugestão "avaliar aumento de carga").
  {
    const sid = (await db.query<{ id: string }>("select id from users where email = 'modelo1@demo.test'")).rows[0].id;
    const pId = uid(), vId = uid();
    await db.query("insert into programs (id, consultancy_id, student_id, name, created_by, weekly_frequency) values ($1,$2,$3,'Superiores (modelo)',$4,2)", [pId, adm, sid, admTrainer]);
    await db.query("insert into program_versions (id, program_id, version) values ($1,$2,1)", [vId, pId]);
    const setIds: string[] = [];
    for (const [i, [ex, nm]] of ([[supino, "Supino reto"], [remada, "Remada curvada"]] as const).entries()) {
      const ve = uid();
      await db.query("insert into version_exercises (id, version_id, position, exercise_id, exercise_name) values ($1,$2,$3,$4,$5)", [ve, vId, i + 1, ex, nm]);
      for (let j = 0; j < 3; j++) {
        const vs = uid(); if (i === 0) setIds.push(vs);
        await db.query("insert into version_sets (id, version_exercise_id, position, reps, reps_max, load_kg, rir, rest_s) values ($1,$2,$3,8,10,$4,2,90)", [vs, ve, j + 1, i === 0 ? 40 : 50]);
      }
    }
    await db.query("update program_versions set status = 'published', published_at = $2 where id = $1", [vId, new Date(Date.now() - 20 * DAY)]);
    for (const days of [14, 7, 1]) {
      const at = new Date(Date.now() - days * DAY), logId = uid();
      const finishedAt = new Date(at.getTime() + 3600000);
      await db.query("insert into workout_logs (id, student_id, version_id, started_at, finished_at, effort, note, feedback_resolved_at) values ($1,$2,$3,$4,$5,$6,$7,$8)",
        [logId, sid, vId, at, finishedAt, days === 14 ? 4 : days === 7 ? 5 : 6, days === 1 ? "Treino pesado, mas consegui terminar." : null, days > 1 ? finishedAt : null]);
      for (const vs of setIds) await db.query("insert into logged_sets (id, log_id, version_set_id, reps, load_kg, rir, created_at) values ($1,$2,$3,10,40,2,$4)", [uid(), logId, vs, at]);
    }
  }
  // Mensagem e check-in de exemplo para o painel do personal não ficar vazio.
  const firstModel = (await db.query<{ id: string }>("select id from users where email = 'modelo1@demo.test'")).rows[0].id;
  await db.query("insert into messages (id, consultancy_id, student_id, sender_id, body, created_at, read_at) values ($1,$2,$3,$4,'Posso trocar o treino de quinta?', now() - interval '3 hours', null)", [uid(), adm, firstModel, firstModel]);
  const ans = { sono: 6, fadiga: 5, estresse: 4, motivacao: 7, dor: "Não" };
  await db.query("insert into checkins (id, consultancy_id, student_id, answers, flags, created_at) values ($1,$2,$3,$4::jsonb,$5::jsonb, now() - interval '2 days')", [uid(), adm, firstModel, JSON.stringify(ans), JSON.stringify(computeFlags(ans))]);

  console.log("Seed aplicado (dados fictícios). Senha de todos: " + PASSWORD);
  console.log("  Personal Alfa : personal.alfa@demo.test  (alunos: aluno1@demo.test, aluno2@demo.test)");
  console.log("  TESTE (dados de exemplo): login admin / senha admin  (6 alunos modelo, cobranças de 4 meses, despesas)");
  console.log("  Personal Beta : personal.beta@demo.test  (aluno: aluno3@demo.test)");
  console.log("  Aluno Um tem 6 semanas de histórico fictício (11 sessões), 2 avaliações, 2 check-ins (um com sinal de atenção) e uma conversa.");
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
