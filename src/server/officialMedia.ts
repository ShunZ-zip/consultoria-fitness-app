// Animações 3D oficiais dos exercícios do catálogo: arte ORIGINAL do projeto (src/lib/exercise3d.ts + src/components/Exercise3D.tsx).
// Aqui só registramos cada exercício como mídia oficial com url "3d:<slug>" (idempotente), e migramos registros antigos em SVG 2D.
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { has3D, modelUrl } from "../lib/exercise3d";
import { REFERENCE_VIDEOS, youtubeWatchUrl } from "../lib/referenceVideos";
import { OFFICIAL_EXERCISES } from "./schema";

export const MEDIA_LICENSE = "Animação 3D original do projeto (gerada por código); sem material de terceiros";

/** Garante uma animação 3D oficial para cada exercício do catálogo que ainda não tem uma. Devolve quantas criou ou migrou. */
export async function ensureOfficialMedia(db: PGlite): Promise<number> {
  let changed = 0;
  for (const e of OFFICIAL_EXERCISES) {
    if (!has3D(e.name)) continue;
    const ex = await db.query<{ id: string }>("select id from exercises where consultancy_id is null and name = $1", [e.name]);
    if (!ex.rows[0]) continue;
    const has = await db.query<{ id: string; url: string }>("select id, url from exercise_media where exercise_id = $1 and consultancy_id is null and kind = 'animation'", [ex.rows[0].id]);
    if (has.rows.length) {
      // migra o que era 2D (SVG de versões anteriores) para o modelo 3D
      const old = has.rows.filter((r) => !r.url.startsWith("3d:"));
      for (const r of old) { await db.query("update exercise_media set title = $2, url = $3, license = $4 where id = $1", [r.id, `${e.name} (animação 3D)`, modelUrl(e.name), MEDIA_LICENSE]); changed++; }
      continue;
    }
    await db.query("insert into exercise_media (id, exercise_id, consultancy_id, kind, title, url, license) values ($1,$2,null,'animation',$3,$4,$5)",
      [randomUUID(), ex.rows[0].id, `${e.name} (animação 3D)`, modelUrl(e.name), MEDIA_LICENSE]);
    changed++;
  }
  // Vídeos de referência (animações 3D no YouTube, de terceiros, com crédito ao canal). Primeiro sai o que não está mais na lista
  // (ex.: os vídeos da lista anterior), depois entra o que falta: uma linha por exercício, sem repetir.
  const current = Object.values(REFERENCE_VIDEOS).map((v) => youtubeWatchUrl(v.id));
  const removed = await db.query("delete from exercise_media where consultancy_id is null and kind = 'video' and not (url = any($1::text[])) returning id", [current]);
  changed += removed.rows.length;
  for (const [name, v] of Object.entries(REFERENCE_VIDEOS)) {
    const ex = await db.query<{ id: string }>("select id from exercises where consultancy_id is null and name = $1", [name]);
    if (!ex.rows[0]) continue;
    const url = youtubeWatchUrl(v.id);
    const has = await db.query("select 1 from exercise_media where exercise_id = $1 and consultancy_id is null and url = $2", [ex.rows[0].id, url]);
    if (has.rows.length) continue;
    await db.query("insert into exercise_media (id, exercise_id, consultancy_id, kind, title, url, license) values ($1,$2,null,'video',$3,$4,$5)",
      [randomUUID(), ex.rows[0].id, v.title, url, `Vídeo de terceiros: ${v.author} (YouTube), exibido por incorporação com crédito ao canal`]);
    changed++;
  }
  return changed;
}
