import { createServerFn } from "@tanstack/react-start";
import { eq, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./db";
import { sessions, siteAuth } from "./schema";
import {
  hashPassword,
  verifyPassword,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "./password.js";
import {
  createSession,
  destroySession,
  purgeExpiredSessions,
  readSession,
  requireSession,
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
/* changePassword                                                      */
/* ------------------------------------------------------------------ */

/**
 * Told to the caller verbatim. Unlike the login page, which deliberately says
 * nothing useful, someone already signed in has earned a straight answer about
 * which field they got wrong.
 */
const WRONG_CURRENT_PASSWORD = "Current password is incorrect.";

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password.").max(MAX_PASSWORD_LENGTH),
    newPassword: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
      .max(MAX_PASSWORD_LENGTH),
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    message: "The new password must be different from the current one.",
    path: ["newPassword"],
  });

/**
 * Changes the one shared password, for a user who already knows it.
 *
 * The caller keeps their session and every other session is destroyed: someone
 * changing the password usually means a device should stop having access, and
 * leaving the other browsers signed in would defeat the point. Signing the
 * caller out too would just be annoying.
 */
export const changePassword = createServerFn({ method: "POST" })
  .inputValidator((input: { currentPassword: string; newPassword: string }) =>
    changePasswordSchema.parse(input),
  )
  .handler(async ({ data }): Promise<SessionState> => {
    // Identifies the caller's own session row, which is the one to spare below.
    const session = await requireSession();
    const db = getDb();

    const [row] = await db
      .select({ passwordHash: siteAuth.passwordHash })
      .from(siteAuth)
      .where(eq(siteAuth.id, 1))
      .limit(1);

    if (!row) {
      throw new Error(
        "No password is set for this site yet. Set one locally with scripts/set-site-password.mjs.",
      );
    }

    if (!(await verifyPassword(data.currentPassword, row.passwordHash))) {
      throw new Error(WRONG_CURRENT_PASSWORD);
    }

    // Hashed before the transaction opens, not inside it: this is ~200ms of
    // pure CPU with no database effect, and holding a transaction (and its
    // pooled connection) open across it buys nothing. If hashing throws,
    // nothing has been written at all, which is the guarantee that matters.
    const passwordHash = await hashPassword(data.newPassword);

    await db.transaction(async (tx) => {
      await tx
        .update(siteAuth)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(siteAuth.id, 1));

      // Everything except the caller. If this fails the update rolls back with
      // it, so the site can never end up on a new password that nobody was told.
      await tx.delete(sessions).where(ne(sessions.id, session.id));
    });

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
