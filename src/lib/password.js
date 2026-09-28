/**
 * Password hashing for the one shared site credential.
 *
 * PBKDF2-HMAC-SHA256 through the Web Crypto API (`crypto.subtle`) and nothing
 * else. Deliberately zero dependencies and zero native bindings: Cloudflare
 * Workers has no Node `crypto` module and cannot load a `.node` binary, so the
 * usual `bcrypt` package would break the production build exactly the way
 * `node-pg` would have in Phase 1. `crypto.subtle` is native in Workers, in Node
 * 18+ and in browsers, so the same code runs in the app and in the local
 * password-setup script.
 *
 * Plain JavaScript (not TypeScript) on purpose: `scripts/set-site-password.mjs`
 * imports this file directly under bare `node`, so hashing lives in exactly one
 * place instead of being duplicated between the app and the script.
 *
 * Stored format — self-describing, so the parameters can be raised later without
 * invalidating existing hashes:
 *
 *     pbkdf2-sha256$<iterations>$<salt base64>$<derived key base64>
 */

/**
 * OWASP's current floor for PBKDF2-HMAC-SHA256. Costs roughly 200ms of CPU per
 * verification, which is the point — it is what makes offline cracking of a
 * leaked hash expensive.
 *
 * Verification reads the iteration count out of the stored string, so changing
 * this constant only affects passwords set from then on; existing hashes keep
 * working. Lower it only if the deployment platform's CPU budget forces it.
 */
export const PBKDF2_ITERATIONS = 600_000;

/**
 * Minimum length for the shared password, in one place.
 *
 * Both routes to setting it — the in-app Change password dialog and
 * `scripts/set-site-password.mjs` — import this, so the recovery script can
 * never accept something the app would refuse, or the reverse.
 */
export const MIN_PASSWORD_LENGTH = 10;

/**
 * Upper bound. Nothing needs a password this long, and every candidate costs a
 * full PBKDF2 derivation, so an unbounded field is a free way to make the
 * server burn CPU. Checked before any hashing happens.
 */
export const MAX_PASSWORD_LENGTH = 200;

const KEY_BITS = 256;
const SALT_BYTES = 16;
const PREFIX = "pbkdf2-sha256";

/** @returns {Crypto} */
function webcrypto() {
  const c = globalThis.crypto;
  if (!c?.subtle) {
    throw new Error("Web Crypto (crypto.subtle) is unavailable in this runtime.");
  }
  return c;
}

/** @param {Uint8Array} bytes */
function toBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** @param {string} value @returns {Uint8Array} */
function fromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * @param {string} password
 * @param {Uint8Array} salt
 * @param {number} iterations
 * @returns {Promise<Uint8Array>}
 */
async function derive(password, salt, iterations) {
  const crypto = webcrypto();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

/**
 * Hashes a password with a fresh random salt.
 *
 * @param {string} password
 * @param {number} [iterations]
 * @returns {Promise<string>} the encoded hash, safe to store
 */
export async function hashPassword(password, iterations = PBKDF2_ITERATIONS) {
  const salt = webcrypto().getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await derive(password, salt, iterations);
  return `${PREFIX}$${iterations}$${toBase64(salt)}$${toBase64(derived)}`;
}

/**
 * Constant-time byte comparison. A plain `===` on the base64 strings would leak
 * how many leading bytes matched through its early exit.
 *
 * @param {Uint8Array} a
 * @param {Uint8Array} b
 */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Verifies a candidate password against a stored hash. Returns false rather than
 * throwing for a malformed or empty stored value, so a site with no password set
 * simply refuses every login.
 *
 * @param {string} password
 * @param {string | null | undefined} stored
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, stored) {
  if (typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== PREFIX) return false;

  const iterations = Number.parseInt(parts[1], 10);
  if (!Number.isInteger(iterations) || iterations < 1) return false;

  try {
    const salt = fromBase64(parts[2]);
    const expected = fromBase64(parts[3]);
    const actual = await derive(password, salt, iterations);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
