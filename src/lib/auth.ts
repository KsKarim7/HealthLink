/**
 * Client-safe auth types and helpers.
 *
 * Everything that decides anything now lives server-side in `auth.server.ts`:
 * there is no longer a client-readable session value, no seeded user list and no
 * password anywhere in the bundle. This module holds only the shapes the UI
 * renders and the sentinel used to recognise an expired session.
 */

/**
 * What the server says about the current browser, and the whole of it: everyone
 * who knows the shared password is the same user, so there is nothing else to
 * report. Signing in leads straight to the homepage.
 */
export interface SessionState {
  authenticated: boolean;
}

export const SIGNED_OUT: SessionState = { authenticated: false };

/**
 * Prefix on every "you are not signed in" error a server function throws. Server
 * function errors reach the client as a plain Error with the message preserved
 * and nothing else, so the code travels in the message itself.
 */
export const AUTH_ERROR_CODE = "HL_UNAUTHENTICATED";

export const AUTH_ERROR_MESSAGE = `${AUTH_ERROR_CODE}: Your session has ended. Please sign in again.`;

/** True when a rejected server call was rejected for lack of a valid session. */
export function isAuthError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return message.includes(AUTH_ERROR_CODE);
}

/** The same message without the machine-readable prefix, for display. */
export function authErrorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.replace(new RegExp(`^.*${AUTH_ERROR_CODE}:\\s*`), "").trim();
}
