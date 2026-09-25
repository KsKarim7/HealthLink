import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";
import { and, eq, lt, or, isNull } from "drizzle-orm";
import { getDb } from "./db";
import { operators, sessions } from "./schema";
import { AUTH_ERROR_MESSAGE, type OperatorOption } from "./auth";

/**
 * SERVER ONLY. Session storage and the guards every data function runs.
 *
 * The browser holds one opaque random token in an httpOnly cookie. Everything
 * that matters — whether this browser is signed in, and which operator it is
 * acting as — lives in the `sessions` row keyed by the SHA-256 of that token.
 * The client can therefore present a session but can never describe one, which
 * is what lets `recorded_by` be trusted.
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
  operator: OperatorOption | null;
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

/** Starts a brand-new session with no operator attributed yet. */
export async function createSession(): Promise<void> {
  const db = getDb();
  const token = newToken();

  await db.insert(sessions).values({
    id: await tokenToId(token),
    operatorId: null,
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

  const [row] = await db
    .select({
      id: sessions.id,
      operatorId: sessions.operatorId,
      expiresAt: sessions.expiresAt,
      lastSeenAt: sessions.lastSeenAt,
      operatorName: operators.displayName,
      operatorActive: operators.active,
    })
    .from(sessions)
    .leftJoin(operators, eq(sessions.operatorId, operators.id))
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

  // An operator deactivated mid-session stops being a valid attribution, so the
  // picker is shown again rather than silently recording a retired name.
  const operator =
    row.operatorId !== null && row.operatorName !== null && row.operatorActive
      ? { id: row.operatorId, displayName: row.operatorName }
      : null;

  return { id: row.id, operator };
}

/** Every data function's front door: a live session, or a thrown auth error. */
export async function requireSession(): Promise<ActiveSession> {
  const session = await readSession();
  if (!session) throw unauthenticated();
  return session;
}

/**
 * For writes. Returns the operator recorded IN THE SESSION — the only accepted
 * source for `recorded_by`. Nothing the client sends is consulted.
 */
export async function requireOperator(): Promise<OperatorOption> {
  const session = await requireSession();
  if (!session.operator) {
    throw new Error("Pick your name before recording anything.");
  }
  return session.operator;
}

/**
 * Writes the operator choice into the session row. Shared by `selectOperator`
 * and `switchOperator` — a shift handoff is the same operation as the first
 * pick, just without a fresh login.
 */
export async function setSessionOperator(operatorId: number): Promise<OperatorOption> {
  const session = await requireSession();
  const db = getDb();

  const [operator] = await db
    .select()
    .from(operators)
    .where(and(eq(operators.id, operatorId), eq(operators.active, true)))
    .limit(1);

  if (!operator) throw new Error("That name is not on the operator list.");

  await db
    .update(sessions)
    .set({ operatorId: operator.id, lastSeenAt: new Date() })
    .where(eq(sessions.id, session.id));

  return { id: operator.id, displayName: operator.displayName };
}

/** Destroys the session row and the cookie: both the login and the operator. */
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
