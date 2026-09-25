import { createServerFn } from "@tanstack/react-start";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./db";
import { operators, siteAuth } from "./schema";
import { verifyPassword } from "./password.js";
import {
  createSession,
  destroySession,
  purgeExpiredSessions,
  readSession,
  requireSession,
  setSessionOperator,
} from "./session.server";
import { SIGNED_OUT, type OperatorOption, type SessionState } from "./auth";

/**
 * The whole authentication surface. One shared password for the site, then a
 * per-session choice of which operator you are.
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
    if (!session) return SIGNED_OUT;
    return { authenticated: true, operator: session.operator };
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
    // A fresh session every time, with no operator attributed yet — that null is
    // what sends the user to the picker instead of the homepage.
    await createSession();

    return { authenticated: true, operator: null };
  });

/* ------------------------------------------------------------------ */
/* listOperators                                                       */
/* ------------------------------------------------------------------ */

/**
 * The picker's list. Behind the session check because the roster is staff
 * information: a signed-out visitor has no business enumerating clinic names.
 */
export const listOperators = createServerFn({ method: "POST" }).handler(
  async (): Promise<OperatorOption[]> => {
    await requireSession();

    const rows = await getDb()
      .select({ id: operators.id, displayName: operators.displayName })
      .from(operators)
      .where(eq(operators.active, true))
      .orderBy(asc(operators.id));

    return rows;
  },
);

/* ------------------------------------------------------------------ */
/* selectOperator / switchOperator                                     */
/* ------------------------------------------------------------------ */

const operatorInput = (input: { operatorId: number }) =>
  z.object({ operatorId: z.number().int().positive() }).parse(input);

/** First pick after signing in. Writes the choice into the session row. */
export const selectOperator = createServerFn({ method: "POST" })
  .inputValidator(operatorInput)
  .handler(async ({ data }): Promise<SessionState> => {
    const operator = await setSessionOperator(data.operatorId);
    return { authenticated: true, operator };
  });

/**
 * Shift handoff. Mechanically identical to `selectOperator` — same session-side
 * write, same validation — but callable at any time without re-entering the
 * shared password, which is the point: the evening receptionist takes over the
 * same tablet in one tap.
 */
export const switchOperator = createServerFn({ method: "POST" })
  .inputValidator(operatorInput)
  .handler(async ({ data }): Promise<SessionState> => {
    const operator = await setSessionOperator(data.operatorId);
    return { authenticated: true, operator };
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
