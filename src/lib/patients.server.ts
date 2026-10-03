import { createServerFn } from "@tanstack/react-start";
import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./db";
import { requireSession } from "./session.server";
import { auditLog, patients, visits } from "./schema";
import {
  BACKDATED_SHIFT_TIME,
  FEES,
  MEDICINE,
  PHONE_INVALID_MESSAGE,
  PHONE_REGEX,
  RECORDER_NAME,
} from "./constants";
import {
  CLINIC_TZ,
  computeMedicineFee,
  todayInClinicTz,
  type DayTotals,
  type ExportResult,
  type PatientExportRow,
  type PatientIdentity,
  type Shift,
  type ShiftTotals,
  type Visit,
  type VisitPage,
} from "./types";

const PAGE_SIZE = 10;

/**
 * Every function in this file starts with a session check.
 *
 * The redirect to /login is a convenience for the person at the desk, not a
 * protection: these endpoints are reachable directly over HTTP, so the guard has
 * to live here. Reads and writes alike require nothing more than a valid
 * session, since the site has a single shared login.
 */

const phoneSchema = z.string().regex(PHONE_REGEX, PHONE_INVALID_MESSAGE);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

/**
 * The regex admits impossible dates like 2026-02-31, which Postgres would
 * reject far downstream with an unhelpful error. Round-tripping through Date
 * catches them here instead.
 */
function isRealCalendarDate(value: string): boolean {
  const [y, m, d] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  return (
    parsed.getUTCFullYear() === y && parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d
  );
}

const calendarDateSchema = dateSchema.refine(isRealCalendarDate, "That date does not exist.");

/**
 * Raw input only. zod strips unknown keys, so a client that tampers with the
 * payload and sends `fee` or `patientId` has those silently discarded — the
 * server is the only thing that decides them.
 *
 * `asOldPatient` and `visitDate` are the one exception to "the client decides
 * nothing", and deliberately narrow ones: the first picks between two outcomes
 * the server defines, and the second is a calendar date the server turns into
 * an instant itself. Neither can name an amount.
 */
const draftSchema = z
  .object({
    phone: phoneSchema,
    name: z.string().trim().min(2),
    address: z.string().trim().min(2),
    shift: z.enum(["morning", "evening"]),
    // A week count, not money. Any client-sent fee is dropped by this parse.
    medicineWeeks: z.number().int().min(0).max(MEDICINE.maxWeeks).optional(),
    /** Bill an unrecognised phone as returning instead of new. */
    asOldPatient: z.boolean().optional(),
    /** Only meaningful alongside asOldPatient — see the refinement below. */
    visitDate: calendarDateSchema.optional(),
  })
  .refine((d) => !d.visitDate || d.asOldPatient === true, {
    // Backdating is a property of the old-patient flow. Allowing it on the
    // regular path would let the everyday dialog rewrite history by accident.
    message: "A visit date can only be set when adding an old patient.",
    path: ["visitDate"],
  });

/** Matches a visit's Asia/Dhaka calendar date, independent of the viewer's timezone. */
function onClinicDate(date: string): SQL {
  return sql`(${visits.visitAt} AT TIME ZONE ${CLINIC_TZ})::date = ${date}::date`;
}

/**
 * The instant a backdated visit is filed under: the chosen calendar date at the
 * shift's nominal hour, read as Asia/Dhaka wall-clock time.
 *
 * Built by Postgres rather than in JS so it goes through the same timezone
 * database as every query that reads it back, instead of assuming a fixed +06
 * offset that would be wrong for any historical period where it differed.
 */
function clinicInstant(date: string, shift: Shift): SQL {
  const stamp = `${date} ${BACKDATED_SHIFT_TIME[shift]}:00`;
  return sql`(${stamp}::timestamp AT TIME ZONE ${CLINIC_TZ})`;
}

