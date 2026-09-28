import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";
import { eq, lt, or, isNull } from "drizzle-orm";
import { getDb } from "./db";
import { sessions } from "./schema";
import { AUTH_ERROR_MESSAGE } from "./auth";

/**
 * SERVER ONLY. Session storage and the guard every data function runs.
 *
 * The browser holds one opaque random token in an httpOnly cookie; the
 * `sessions` row keyed by the SHA-256 of that token is what says the browser is
 * signed in. The client can present a session but can never describe one.
 *
 * A session carries no identity beyond "signed in". The `sessions.operator_id`
 * column still exists and is simply never read — rows written while the operator
 * picker existed keep their value and keep working unchanged.
 *
 * This replaces the Phase 0/1 demo auth, where a `dpas_auth` object in
 * localStorage was the entire proof of identity and could simply be typed into
 * the console.
 */

export const SESSION_COOKIE = "hl_session";

/** A clinic day plus slack. Sliding: activity pushes the expiry forward. */
const SESSION_TTL_SECONDS = 12 * 60 * 60;

/** Re-extend a session only once it is past halfway, to avoid a write per request. */
const RENEW_AFTER_SECONDS = SESSION_TTL_SECONDS / 2;

const TOKEN_BYTES = 32;

export interface ActiveSession {
  /** The stored id — the hash of the cookie token, never the token. */
  id: string;
}

export function unauthenticated(): Error {
  return new Error(AUTH_ERROR_MESSAGE);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Hashes the cookie token into the primary key. Only SHA-256 — this is not a
 * password: the token is 32 bytes of CSPRNG output, so there is nothing to
 * brute-force and no need for PBKDF2's cost here. Hashing is purely so that a
 * database dump yields no replayable cookies.
 */
async function tokenToId(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return toHex(new Uint8Array(digest));
}

function newToken(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
}

function expiryFromNow(): Date {
  return new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
}

function writeCookie(token: string): void {
  setCookie(SESSION_COOKIE, token, {
    httpOnly: true, // not readable by document.cookie, so no XSS can lift it
    sameSite: "lax",
    // Only over HTTPS in production; a secure cookie would never be stored by
    // the browser on the plain-http dev server.
    secure: import.meta.env.PROD,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

/** Starts a brand-new session. */
export async function createSession(): Promise<void> {
  const db = getDb();
  const token = newToken();

  await db.insert(sessions).values({
    id: await tokenToId(token),
    expiresAt: expiryFromNow(),
  });

  writeCookie(token);
}

/**
 * Resolves the cookie to a live session, or null. Expired rows are treated as
 * absent and deleted on sight, so a stale cookie can never be revived.
 */
export async function readSession(): Promise<ActiveSession | null> {
  const token = getCookie(SESSION_COOKIE);
  if (!token) return null;

  const db = getDb();
  const id = await tokenToId(token);

  // No join to `operators`: a session is valid on its own, so an old row that
  // still references an operator — or a deactivated one — is unaffected.
  const [row] = await db
    .select({
      id: sessions.id,
      expiresAt: sessions.expiresAt,
      lastSeenAt: sessions.lastSeenAt,
    })
    .from(sessions)
    .where(eq(sessions.id, id))
    .limit(1);

  if (!row) return null;

  if (row.expiresAt.getTime() <= Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, id));
    deleteCookie(SESSION_COOKIE, { path: "/" });
    return null;
  }

  // Sliding expiry: someone using the desk all day is never logged out
  // mid-shift, but an abandoned tablet still expires.
  const age = Date.now() - row.lastSeenAt.getTime();
  if (age > RENEW_AFTER_SECONDS * 1000) {
    await db
      .update(sessions)
      .set({ lastSeenAt: new Date(), expiresAt: expiryFromNow() })
      .where(eq(sessions.id, id));
    writeCookie(token);
  }

  return { id: row.id };
}

/** Every data function's front door: a live session, or a thrown auth error. */
export async function requireSession(): Promise<ActiveSession> {
  const session = await readSession();
  if (!session) throw unauthenticated();
  return session;
}

/** Destroys the session row and the cookie, so neither can be reused. */
export async function destroySession(): Promise<void> {
  const token = getCookie(SESSION_COOKIE);
  if (token) {
    await getDb().delete(sessions).where(eq(sessions.id, await tokenToId(token)));
  }
  deleteCookie(SESSION_COOKIE, { path: "/" });
}

/** Opportunistic housekeeping, called on login so nothing needs a scheduler. */
export async function purgeExpiredSessions(): Promise<void> {
  await getDb()
    .delete(sessions)
    .where(or(lt(sessions.expiresAt, new Date()), isNull(sessions.expiresAt)));
}
