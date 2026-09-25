import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Who recorded a visit — a plain roster of names, deliberately with no login
 * columns of its own. "Who is this" (this table) and "can this browser get in"
 * (`siteAuth` + `sessions`) are fully decoupled: everyone shares one password,
 * then picks their name from this list.
 */
export const operators = pgTable("operators", {
  id: serial("id").primaryKey(),
  displayName: text("display_name").notNull(),
  active: boolean("active").notNull().default(true),
});

/**
 * The one shared credential for the whole site. Exactly one row, id = 1, holding
 * a PBKDF2-SHA256 digest — never a plaintext password.
 *
 * Rows are written only by `scripts/set-site-password.mjs`, run locally by the
 * clinic owner. Nothing in the app, the seed script or any migration ever puts a
 * usable password here.
 */
export const siteAuth = pgTable(
  "site_auth",
  {
    id: integer("id").primaryKey().default(1),
    passwordHash: text("password_hash").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("site_auth_single_row", sql`${t.id} = 1`)],
);

/**
 * Server-stored sessions. The browser holds only an opaque random token in an
 * httpOnly cookie; `id` here is the SHA-256 of that token, so a leaked database
 * dump still contains nothing that can be replayed as a cookie.
 *
 * `operatorId` is the whole point of this table: the selected operator lives
 * server-side, so `recorded_by` cannot be influenced by anything the client
 * sends. It is null between signing in and picking a name.
 */
export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 (hex) of the cookie token — never the token itself. */
    id: text("id").primaryKey(),
    operatorId: integer("operator_id").references(() => operators.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("sessions_expires_at_idx").on(t.expiresAt)],
);

/**
 * One row per person. `phone` is UNIQUE — this is the server-enforced version of
 * the one-phone-one-person rule Phase 0.5 built client-side; a duplicate-phone
 * insert now fails at the database level even if the UI is bypassed.
 *
 * `code` is GENERATED ALWAYS ... STORED, so patient IDs are assigned atomically
 * by Postgres. This replaces the old client-side `getNextPatientId()` max+1,
 * which could collide under concurrent inserts.
 */
export const patients = pgTable("patients", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  code: text("code")
    .generatedAlwaysAs(sql`('PT-' || lpad(id::text, 6, '0'))`)
    .notNull()
    .unique(),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  address: text("address").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: text("created_by").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by").notNull(),
});

/**
 * One row per attendance — this is what the homepage table lists.
 * `visit_at` is a UTC instant; "today" is always computed in Asia/Dhaka.
 */
export const visits = pgTable(
  "visits",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    patientId: bigint("patient_id", { mode: "number" })
      .notNull()
      .references(() => patients.id),
    shift: text("shift").notNull(),
    visitAt: timestamp("visit_at", { withTimezone: true }).notNull().defaultNow(),
    /** Appointment fee only (800 new / 300 returning). Never includes medicine. */
    fee: integer("fee").notNull(),
    /** Weeks of medicine sold at this visit; 0 when none. */
    medicineWeeks: integer("medicine_weeks").notNull().default(0),
    /** Server-computed medicine charge. The total is fee + medicineFee, never stored. */
    medicineFee: integer("medicine_fee").notNull().default(0),
    isNewPatient: boolean("is_new_patient").notNull(),
    recordedBy: text("recorded_by").notNull(),
    voided: boolean("voided").notNull().default(false),
    voidReason: text("void_reason"),
    voidedBy: text("voided_by"),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("visits_visit_at_idx").on(t.visitAt),
    index("visits_patient_id_idx").on(t.patientId),
    check("visits_shift_check", sql`${t.shift} in ('morning', 'evening')`),
  ],
);

/** Append-only. Never updated, never deleted. */
export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  entity: text("entity").notNull(),
  entityId: bigint("entity_id", { mode: "number" }).notNull(),
  action: text("action").notNull(),
  actor: text("actor").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  before: jsonb("before"),
  after: jsonb("after"),
});

export type PatientRow = typeof patients.$inferSelect;
export type VisitRow = typeof visits.$inferSelect;
export type OperatorRow = typeof operators.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