/** Visits on or after an Asia/Dhaka calendar date (inclusive). */
function fromClinicDate(date: string): SQL {
  return sql`(${visits.visitAt} AT TIME ZONE ${CLINIC_TZ})::date >= ${date}::date`;
}

/** Visits on or before an Asia/Dhaka calendar date (inclusive). */
function toClinicDate(date: string): SQL {
  return sql`(${visits.visitAt} AT TIME ZONE ${CLINIC_TZ})::date <= ${date}::date`;
}

function toVisit(row: {
  id: number;
  code: string;
  name: string;
  phone: string;
  address: string;
  shift: string;
  fee: number;
  medicineWeeks: number;
  medicineFee: number;
  isNewPatient: boolean;
  visitAt: Date;
  legacyEntry: boolean;
  backdated: boolean;
  createdAt: Date;
  recordedBy: string;
  voided: boolean;
  voidReason: string | null;
  voidedBy: string | null;
  voidedAt: Date | null;
}): Visit {
  return {
    id: row.id,
    patientId: row.code,
    name: row.name,
    phone: row.phone,
    address: row.address,
    shift: row.shift as Shift,
    fee: row.fee,
    medicineWeeks: row.medicineWeeks,
    medicineFee: row.medicineFee,
    isNewPatient: row.isNewPatient,
    visitAt: row.visitAt.toISOString(),
    legacyEntry: row.legacyEntry,
    backdated: row.backdated,
    createdAt: row.createdAt.toISOString(),
    recordedBy: row.recordedBy,
    voided: row.voided,
    voidReason: row.voidReason,
    voidedBy: row.voidedBy,
    voidedAt: row.voidedAt ? row.voidedAt.toISOString() : null,
  };
}

/** The row shape every list query selects — kept in one place so the table, the
 *  report and the write path can never drift into returning different fields. */
const visitColumns = {
  id: visits.id,
  code: patients.code,
  name: patients.name,
  phone: patients.phone,
  address: patients.address,
  shift: visits.shift,
  fee: visits.fee,
  medicineWeeks: visits.medicineWeeks,
  medicineFee: visits.medicineFee,
  isNewPatient: visits.isNewPatient,
  visitAt: visits.visitAt,
  legacyEntry: visits.legacyEntry,
  backdated: visits.backdated,
  createdAt: visits.createdAt,
  recordedBy: visits.recordedBy,
  voided: visits.voided,
  voidReason: visits.voidReason,
  voidedBy: visits.voidedBy,
  voidedAt: visits.voidedAt,
} as const;

/* ------------------------------------------------------------------ */
/* lookupByPhone                                                       */
/* ------------------------------------------------------------------ */

/**
 * One phone = one person, so this returns at most one row — now guaranteed by a
 * UNIQUE constraint rather than by client-side convention.
 */
export const lookupByPhone = createServerFn({ method: "GET" })
  .inputValidator((input: { phone: string }) => z.object({ phone: phoneSchema }).parse(input))
  .handler(async ({ data }): Promise<PatientIdentity | null> => {
    await requireSession();
    const db = getDb();
    const [row] = await db
      .select({
        id: patients.id,
        code: patients.code,
        name: patients.name,
        phone: patients.phone,
        address: patients.address,
      })
      .from(patients)
      .where(eq(patients.phone, data.phone))
      .limit(1);
    return row ?? null;
  });

/* ------------------------------------------------------------------ */
/* lookupByCode                                                        */
/* ------------------------------------------------------------------ */

/**
 * Turns whatever the operator typed into the canonical `code` value.
 *
 * `patients.code` is generated as 'PT-' || lpad(id, 6, '0'), so the only thing
 * that actually varies is the number. People read an ID off a card and type it
 * back in any of the shapes they remember it — "42", "000042", "pt-000042",
 * with stray spaces — and all of those name the same patient. Anything that is
 * not a prefix plus digits yields null, and a null simply finds nobody.
 */
