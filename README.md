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

One shared password for the whole clinic, and nothing else. There is no
username, no per-person account and no name to choose — everyone who signs in is
the same user, and signing in lands straight on the homepage.

Sessions are rows in `sessions`, referenced by an opaque random token in an
httpOnly cookie. Logging out deletes the row, so the cookie cannot be replayed.
Every server function checks for a valid session before doing anything.

### Who visits are recorded under

Each visit stores a `recorded_by` value, decided server-side and never accepted
from the browser. With a single shared login there is no way to tell who was at
the desk, so every new row is stamped with one fixed name — `RECORDER_NAME` in
`src/lib/constants.ts`, currently "Clinic". Change it there and future rows
follow; rows already written keep the name they were stamped with, which is what
makes the trail worth keeping.

The value is stored but no longer displayed: it does not appear in the visit
table, the mobile cards or the printed report.

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
- One shared credential means there is no per-person accountability at all: the
  system can prove a visit was recorded, not who recorded it. Treat `audit_log`
  as a record of what happened, not of whom to hold responsible.
- There is no login rate limiting; PBKDF2's cost is the only brake on guessing.
  Choose a strong password accordingly.
