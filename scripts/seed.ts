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
      await db.query("insert into workout_logs (id, student_id, version_id, started_at, finished_at) values ($1,$2,$3,$4,$5)", [logId, studentId, versionId, at, new Date(at.getTime() + 3600000)]);
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

  // Entrega 4: animação oficial de demonstração (fictícia), avaliações, check-ins e conversa do Aluno Um.
  await db.query("insert into exercise_media (id, exercise_id, consultancy_id, kind, title, url, license) values ($1,$2,null,'animation','Supino reto (demonstração fictícia)','/media/supino-demo.svg','Arte própria do projeto, fictícia')", [uid(), supino]);

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

  console.log("Seed aplicado (dados fictícios). Senha de todos: " + PASSWORD);
  console.log("  Personal Alfa : personal.alfa@demo.test  (alunos: aluno1@demo.test, aluno2@demo.test)");
  console.log("  Personal Beta : personal.beta@demo.test  (aluno: aluno3@demo.test)");
  console.log("  Aluno Um tem 6 semanas de histórico fictício (11 sessões), 2 avaliações, 2 check-ins (um com sinal de atenção) e uma conversa.");
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
