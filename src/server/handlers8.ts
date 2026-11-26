// Seletor de exercícios do editor: favoritos e presets de séries do personal.
// Favoritos são por usuário; presets são da consultoria. Aluno não acessa (403); exercício de outra consultoria = 404.
import { z } from "zod";
import { APP_PRESETS } from "../lib/setPresets";
import { uid } from "./auth";
import { audit, setInput } from "./handlers";
import { body, HttpError, json, notFound, requireActor, route } from "./http";

const uuid = z.string().uuid();

export const listFavorites = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const { rows } = await ctx.db.query<{ exercise_id: string }>(
    `select f.exercise_id from exercise_favorites f join exercises e on e.id = f.exercise_id
      where f.user_id = $1 and (e.consultancy_id is null or e.consultancy_id = $2)`, [a.userId, a.consultancyId]);
  return json(rows.map((r) => r.exercise_id));
});

export const setFavorite = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  if (!uuid.safeParse(ctx.params.id).success) notFound();
  const input = await body(ctx, z.object({ favorite: z.boolean() }));
  const ex = await ctx.db.query("select 1 from exercises where id = $1 and (consultancy_id is null or consultancy_id = $2)", [ctx.params.id, a.consultancyId]);
  if (!ex.rows.length) notFound();
  if (input.favorite) {
    await ctx.db.query("insert into exercise_favorites (user_id, exercise_id) values ($1,$2) on conflict do nothing", [a.userId, ctx.params.id]);
  } else {
    await ctx.db.query("delete from exercise_favorites where user_id = $1 and exercise_id = $2", [a.userId, ctx.params.id]);
  }
  return json({ favorite: input.favorite });
});

const presetInput = z.object({ name: z.string().trim().min(1).max(60), sets: z.array(setInput).min(1).max(12) });

export const listSetPresets = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const { rows } = await ctx.db.query(
    "select id, name, sets from set_presets where consultancy_id = $1 order by lower(name)", [a.consultancyId]);
  return json({ mine: rows, app: APP_PRESETS });
});

export const createSetPreset = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  const input = await body(ctx, presetInput);
  const dup = await ctx.db.query("select 1 from set_presets where consultancy_id = $1 and lower(name) = lower($2)", [a.consultancyId, input.name]);
  if (dup.rows.length || APP_PRESETS.some((p) => p.name.toLowerCase() === input.name.toLowerCase())) throw new HttpError(409, "Já existe um preset com este nome");
  const id = uid();
  await ctx.db.query("insert into set_presets (id, consultancy_id, name, sets, created_by) values ($1,$2,$3,$4::jsonb,$5)",
    [id, a.consultancyId, input.name, JSON.stringify(input.sets), a.userId]);
  await audit(ctx.db, a, "preset.create", { id, name: input.name });
  return json({ id, name: input.name, sets: input.sets }, 201);
});

export const deleteSetPreset = route(async (ctx) => {
  const a = await requireActor(ctx, "trainer");
  if (!uuid.safeParse(ctx.params.id).success) notFound();
  const r = await ctx.db.query("delete from set_presets where id = $1 and consultancy_id = $2 returning name", [ctx.params.id, a.consultancyId]);
  if (!r.rows.length) notFound();
  await audit(ctx.db, a, "preset.delete", { id: ctx.params.id });
  return json({ ok: true });
});
