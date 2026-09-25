/**
 * Client-safe auth types and helpers.
 *
 * Everything that decides anything now lives server-side in `auth.server.ts`:
 * there is no longer a client-readable session value, no seeded user list and no
 * password anywhere in the bundle. This module holds only the shapes the UI
 * renders and the sentinel used to recognise an expired session.
 */

/** A name from the `operators` roster, as offered by the picker. */
export interface OperatorOption {
  id: number;
  displayName: string;
}

/**
 * What the server says about the current browser. `authenticated` means the
 * shared password was entered; `operator` is null until a name is picked, and
 * that gap is exactly what forces the picker screen.
 */
export interface SessionState {
  authenticated: boolean;
  operator: OperatorOption | null;
}

export const SIGNED_OUT: SessionState = { authenticated: false, operator: null };

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
