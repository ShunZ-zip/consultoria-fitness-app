import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import type { Db } from "./db";

export type Role = "trainer" | "student";
export interface Actor {
  userId: string;
  name: string;
  email: string;
  consultancyId: string;
  role: Role;
}

export const SESSION_COOKIE = "sid";
const SESSION_DAYS = 14;

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt);
  return `${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, keyHex] = stored.split(":");
  if (!saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = await scryptAsync(password, Buffer.from(saltHex, "hex"));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Tokens (sessão e convite) são guardados apenas como hash. */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(db: Db, userId: string): Promise<string> {
  const token = newToken();
  await db.query(
    "insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + ($3 || ' days')::interval)",
    [sha256(token), userId, String(SESSION_DAYS)],
  );
  return token;
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export async function getActor(db: Db, req: Request): Promise<Actor | null> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const { rows } = await db.query<{
    user_id: string; name: string; email: string; consultancy_id: string; role: Role;
  }>(
    `select u.id as user_id, u.name, u.email, m.consultancy_id, m.role
       from sessions s
       join users u on u.id = s.user_id
       join memberships m on m.user_id = u.id
      where s.token_hash = $1 and s.expires_at > now()`,
    [sha256(token)],
  );
  const r = rows[0];
  if (!r) return null;
  return { userId: r.user_id, name: r.name, email: r.email, consultancyId: r.consultancy_id, role: r.role };
}

export function sessionCookie(token: string, maxAgeDays = SESSION_DAYS): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeDays * 86400}${secure}`;
}

export const clearCookie = `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

export const uid = () => randomUUID();
