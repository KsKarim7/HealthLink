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
 * Cost of one hash, sized to Cloudflare Workers' free-tier CPU budget rather
 * than to maximum strength.
 *
 * The free plan allows roughly 10ms of CPU for an entire request — routing,
 * session lookup, response, everything — and exceeding it fails the request
 * outright rather than merely running slowly. So the hash has to fit in a
 * fraction of that, not most of it.
 *
 * Measured here (40 samples each, median / p95, Node 22 Web Crypto):
 *
 *     600,000   223ms / 255ms   OWASP's floor — ~22x the whole budget
 *     100,000    37ms /  39ms   still ~4x over
 *      25,000     9ms /  10ms   eats the entire budget
 *      15,000     5.2ms / 5.8ms  no headroom left
 *      12,000     4.3ms / 6.0ms  <- chosen
 *      10,000     3.6ms / 4.7ms  cheaper than it needs to be
 *
 * 12,000 lands at about 4-5ms, leaving over half the budget for the rest of the
 * request. Cloudflare's edge hardware may well be slower than the machine this
 * was measured on, which is the other reason not to aim near the ceiling.
 *
 * What this trades away, stated plainly: an attacker holding the stored hash can
 * test candidate passwords roughly 50x faster than at the OWASP figure. With one
 * shared credential and no rate limiting, the password's own length is doing
 * most of the work here regardless — choose a long one.
 *
 * The stored format carries its own iteration count, so this is safe to change:
 * hashes written at 600,000 keep verifying at 600,000 until that password is
 * next set, and only new hashes use the value below.
 */
export const PBKDF2_ITERATIONS = 12_000;

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