function normalizeCode(input: string): string | null {
  const cleaned = input.trim().toUpperCase().replace(/\s+/g, "");
  if (!cleaned) return null;

  // An optional "PT" with an optional separator, then the digits.
  const match = /^(?:PT[-\s]?)?(\d+)$/.exec(cleaned);
  if (!match) return null;

  // Leading zeros are decoration: strip them, then pad back to the stored width.
  // lpad only pads, so an id past six digits keeps its natural length.
  const digits = match[1].replace(/^0+/, "");
  if (!digits) return null;

  return `PT-${digits.padStart(6, "0")}`;
}

/**
 * Finds a patient by their printed ID — a convenience shortcut for the desk, not
 * a second identity path. It only reads; everything that follows a match is
 * driven by the phone number it fills in, exactly as if that had been typed.
 */
export const lookupByCode = createServerFn({ method: "GET" })
  .inputValidator((input: { code: string }) =>
    z.object({ code: z.string().max(40) }).parse(input),
  )
  .handler(async ({ data }): Promise<PatientIdentity | null> => {
    await requireSession();

    const code = normalizeCode(data.code);
    if (!code) return null;

    const [row] = await getDb()
      .select({
        id: patients.id,
        code: patients.code,
        name: patients.name,
        phone: patients.phone,
        address: patients.address,
      })
      .from(patients)
      .where(eq(patients.code, code))
      .limit(1);

    return row ?? null;
  });

/* ------------------------------------------------------------------ */
/* createVisit                                                         */
/* ------------------------------------------------------------------ */

/**
 * The authoritative write. Everything below happens in one transaction:
 * resolve/insert the person, persist any identity edit, insert the visit, and
 * append the audit rows.
 *
 * Fee, patient code, is_new_patient and visit_at are all decided here — this is
 * the single place they are assigned (the Phase 0 invariant, moved server-side).
 *
 * `recorded_by` is in that list too. It is the fixed RECORDER_NAME, written
 * here rather than taken from the request: the payload has no field for it, and
 * zod drops anything extra, so there is nothing a tampered client could send
 * that would change what a visit is attributed to.
 *
 * "Add Old Patients" adds one branch and changes nothing else. It answers a
 * single question differently — whether a phone the clinic has never recorded
 * belongs to a new patient or to someone treated for years before this system
 * existed — and that answer feeds the same fee rules as always.
 */
