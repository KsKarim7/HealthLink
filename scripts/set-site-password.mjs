/**
 * Sets (or resets) the ONE shared password for the site.
 *
 * Run locally, by the clinic owner, on their own machine:
 *
 *   node scripts/set-site-password.mjs              prompts twice, no echo
 *   node scripts/set-site-password.mjs --file       reads .site-password
 *   node scripts/set-site-password.mjs --file path  reads that file instead
 *
 * The password is never printed, never logged, never written to disk by this
 * script and never sent anywhere except as a PBKDF2 digest to your own database.
 * This is the recovery path: it runs locally, needs no current password, and so
 * is how you get back in if the shared password is forgotten. Day to day, the
 * signed-in Change password dialog in the app does the same job and does require
 * the current one.
 *
 * Changing the password signs every browser out, because every existing session
 * row is deleted.
 */
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
// Same module the app uses, so the two can never disagree about the hash format
// or the minimum length.
import { hashPassword, MIN_PASSWORD_LENGTH } from "../src/lib/password.js";

process.loadEnvFile();

const args = process.argv.slice(2);

function fail(message) {
  console.error(`\n${message}`);
  process.exit(1);
}

/** Reads a line without echoing it, so nothing appears on screen or in scrollback. */
function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // Swallow every echoed character after the prompt itself is drawn.
    let drawn = false;
    rl._writeToOutput = (chunk) => {
      if (!drawn) {
        rl.output.write(chunk);
        drawn = true;
      }
    };
    rl.question(question, (answer) => {
      rl.output.write("\n");
      rl.close();
      resolve(answer);
    });
  });
}

async function readPassword() {
  const fileFlagIndex = args.findIndex((a) => a === "--file");

  if (fileFlagIndex !== -1) {
    const path = args[fileFlagIndex + 1] ?? ".site-password";
    let contents;
    try {
      contents = readFileSync(path, "utf8");
    } catch {
      fail(`Could not read ${path}. Create it with the new password as its only line.`);
    }
    // Only the first line, trimmed of the trailing newline an editor adds.
    const password = contents.split(/\r?\n/)[0];
    if (!password) fail(`${path} is empty.`);
    console.log(`Read the new password from ${path} (its contents are never displayed).`);
    console.log(`Remember to delete ${path} when you are done — it is gitignored, not encrypted.`);
    return password;
  }

  if (!process.stdin.isTTY) {
    fail(
      "No terminal available for a hidden prompt.\n" +
        "Put the password in a local file and run: node scripts/set-site-password.mjs --file",
    );
  }

  const first = await promptHidden("New shared password (not shown): ");
  const second = await promptHidden("Type it again to confirm: ");
  if (first !== second) fail("The two entries did not match. Nothing was changed.");
  return first;
}

const password = await readPassword();

if (password.length < MIN_PASSWORD_LENGTH) {
  fail(`Too short — use at least ${MIN_PASSWORD_LENGTH} characters. Nothing was changed.`);
}

console.log("Hashing (this takes a moment by design)…");
const passwordHash = await hashPassword(password);

const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);

await sql`
  insert into site_auth (id, password_hash, updated_at)
  values (1, ${passwordHash}, now())
  on conflict (id) do update
    set password_hash = excluded.password_hash,
        updated_at = now()`;

// A password change must not leave old browsers signed in.
const cleared = await sql`delete from sessions returning id`;

console.log("\nShared password updated.");
console.log(`Signed out ${cleared.length} active session(s).`);
console.log("Everyone signs in again with the new password.");
