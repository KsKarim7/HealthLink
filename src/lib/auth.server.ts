import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./db";
import { siteAuth } from "./schema";
import { verifyPassword } from "./password.js";
import {
  createSession,
  destroySession,
  purgeExpiredSessions,
  readSession,
} from "./session.server";
import { SIGNED_OUT, type SessionState } from "./auth";

/**
 * The whole authentication surface: one shared password, and nothing else.
 * Signing in is the only identity step there is.
 *
 * Every function here is POST, including the read: an auth answer must never be
 * served from a cache, and a POST body keeps it out of URLs and access logs.
 */

/**
 * A stored hash for a password nobody knows — 32 bytes of noise, not the digest
 * of any string. When `site_auth` is empty, login still spends the full PBKDF2
 * cost against this, so "no password configured yet" and "wrong password" are
 * indistinguishable from the outside, by both response and timing.
 */
const ABSENT_PASSWORD_HASH =
  "pbkdf2-sha256$600000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

/* ------------------------------------------------------------------ */
/* getSessionState                                                     */
/* ------------------------------------------------------------------ */

/**
 * What this browser currently is. The client stores nothing itself — this call
 * is the only way the UI learns it is signed in, which is why a hand-written
 * localStorage entry can no longer fake a login.
 */
export const getSessionState = createServerFn({ method: "POST" }).handler(
  async (): Promise<SessionState> => {
    const session = await readSession();
    return session ? { authenticated: true } : SIGNED_OUT;
  },
);

/* ------------------------------------------------------------------ */
/* login                                                               */
/* ------------------------------------------------------------------ */

export const login = createServerFn({ method: "POST" })
  .inputValidator((input: { password: string }) =>
    z.object({ password: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }): Promise<SessionState> => {
    const db = getDb();

    const [row] = await db
      .select({ passwordHash: siteAuth.passwordHash })
      .from(siteAuth)
      .where(eq(siteAuth.id, 1))
      .limit(1);

    const ok = await verifyPassword(data.password, row?.passwordHash ?? ABSENT_PASSWORD_HASH);

    if (!row) {
      // Server-side only. The client is told nothing beyond "incorrect".
      console.warn(
        "Login attempted but no shared password is set. Run: node scripts/set-site-password.mjs",
      );
    }

    if (!ok) {
      throw new Error("Incorrect password.");
    }

    await purgeExpiredSessions();
    await createSession();

    return { authenticated: true };
  });

/* ------------------------------------------------------------------ */
/* logout                                                              */
/* ------------------------------------------------------------------ */

/** Ends everything: the session row is deleted, so the cookie is inert too. */
export const logout = createServerFn({ method: "POST" }).handler(
  async (): Promise<SessionState> => {
    await destroySession();
    return SIGNED_OUT;
  },
);