export const createVisit = createServerFn({ method: "POST" })
  .inputValidator((input: { draft: unknown }) => z.object({ draft: draftSchema }).parse(input))
  .handler(async ({ data }): Promise<Visit> => {
    const { draft } = data;
    const asOldPatient = draft.asOldPatient === true;
    await requireSession();
    // One shared login means one attribution. Decided here, never sent.
    const actor = RECORDER_NAME;
    const db = getDb();

    // Resolve the date before opening the transaction: a rejected date should
    // never have started one. Comparing YYYY-MM-DD strings is a correct date
    // comparison, and "today" is the clinic's today, not the browser's.
    const today = todayInClinicTz();
    let backdated = false;
    let visitAt: SQL | undefined;

    if (draft.visitDate) {
      if (draft.visitDate > today) {
        throw new Error("A visit cannot be recorded for a future date.");
      }
      if (draft.visitDate < today) {
        // Earlier than today: file it under that day at the shift's nominal hour.
        backdated = true;
        visitAt = clinicInstant(draft.visitDate, draft.shift);
      }
      // Exactly today is treated as no date at all: the real clock time is
      // better than a nominal one, and the row is not historical.
    }

    return db.transaction(async (tx) => {
      let patient = (
        await tx.select().from(patients).where(eq(patients.phone, draft.phone)).limit(1)
      )[0];
      // Distinct from `isNewPatient`, which is a billing verdict: this records
      // whether THIS request created the patient row.
      let createdNow = false;

      if (!patient) {
        // onConflictDoNothing rather than a bare insert: if a concurrent submit
        // claimed this phone between the select above and here, we get no row
        // back instead of a unique-violation that would poison the transaction.
        const [inserted] = await tx
          .insert(patients)
          .values({
            name: draft.name,
            phone: draft.phone,
            address: draft.address,
            createdBy: actor,
            updatedBy: actor,
          })
          .onConflictDoNothing({ target: patients.phone })
          .returning();

        if (inserted) {
          patient = inserted;
          createdNow = true;
          await tx.insert(auditLog).values({
            entity: "patient",
            entityId: patient.id,
            action: "create",
            actor,
            after: patient,
          });
        } else {
          // Lost the race — the phone now belongs to someone. Treat as returning.
          patient = (
            await tx.select().from(patients).where(eq(patients.phone, draft.phone)).limit(1)
          )[0];
          if (!patient) {
            throw new Error("Could not resolve patient for phone " + draft.phone);
          }
        }
      }

      /**
       * The billing verdict, and the only place it is decided.
       *
       * A phone already on file is always a returning patient, whatever the
       * request asks for — so "Add Old Patients" can never create a second
       * record for someone, nor downgrade a known patient's history. Only a
       * genuinely unrecognised phone is affected by the flag, and then only to
       * choose between two rules the server already owned.
       */
      const isNewPatient = createdNow && !asOldPatient;
      // The one case that is true: a record created now, billed as returning.
      const legacyEntry = createdNow && asOldPatient;

      // Identity edits persist forward: a corrected name/address at the desk
      // becomes the patient's record, so their next visit auto-fills with it.
      //
      // Except when backdating. An old visit carries old details, and letting it
      // write them back would silently undo a more recent correction — the last
      // entry typed would win over the most recently true. Differences in a
      // backdated request are therefore ignored outright, including ones a
      // tampered client sends deliberately.
      if (
        !createdNow &&
        !backdated &&
        (patient.name !== draft.name || patient.address !== draft.address)
      ) {
        const before = patient;
        const [updated] = await tx
          .update(patients)
          .set({
            name: draft.name,
            address: draft.address,
            updatedAt: new Date(),
            updatedBy: actor,
          })
          .where(eq(patients.id, patient.id))
          .returning();
        patient = updated;
        await tx.insert(auditLog).values({
          entity: "patient",
          entityId: patient.id,
          action: "update",
          actor,
          before,
          after: updated,
        });
      }

      const medicineWeeks = draft.medicineWeeks ?? 0;

      const [visit] = await tx
        .insert(visits)
        .values({
          patientId: patient.id,
          shift: draft.shift,
          // Appointment fee: unchanged, computed exactly as before. An old
          // patient reaches this as isNewPatient === false, so they pay ৳300
          // through the existing rule rather than through a second one.
          fee: isNewPatient ? FEES.newPatient : FEES.existingPatient,
          // Medicine: recomputed here from the raw week count. A new patient's
          // first week is free; a returning patient — including an old one —
          // pays for every week.
          medicineWeeks,
          medicineFee: computeMedicineFee(medicineWeeks, isNewPatient),
          isNewPatient,
          legacyEntry,
          backdated,
          // Left unset for a normal visit so the column default (now()) applies.
          ...(visitAt ? { visitAt } : {}),
          recordedBy: actor,
        })
        .returning();

      // `after` is the stored row, so legacy_entry, backdated and visit_at are
      // all captured. `at` defaults to now() — the real entry time, which stays
      // truthful even when visit_at points at a past day.
      await tx.insert(auditLog).values({
        entity: "visit",
        entityId: visit.id,
        action: "create",
        actor,
        after: visit,
      });

      return toVisit({
        id: visit.id,
        code: patient.code,
        // The stored patient, never the submitted draft — so a backdated entry
        // reports the details actually on file.
        name: patient.name,
        phone: patient.phone,
        address: patient.address,
        shift: visit.shift,
        fee: visit.fee,
        medicineWeeks: visit.medicineWeeks,
        medicineFee: visit.medicineFee,
        isNewPatient: visit.isNewPatient,
        visitAt: visit.visitAt,
        legacyEntry: visit.legacyEntry,
        backdated: visit.backdated,
        createdAt: visit.createdAt,
        recordedBy: visit.recordedBy,
        // A brand-new visit is never voided, but these come from the stored row
        // rather than being assumed, like every other field here.
        voided: visit.voided,
        voidReason: visit.voidReason,
        voidedBy: visit.voidedBy,
        voidedAt: visit.voidedAt,
      });
    });
  });

