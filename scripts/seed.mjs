// Dev seed: operators + sample patients/visits spread across the last few
// Asia/Dhaka days, so both the today-view and the date picker show data.
//
//   bun run db:seed            (always refuses — see below)
//   bun run db:seed --force    (wipes EVERYTHING and inserts sample data)
//
// --force is required unconditionally, not just when data already exists. The
// earlier guard only tripped when `visits` was non-empty, which meant that on a
// freshly cleared database — exactly the state a clinic is in on day one — a
// stray `bun run db:seed` would silently fill it with fake patients. The cost of
// being wrong is far higher than the cost of typing a flag.
//
// Operators are sample NAMES only — the roster, nothing more. This script never
// touches `site_auth`, so it cannot create a usable shared password; that only
// ever happens via `node scripts/set-site-password.mjs`, run locally.

const force = process.argv.includes("--force");

if (!force) {
  console.error(
    [
      "",
      "Refusing to seed.",
      "",
      "This script is destructive: it DELETES every patient, visit, audit record",
      "and operator in the database, then inserts sample data in their place. It",
      "does this whether the database is full or empty, so there is no state in",
      "which running it by accident is harmless.",
      "",
      "If that is genuinely what you want:",
      "",
      "    bun run db:seed --force",
      "",
      "If this is the clinic's real database, you almost certainly do not.",
      "Take a backup first — the Export button in the app writes both CSV files.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

process.loadEnvFile();

const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);

const OPERATORS = ["Reception Desk", "Dr. Rahman", "Evening Desk"];

// Phase 0.5 gave every sample patient a unique phone — one phone, one person.
const PEOPLE = [
  ["Abdul Karim", "01711234567", "Dhanmondi, Dhaka"],
  ["Fatima Begum", "01812345678", "Mohammadpur, Dhaka"],
  ["Rahim Uddin", "01913456789", "Gulshan, Dhaka"],
  ["Sultana Parvin", "01514567890", "Banani, Dhaka"],
  ["Kamrul Hasan", "01615678901", "Uttara, Dhaka"],
  ["Nasrin Akter", "01716789012", "Mirpur, Dhaka"],
  ["Jamal Hossain", "01817890123", "Badda, Dhaka"],
  ["Tasnim Chowdhury", "01918901234", "Khilgaon, Dhaka"],
  ["Shahidul Islam", "01519012345", "Shyamoli, Dhaka"],
  ["Rubina Khatun", "01610123456", "Farmgate, Dhaka"],
  ["Mahmudur Rahman", "01721234501", "Lalmatia, Dhaka"],
  ["Momena Begum", "01822345602", "Mohammadpur, Dhaka"],
  ["Habibur Rahman", "01923456703", "Dhanmondi, Dhaka"],
  ["Shireen Akter", "01524567804", "Gulshan, Dhaka"],
  ["Tariqul Islam", "01625678905", "Banani, Dhaka"],
  ["Jahanara Begum", "01326789006", "Uttara, Dhaka"],
  ["Anisur Rahman", "01427890107", "Mirpur, Dhaka"],
  ["Dilara Hossain", "01528901208", "Badda, Dhaka"],
  ["Selim Reza", "01629012309", "Khilgaon, Dhaka"],
  ["Parvin Akter", "01330123410", "Shyamoli, Dhaka"],
];

// [personIndex, daysAgo, "HH:MM"] — Dhaka wall clock. Shift derives from the hour.
const ATTENDANCES = [
  // two days ago
  [0, 2, "09:20"], [1, 2, "10:05"], [2, 2, "11:40"], [3, 2, "17:30"], [4, 2, "18:50"],
  // yesterday
  [0, 1, "09:10"], [5, 1, "09:55"], [6, 1, "11:20"], [7, 1, "17:15"], [8, 1, "18:20"], [9, 1, "19:05"],
  // today
  [0, 0, "09:05"], [10, 0, "09:35"], [11, 0, "10:10"], [1, 0, "10:45"], [12, 0, "11:25"],
  [13, 0, "11:55"], [5, 0, "17:20"], [14, 0, "17:50"], [15, 0, "18:25"], [16, 0, "19:10"],
];

/** YYYY-MM-DD for the Dhaka calendar date `daysAgo` days back. */
function dhakaDate(daysAgo) {
  const d = new Date(Date.now() + 6 * 3600 * 1000);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

// --force was given, so this is going ahead. Say what is being destroyed first,
// so the number is on screen rather than only in the operator's assumptions.
const [existing] = await sql`select
  (select count(*) from visits)::int as visits,
  (select count(*) from patients)::int as patients,
  (select count(*) from audit_log)::int as audit_log`;
console.log(
  `--force given. Deleting ${existing.patients} patient(s), ${existing.visits} visit(s) ` +
    `and ${existing.audit_log} audit record(s), then inserting sample data.`,
);

console.log("Clearing existing data...");
// `sessions` is listed explicitly because it references operators: reseeding the
// roster invalidates any session pinned to an old operator id, so those browsers
// sign in again. `site_auth` is deliberately absent — the password survives.
await sql`truncate table audit_log, visits, patients, sessions, operators restart identity cascade`;

console.log("Inserting operators...");
for (const name of OPERATORS) {
  await sql`insert into operators (display_name) values (${name})`;
}

console.log("Inserting patients...");
const patientIds = [];
for (const [name, phone, address] of PEOPLE) {
  const [row] = await sql`
    insert into patients (name, phone, address, created_by, updated_by)
    values (${name}, ${phone}, ${address}, ${OPERATORS[0]}, ${OPERATORS[0]})
    returning id, code`;
  patientIds.push(row.id);
}

console.log("Inserting visits...");
const seenBefore = new Set();
// Oldest first, so "first visit ever" is correctly marked as the new-patient one.
const ordered = [...ATTENDANCES].sort(
  (a, b) => b[1] - a[1] || a[2].localeCompare(b[2]),
);

let inserted = 0;
for (const [personIndex, daysAgo, hhmm] of ordered) {
  const hour = Number(hhmm.slice(0, 2));
  const shift = hour < 13 ? "morning" : "evening";
  const isNew = !seenBefore.has(personIndex);
  seenBefore.add(personIndex);
  const recordedBy = shift === "morning" ? OPERATORS[0] : OPERATORS[2];
  const visitAt = `${dhakaDate(daysAgo)} ${hhmm}:00+06`;

  const [visit] = await sql`
    insert into visits (patient_id, shift, visit_at, fee, is_new_patient, recorded_by)
    values (${patientIds[personIndex]}, ${shift}, ${visitAt}::timestamptz,
            ${isNew ? 800 : 300}, ${isNew}, ${recordedBy})
    returning id`;
  await sql`
    insert into audit_log (entity, entity_id, action, actor)
    values ('visit', ${visit.id}, 'create', ${recordedBy})`;
  inserted++;
}

const summary = await sql`
  select ((visit_at at time zone 'Asia/Dhaka')::date)::text as day,
         count(*)::int as visits,
         sum(fee)::int as fees
  from visits group by 1 order by 1`;

console.log(`\nSeeded ${OPERATORS.length} operators, ${PEOPLE.length} patients, ${inserted} visits.`);
const [auth] = await sql`select count(*)::int as n from site_auth`;
console.log(
  auth.n > 0
    ? "Shared password: left untouched (still set)."
    : "Shared password: not set — run `node scripts/set-site-password.mjs` before signing in.",
);
for (const r of summary) {
  console.log(`  ${r.day}  ${r.visits} visits  ${r.fees} BDT`);
}
