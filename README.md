# HealthLink — Doctor-Patient Accountability System

Clinic front-desk tool for recording patient visits: automatic new/returning
detection by phone number, morning/evening shifts, server-computed fees, and a
printable day report.

## Stack

- **App:** TanStack Start (React 19 + Vite, SSR) with TypeScript
- **UI:** Tailwind CSS v4 + shadcn/ui components
- **Data:** Neon Postgres via Drizzle ORM, reached only through server functions
- **Deploy target:** Cloudflare Workers (Nitro `cloudflare-module` preset)

There is no separate backend service. Everything server-side lives in
`src/lib/*.server.ts` as TanStack Start server functions.

## Quick start

### Prerequisites

- Bun (or Node 20+)
- A Neon Postgres database

### 1. Configure

```bash
cp .env.example .env    # then paste your Neon connection string as DATABASE_URL
bun install
```

### 2. Create the schema

```bash
bun run db:migrate      # applies drizzle/*.sql
bun run db:seed         # sample operators, patients and visits (dev only)
```

### 3. Set the shared password

The site has **one shared password** for everyone. It is never in the repo, the
seed data or any migration — you set it yourself, locally:

```bash
node scripts/set-site-password.mjs
```

It prompts twice without echoing, hashes with PBKDF2-SHA256, and stores only the
digest. Run the same command any time to change it; doing so signs every browser
out. See [Authentication](#authentication) below.

### 4. Run

```bash
bun run dev             # http://localhost:8080
bun run build           # production build into .output/
```

## Authentication

Two separate questions, deliberately decoupled:

| Question | Answered by | Stored in |
|---|---|---|
| Can this browser get in? | the one shared password | `site_auth` (a PBKDF2 digest) |
| Who is at the desk? | the operator picker | the server-side session row |

After signing in you pick your name from the `operators` roster before you can
do anything else. That choice is written into the session **on the server**, and
it is the only source of a visit's `recorded_by` — nothing the browser sends can
influence it. A "Switch" control in the navbar hands the desk over to the next
shift without re-entering the password.

Sessions are rows in `sessions`, referenced by an opaque random token in an
httpOnly cookie. Logging out deletes the row, so the cookie cannot be replayed.

### Managing operators

The roster is plain data — add, rename or deactivate rows in the `operators`
table. Operators have no passwords of their own; setting `active = false`
removes a name from the picker and ends any session using it.

## Features

- Automatic new (৳800) vs returning (৳300) detection, matched by phone
- One phone = one person, enforced by a UNIQUE constraint
- Weeks of medicine at ৳300/week, with the first week free for new patients
- Morning/Evening shift filter, date picker, and an all-dates view
- Search across every visit ever recorded, independent of date and shift
- Printable day report covering both shifts of the selected day
- Server-side fee computation, atomic patient ID generation, Asia/Dhaka timezone
- Append-only `audit_log` for every patient and visit write
- Responsive: table (md+), cards (mobile), Dialog/Drawer for Add Patient

## Security notes

- `DATABASE_URL` and the shared password live outside the repo. `.env` and
  `.site-password` are gitignored; never commit either.
- Password hashing is PBKDF2-HMAC-SHA256 (600,000 iterations) via the Web Crypto
  API, chosen so the production build has no Node-only or native dependency.
- Every server function rejects calls without a valid session, so the redirect to
  `/login` is convenience rather than the actual protection.
- One shared credential means no per-person accountability at the login layer —
  attribution comes from the operator picker, which is cooperative, not enforced.
  There is also no login rate limiting; PBKDF2's cost is the only brake on
  guessing. Choose a strong password accordingly.
