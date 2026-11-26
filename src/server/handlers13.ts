// Perfil cadastral do aluno (nascimento, WhatsApp, gênero): dado pessoal; só o personal da consultoria lê e edita
// (aluno de outra consultoria ou id inválido = 404; aluno = 403).
import { z } from "zod";
import { dayKey } from "../lib/engagement";
import { ageOn, cleanProfile, formatPhone, genderLabel, whatsappLink } from "../lib/studentProfile";
import type { Db } from "./db";
import { assertStudent, audit } from "./handlers";
import { body, HttpError, json, notFound, requireActor, route } from "./http";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function read(db: Db, consultancyId: string, studentId: string) {
  const r = (await db.query<{ birth_date: string | null; phone: string | null; gender: string | null }>(
    "select birth_date, phone, gender from student_profiles where user_id = $1 and consultancy_id = $2", [studentId, consultancyId])).rows[0];
  const today = dayKey(new Date());
  return {
    birthDate: r?.birth_date ?? null, age: r?.birth_date ? ageOn(r.birth_date, today) : null,
    phone: r?.phone ?? null, phoneText: r?.phone ? formatPhone(r.phone) : null, whatsappUrl: r?.phone ? whatsappLink(r.phone) : null,
    gender: r?.gender ?? null, genderText: genderLabel(r?.gender),
  };
}

export const getStudentProfile = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  if (!UUID.test(ctx.params.id)) notFound();
  await assertStudent(ctx.db, a, ctx.params.id);
  return json(await read(ctx.db, a.consultancyId, ctx.params.id));
});

export const updateStudentProfile = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  if (!UUID.test(ctx.params.id)) notFound();
  await assertStudent(ctx.db, a, ctx.params.id);
  const input = await body(ctx, z.object({ birthDate: z.string().nullish(), phone: z.string().max(40).nullish(), gender: z.string().max(20).nullish() }));
  const prof = cleanProfile(input, dayKey(new Date()));
  if ("error" in prof) throw new HttpError(400, prof.error);
  await ctx.db.query(
    `insert into student_profiles (user_id, consultancy_id, birth_date, phone, gender) values ($1,$2,$3,$4,$5)
     on conflict (user_id) do update set birth_date = excluded.birth_date, phone = excluded.phone, gender = excluded.gender, updated_at = now()`,
    [ctx.params.id, a.consultancyId, prof.data.birthDate, prof.data.phone, prof.data.gender]);
  await audit(ctx.db, a, "student.profile_update", { studentId: ctx.params.id });
  return json(await read(ctx.db, a.consultancyId, ctx.params.id));
});
