import { createServerFn } from "@tanstack/react-start";
import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./db";
import { auditLog, operators, patients, visits } from "./schema";
import { FEES, MEDICINE, PHONE_INVALID_MESSAGE, PHONE_REGEX } from "./constants";
import {
  CLINIC_TZ,
  computeMedicineFee,
  todayInClinicTz,
  type DayTotals,
  type PatientIdentity,
  type Shift,
  type Visit,
  type VisitPage,
} from "./types";

const PAGE_SIZE = 10;

const phoneSchema = z.string().regex(PHONE_REGEX, PHONE_INVALID_MESSAGE);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

/**
 * Raw input only. zod strips unknown keys, so a client that tampers with the
 * payload and sends `fee` or `patientId` has those silently discarded — the
 * server is the only thing that decides them.
 */
const draftSchema = z.object({
  phone: phoneSchema,
  name: z.string().trim().min(2),
  address: z.string().trim().min(2),
  shift: z.enum(["morning", "evening"]),
  // A week count, not money. Any client-sent fee is dropped by this parse.
  medicineWeeks: z.number().int().min(0).max(MEDICINE.maxWeeks).optional(),
});

/** Matches a visit's Asia/Dhaka calendar date, independent of the viewer's timezone. */
function onClinicDate(date: string): SQL {
  return sql`(${visits.visitAt} AT TIME ZONE ${CLINIC_TZ})::date = ${date}::date`;
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
  recordedBy: string;
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
    recordedBy: row.recordedBy,
  };
}

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
/* createVisit                                                         */
/* ------------------------------------------------------------------ */

/**
 * The authoritative write. Everything below happens in one transaction:
 * resolve/insert the person, persist any identity edit, insert the visit, and
 * append the audit rows.
 *
 * Fee, patient code, is_new_patient and visit_at are all decided here — this is
 * the single place they are assigned (the Phase 0 invariant, moved server-side).
 */
export const createVisit = createServerFn({ method: "POST" })
  .inputValidator((input: { draft: unknown; operatorId: number }) =>
    z.object({ draft: draftSchema, operatorId: z.number().int().positive() }).parse(input),
  )
  .handler(async ({ data }): Promise<Visit> => {
    const { draft, operatorId } = data;
    const db = getDb();

    return db.transaction(async (tx) => {
      const [operator] = await tx
        .select()
        .from(operators)
        .where(and(eq(operators.id, operatorId), eq(operators.active, true)))
        .limit(1);
      if (!operator) {
        throw new Error(`Unknown or inactive operator: ${operatorId}`);
      }
      const actor = operator.displayName;

      let patient = (
        await tx.select().from(patients).where(eq(patients.phone, draft.phone)).limit(1)
      )[0];
      let isNewPatient = false;

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
          isNewPatient = true;
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

      // Identity edits persist forward: a corrected name/address at the desk
      // becomes the patient's record, so their next visit auto-fills with it.
      if (!isNewPatient && (patient.name !== draft.name || patient.address !== draft.address)) {
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
          // Appointment fee: unchanged, computed exactly as before.
          fee: isNewPatient ? FEES.newPatient : FEES.existingPatient,
          // Medicine: recomputed here from the raw week count. A new patient's
          // first week is free; a returning patient pays for every week.
          medicineWeeks,
          medicineFee: computeMedicineFee(medicineWeeks, isNewPatient),
          isNewPatient,
          recordedBy: actor,
        })
        .returning();

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
        name: patient.name,
        phone: patient.phone,
        address: patient.address,
        shift: visit.shift,
        fee: visit.fee,
        medicineWeeks: visit.medicineWeeks,
        medicineFee: visit.medicineFee,
        isNewPatient: visit.isNewPatient,
        visitAt: visit.visitAt,
        recordedBy: visit.recordedBy,
      });
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
    const db = getDb();
    const date = data.date ?? todayInClinicTz();
    const pageSize = data.pageSize ?? PAGE_SIZE;
    const search = data.search?.trim();

    const filters: (SQL | undefined)[] = [eq(visits.voided, false)];

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
      .select({
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
        recordedBy: visits.recordedBy,
      })
      .from(visits)
      .innerJoin(patients, eq(visits.patientId, patients.id))
      .where(where)
      .orderBy(desc(visits.visitAt))
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
    z.object({ date: dateSchema.optional() }).parse(input ?? {}),
  )
  .handler(async ({ data }): Promise<Visit[]> => {
    const db = getDb();
    const date = data.date ?? todayInClinicTz();

    const rows = await db
      .select({
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
        recordedBy: visits.recordedBy,
      })
      .from(visits)
      .innerJoin(patients, eq(visits.patientId, patients.id))
      .where(and(eq(visits.voided, false), onClinicDate(date)))
      .orderBy(asc(visits.visitAt))
      .limit(REPORT_MAX_ROWS);

    return rows.map(toVisit);
  });

/* ------------------------------------------------------------------ */
/* getDayTotals                                                        */
/* ------------------------------------------------------------------ */

export const getDayTotals = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ date: dateSchema.optional() }).parse(input ?? {}),
  )
  .handler(async ({ data }): Promise<DayTotals> => {
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

    const totals: DayTotals = {
      date,
      all: { patients: 0, fees: 0 },
      morning: { patients: 0, fees: 0 },
      evening: { patients: 0, fees: 0 },
      newPatients: 0,
      returningPatients: 0,
    };

    for (const row of grouped) {
      const bucket = row.shift === "morning" ? totals.morning : totals.evening;
      bucket.patients += row.patients;
      bucket.fees += row.fees;
      totals.all.patients += row.patients;
      totals.all.fees += row.fees;
      if (row.isNewPatient) totals.newPatients += row.patients;
      else totals.returningPatients += row.patients;
    }

    return totals;
  });
