import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { ensureOfficialMedia } from "./officialMedia";
import { MIGRATION_2_SQL, MIGRATION_3_SQL, MIGRATION_4_SQL, MIGRATION_5_SQL, MIGRATION_6_SQL, MIGRATION_7_SQL, MIGRATION_8_SQL, MIGRATION_9_SQL, MIGRATION_10_SQL, MIGRATION_11_SQL, MIGRATION_12_SQL, MIGRATION_13_SQL, OFFICIAL_EXERCISES, SCHEMA_SQL } from "./schema";

type G = typeof globalThis & { __fitDb?: Promise<PGlite> };

async function open(): Promise<PGlite> {
  // DB_DIR=memory -> banco em memória (testes). Padrão: pasta local ./data/pglite
  const dir = process.env.DB_DIR ?? "./data/pglite";
  const db = dir === "memory" ? new PGlite() : new PGlite(dir);
  await db.waitReady;
  await db.exec(SCHEMA_SQL);
  await db.exec(MIGRATION_2_SQL);
  await db.exec(MIGRATION_3_SQL);
  await db.exec(MIGRATION_4_SQL);
  await db.exec(MIGRATION_5_SQL);
  await db.exec(MIGRATION_6_SQL);
  await db.exec(MIGRATION_7_SQL);
  await db.exec(MIGRATION_8_SQL);
  await db.exec(MIGRATION_9_SQL);
  await db.exec(MIGRATION_10_SQL);
  await db.exec(MIGRATION_11_SQL);
  await db.exec(MIGRATION_12_SQL);
  await db.exec(MIGRATION_13_SQL);
  // Catálogo oficial: insere o que falta e mantém músculos atualizados (idempotente).
  for (const e of OFFICIAL_EXERCISES) {
    const found = await db.query(
      "select 1 from exercises where consultancy_id is null and name = $1", [e.name]);
    if (found.rows.length === 0) {
      await db.query(
        "insert into exercises (id, consultancy_id, name, muscle, equipment) values ($1, null, $2, $3, $4)",
        [randomUUID(), e.name, e.primary.join(" / "), e.equipment],
      );
    }
    await db.query(
      "update exercises set primary_muscles = $2::text[], secondary_muscles = $3::text[], muscle = $4 where consultancy_id is null and name = $1",
      [e.name, e.primary, e.secondary, e.primary.join(" / ")],
    );
  }
  // Animações oficiais (arte original em public/media/animations). Em memória (testes) não são registradas, para os testes controlarem a mídia.
  if (dir !== "memory") await ensureOfficialMedia(db);
  return db;
}

export function getDb(): Promise<PGlite> {
  const g = globalThis as G;
  if (!g.__fitDb) g.__fitDb = open();
  return g.__fitDb;
}

/** Apenas para testes: descarta o banco atual e abre outro. */
export function resetDb(): Promise<PGlite> {
  (globalThis as G).__fitDb = undefined;
  return getDb();
}

export type Db = PGlite;