/* ------------------------------------------------------------------ */
/* voidVisit                                                           */
/* ------------------------------------------------------------------ */

/**
 * Strikes one visit from the record.
 *
 * Nothing is deleted: the row stays, flagged, with the reason and the moment it
 * happened, and every list, total and report simply stops counting it. That is
 * what makes this safe to expose at the desk — a mistake costs a row that can
 * still be read back, not a row that is gone.
 *
 * There is deliberately no un-void. A visit voided by mistake is corrected by
 * recording the correct visit, which leaves both facts visible in order rather
 * than quietly rewriting one of them.
 *
 * Touches the visit row and nothing else — the patient's name, address and code
 * are not part of this operation and are never written here.
 */
export const voidVisit = createServerFn({ method: "POST" })
  .inputValidator((input: { visitId: number; reason: string }) =>
    z
      .object({
        visitId: z.number().int().positive(),
        // Trimmed before the length check, so whitespace cannot pass as a
        // reason. A void with no stated cause is exactly what this prevents.
        reason: z
          .string()
          .trim()
          .min(1, "Give a reason for voiding this visit.")
          .max(500, "Keep the reason under 500 characters."),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<Visit> => {
    await requireSession();
    const db = getDb();

    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(visits)
        .where(eq(visits.id, data.visitId))
        .limit(1);

      if (!existing) throw new Error("That visit no longer exists.");
      if (existing.voided) throw new Error("This visit has already been voided.");

      // The `voided = false` in the WHERE is the real guard: if a concurrent
      // request voided this visit between the select above and here, no row
      // comes back and we report it as already voided instead of overwriting
      // the first void's reason and timestamp.
      const [updated] = await tx
        .update(visits)
        .set({
          voided: true,
          voidReason: data.reason,
          voidedBy: RECORDER_NAME,
          voidedAt: new Date(),
        })
        .where(and(eq(visits.id, data.visitId), eq(visits.voided, false)))
        .returning();

      if (!updated) throw new Error("This visit has already been voided.");

      await tx.insert(auditLog).values({
        entity: "visit",
        entityId: updated.id,
        action: "void",
        actor: RECORDER_NAME,
        before: existing,
        after: updated,
      });

      const [row] = await tx
        .select(visitColumns)
        .from(visits)
        .innerJoin(patients, eq(visits.patientId, patients.id))
        .where(eq(visits.id, updated.id))
        .limit(1);

      return toVisit(row);
    });
  });

/* ------------------------------------------------------------------ */
/* listVisits                                                          */
/* ------------------------------------------------------------------ */

const listVisitsSchema = z.object({
  date: dateSchema.optional(),
  /** List every date instead of one day. The shift filter still applies. */
  allDates: z.boolean().optional(),
  shift: z.enum(["morning", "evening"]).optional(),
  search: z.string().optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(100).optional(),
  /**
   * Include voided visits as well. Off unless asked for: a voided visit is not
   * part of the day's work, so it must not turn up in the ordinary view.
   */
  includeVoided: z.boolean().optional(),
});

/**
 * Three scopes, most-recent-first and paginated in all of them:
 * - `search` set  → every visit ever recorded matching the term; date AND shift
 *                   are ignored, so a patient seen on another day is still found.
 * - `allDates`    → every date, shift filter honored.
 * - otherwise     → one Asia/Dhaka date (default today), shift filter honored.
 *
 * Voided visits are excluded everywhere — here and in getDayTotals.
 */
