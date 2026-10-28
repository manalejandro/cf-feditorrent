/**
 * Password hashing (PBKDF2-HMAC-SHA256) and session management.
 *
 * Hash formats:
 * - Current: `pbkdf2$<iterations>$<saltHex>$<hashHex>` (600k iterations, OWASP).
 * - Legacy:  `<saltHex>:<hashHex>` (100k iterations) — still verified, and
 *   transparently upgraded on the next successful login via `needsRehash`.
 */

const PBKDF2_ITERATIONS = 600_000;
const LEGACY_ITERATIONS = 100_000;
const SESSION_DAYS = 30;
/** Reject absurd passwords early: PBKDF2 cost grows with input length. */
const MAX_PASSWORD_LENGTH = 1024;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Length-independent comparison (avoids leaking match length via timing). */
function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    256
  );
  return toHex(new Uint8Array(bits));
}

function parseStored(stored: string): { iterations: number; saltHex: string; hashHex: string } | null {
  if (stored.startsWith("pbkdf2$")) {
    const parts = stored.split("$");
    if (parts.length !== 4) return null;
    const iterations = Number(parts[1]);
    if (!Number.isInteger(iterations) || iterations < 1000) return null;
    return { iterations, saltHex: parts[2], hashHex: parts[3] };
  }
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return null;
  return { iterations: LEGACY_ITERATIONS, saltHex, hashHex };
}

function saltFromHex(saltHex: string): Uint8Array<ArrayBuffer> | null {
  if (saltHex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(saltHex)) return null;
  const salt = new Uint8Array(saltHex.length / 2);
  for (let i = 0; i < salt.length; i++) salt[i] = parseInt(saltHex.slice(i * 2, i * 2 + 2), 16);
  return salt;
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new Error("Password too long");
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hashHex = await derive(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${hashHex}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parseStored(stored);
  if (!parsed) return false;
  if (password.length > MAX_PASSWORD_LENGTH) return false;
  const salt = saltFromHex(parsed.saltHex);
  if (!salt) return false;
  const computed = await derive(password, salt, parsed.iterations);
  return constantTimeEqualHex(computed, parsed.hashHex.toLowerCase());
}

/** True when the stored hash uses a legacy format/work factor and should be upgraded. */
export function needsRehash(stored: string): boolean {
  const parsed = parseStored(stored);
  if (!parsed) return false;
  return !stored.startsWith("pbkdf2$") || parsed.iterations < PBKDF2_ITERATIONS;
}

export async function createSessionToken(
  db: D1Database,
  actorId: string,
  userId: string
): Promise<string> {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  await db
    .prepare(
      "INSERT INTO sessions (id, actor_id, user_id, token, created_at, expires_at) VALUES (?, ?, ?, ?, datetime('now'), datetime('now', ?))"
    )
    .bind(crypto.randomUUID(), actorId, userId, `+${SESSION_DAYS} days`)
    .run();
  return token;
}

export async function getSessionActor(
  db: D1Database,
  token: string
): Promise<{ id: string; username: string; domain: string } | null> {
  const row = await db
    .prepare(
      "SELECT a.id, a.username, a.domain FROM sessions s JOIN actors a ON a.id = s.actor_id WHERE s.token = ? AND (s.expires_at IS NULL OR s.expires_at > datetime('now'))"
    )
    .bind(token)
    .first() as { id: string; username: string; domain: string } | null;
  return row ?? null;
}

/** Revoke every session for an actor (password reset / compromise response). */
export async function deleteSessionsForActor(db: D1Database, actorId: string): Promise<void> {
  await db.prepare("DELETE FROM sessions WHERE actor_id = ?").bind(actorId).run();
}

/** Remove a single session by token (logout). */
export async function deleteSession(db: D1Database, token: string): Promise<void> {
  await db.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
}

/** Housekeeping: drop sessions that expired long ago. */
export async function purgeExpiredSessions(db: D1Database): Promise<void> {
  await db
    .prepare("DELETE FROM sessions WHERE expires_at IS NOT NULL AND expires_at < datetime('now', '-7 days')")
    .run();
}

export interface AuthSession {
  actorId: string;
  username: string;
  domain: string;
}