export const listVisits = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => listVisitsSchema.parse(input ?? {}))
  .handler(async ({ data }): Promise<VisitPage> => {
    await requireSession();
    const db = getDb();
    const date = data.date ?? todayInClinicTz();
    const pageSize = data.pageSize ?? PAGE_SIZE;
    const search = data.search?.trim();

    // The default, and the reason the feature works at all: a voided visit
    // vanishes from the list the moment it is voided.
    const filters: (SQL | undefined)[] = data.includeVoided ? [] : [eq(visits.voided, false)];

    if (!search) {
      if (!data.allDates) filters.push(onClinicDate(date));
      if (data.shift) filters.push(eq(visits.shift, data.shift));
    } else {
      const term = `%${search}%`;
      filters.push(
        or(
          ilike(patients.name, term),
          ilike(patients.phone, term),
          ilike(patients.code, term),
          ilike(patients.address, term),
        ),
      );
    }

    const where = and(...filters);

    const [{ value: total }] = await db
      .select({ value: count() })
      .from(visits)
      .innerJoin(patients, eq(visits.patientId, patients.id))
      .where(where);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(Math.max(1, data.page ?? 1), totalPages);

    const rows = await db
      .select(visitColumns)
      .from(visits)
      .innerJoin(patients, eq(visits.patientId, patients.id))
      .where(where)
      // Backdated rows share an identical nominal visit_at whenever two land on
      // the same date and shift, so id breaks the tie. Without it the database
      // is free to return them in a different order on each page load, which
      // can drop or repeat a row across pagination boundaries.
      .orderBy(desc(visits.visitAt), desc(visits.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return { rows: rows.map(toVisit), total, totalPages, page };
  });

/* ------------------------------------------------------------------ */
/* listDayVisits                                                       */
/* ------------------------------------------------------------------ */

/** Safety valve so a pathological day cannot pull unbounded rows into memory. */
const REPORT_MAX_ROWS = 2000;

/**
 * Every visit for one Asia/Dhaka date, unpaginated and across BOTH shifts —
 * the printable day report always covers the whole day, independent of whatever
 * shift tab or page the screen happens to be on.
 *
 * Ordered oldest-first: on paper the day reads in the order it happened.
 */
export const listDayVisits = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z
      .object({ date: dateSchema.optional(), includeVoided: z.boolean().optional() })
      .parse(input ?? {}),
  )
  .handler(async ({ data }): Promise<Visit[]> => {
    await requireSession();
    const db = getDb();
    const date = data.date ?? todayInClinicTz();

    const rows = await db
      .select(visitColumns)
      .from(visits)
      .innerJoin(patients, eq(visits.patientId, patients.id))
      // The printable report never passes includeVoided, so paper always shows
      // the day as it actually stands.
      .where(
        data.includeVoided
          ? onClinicDate(date)
          : and(eq(visits.voided, false), onClinicDate(date)),
      )
      // id breaks ties between backdated rows sharing a nominal time, so the
      // printed report lists them in a stable, repeatable order.
      .orderBy(asc(visits.visitAt), asc(visits.id))
      .limit(REPORT_MAX_ROWS);

    return rows.map(toVisit);
  });

/* ------------------------------------------------------------------ */
/* exportVisits / exportPatients                                       */
/* ------------------------------------------------------------------ */

/**
 * Safety valve. Far above anything this clinic will produce for years, but it
 * stops a runaway query pulling the whole table into memory — and when it does
 * bite, the caller is told rather than handed a quietly short file.
 */
const EXPORT_MAX_ROWS = 50_000;

/**
 * Every visit, for backup and record-keeping. Read-only: it writes nothing,
 * and is the one listing that deliberately INCLUDES voided rows — a backup that
 * silently drops records is not a backup. The void columns travel with them, so
 * a voided visit is identifiable in the file rather than invisible.
 *
 * `from`/`to` bound an inclusive Asia/Dhaka date range, matching how every other
 * date filter in this file reads a visit's day.
 */
export const exportVisits = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z
      .object({ from: dateSchema.optional(), to: dateSchema.optional() })
      .parse(input ?? {}),
  )
  .handler(async ({ data }): Promise<ExportResult<Visit>> => {
    await requireSession();

    const filters: SQL[] = [];
    if (data.from) filters.push(fromClinicDate(data.from));
    if (data.to) filters.push(toClinicDate(data.to));

    // One row past the cap, purely to detect that the cap was reached.
    const rows = await getDb()
      .select(visitColumns)
      .from(visits)
      .innerJoin(patients, eq(visits.patientId, patients.id))
      .where(filters.length ? and(...filters) : undefined)
      // Same ordering rule as the other listings: backdated rows share a nominal
      // visit_at, so id keeps the file stable between exports.
      .orderBy(asc(visits.visitAt), asc(visits.id))
      .limit(EXPORT_MAX_ROWS + 1);

    const truncated = rows.length > EXPORT_MAX_ROWS;
    return {
      rows: (truncated ? rows.slice(0, EXPORT_MAX_ROWS) : rows).map(toVisit),
      truncated,
    };
  });

/** Every patient record — the people, not their visits. Read-only. */
export const exportPatients = createServerFn({ method: "GET" }).handler(
  async (): Promise<ExportResult<PatientExportRow>> => {
    await requireSession();

    const rows = await getDb()
      .select({
        code: patients.code,
        name: patients.name,
        phone: patients.phone,
        address: patients.address,
        createdAt: patients.createdAt,
        updatedAt: patients.updatedAt,
      })
      .from(patients)
      .orderBy(asc(patients.id))
      .limit(EXPORT_MAX_ROWS + 1);

    const truncated = rows.length > EXPORT_MAX_ROWS;
    const kept = truncated ? rows.slice(0, EXPORT_MAX_ROWS) : rows;

    return {
      rows: kept.map((r) => ({
        code: r.code,
        name: r.name,
        phone: r.phone,
        address: r.address,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      truncated,
    };
  },
);

/* ------------------------------------------------------------------ */
/* getDayTotals                                                        */
/* ------------------------------------------------------------------ */

export const getDayTotals = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ date: dateSchema.optional() }).parse(input ?? {}),
  )
  .handler(async ({ data }): Promise<DayTotals> => {
    await requireSession();
    const db = getDb();
    const date = data.date ?? todayInClinicTz();

    const grouped = await db
      .select({
        shift: visits.shift,
        isNewPatient: visits.isNewPatient,
        patients: count(),
        // Real money collected: appointment + medicine.
        fees: sql<number>`coalesce(sum(${visits.fee} + ${visits.medicineFee}), 0)::int`,
      })
      .from(visits)
      .where(and(eq(visits.voided, false), onClinicDate(date)))
      .groupBy(visits.shift, visits.isNewPatient);

    const emptyShift = (): ShiftTotals => ({
      patients: 0,
      fees: 0,
      newPatients: 0,
      returningPatients: 0,
    });

    const totals: DayTotals = {
      date,
      all: emptyShift(),
      morning: emptyShift(),
      evening: emptyShift(),
      newPatients: 0,
      returningPatients: 0,
    };

    // The query already groups by shift AND is_new_patient, so the per-shift
    // new/returning split is free here — it just used to be collapsed away.
    for (const row of grouped) {
      const bucket = row.shift === "morning" ? totals.morning : totals.evening;
      for (const target of [bucket, totals.all]) {
        target.patients += row.patients;
        target.fees += row.fees;
        if (row.isNewPatient) target.newPatients += row.patients;
        else target.returningPatients += row.patients;
      }
      if (row.isNewPatient) totals.newPatients += row.patients;
      else totals.returningPatients += row.patients;
    }

    return totals;
  });
