import { FEES, MEDICINE, PHONE_REGEX, SHIFT_OPTIONS, type Shift } from "./constants";

// `Shift` is declared once, in constants.ts, derived from SHIFT_OPTIONS.
// Re-exported here so `@/lib/types` stays the single import path for domain types.
export type { Shift };

/** The clinic operates on Asia/Dhaka wall-clock time regardless of viewer locale. */
export const CLINIC_TZ = "Asia/Dhaka";

/** One person. Identity is keyed by phone (unique in the database). */
export interface PatientIdentity {
  id: number;
  /** DB-generated, e.g. "PT-000124". */
  code: string;
  name: string;
  phone: string;
  address: string;
}

/** One attendance — a row in the homepage visit log. */
export interface Visit {
  id: number;
  /** The patient's permanent code, e.g. "PT-000124". */
  patientId: string;
  name: string;
  phone: string;
  address: string;
  shift: Shift;
  /** Appointment fee only. Use `totalCharged` for what the patient actually paid. */
  fee: number;
  medicineWeeks: number;
  medicineFee: number;
  isNewPatient: boolean;
  /** UTC instant, ISO string. Rendered in Asia/Dhaka. Nominal when `backdated`. */
  visitAt: string;
  /** This visit registered a new patient but billed them as returning. */
  legacyEntry: boolean;
  /** `visitAt` was chosen by the operator, not taken from the clock. */
  backdated: boolean;
  /** When the row was actually entered. Always real, even for backdated rows. */
  createdAt: string;
  /** Operator display name — the accountability stamp. */
  recordedBy: string;
  /**
   * Struck from the record. Voided visits are excluded from every count, total
   * and report; they are only ever listed when explicitly asked for.
   */
  voided: boolean;
  /** Why it was voided. Always present on a voided row — it is required. */
  voidReason: string | null;
  voidedBy: string | null;
  /** ISO instant, rendered in Asia/Dhaka. */
  voidedAt: string | null;
}

export interface User {
  id: string;
  username: string;
  role: "doctor" | "receptionist";
}

export interface PatientFormData {
  phone: string;
  name: string;
  address: string;
  shift: Shift;
  /** 0 = no medicine this visit. */
  medicineWeeks: number;
}

/**
 * What the Add Patient form sends to the server. Raw input only — the phone
 * alone determines identity, and the server assigns code, fee, isNewPatient and
 * the timestamp. A client-sent fee is ignored (stripped by the zod parse).
 *
 * The two extras below are requests, not instructions: the server decides what
 * they mean, and rejects them outright in combinations it does not allow.
 */
export type VisitDraft = PatientFormData & {
  /** Bill an unknown phone as a returning patient ("Add Old Patients"). */
  asOldPatient?: boolean;
  /** A calendar date, YYYY-MM-DD. Never a timestamp — the server builds the
   *  instant from it in Asia/Dhaka, so browser time cannot influence it. */
  visitDate?: string;
};

/** One row of the patients export — the people, not their visits. */
export interface PatientExportRow {
  code: string;
  name: string;
  phone: string;
  address: string;
  /** ISO instants; rendered in Asia/Dhaka on the way into the file. */
  createdAt: string;
  updatedAt: string;
}

/** A finished export, plus whether the row cap cut it short. */
export interface ExportResult<TRow> {
  rows: TRow[];
  /** True when the safety cap was hit, so the caller can say so out loud. */
  truncated: boolean;
}

export interface VisitPage {
  rows: Visit[];
  total: number;
  totalPages: number;
  page: number;
}

export interface ShiftTotals {
  patients: number;
  fees: number;
  /** New vs returning within this shift, so a per-shift summary need not
   *  recount the rows itself and end up disagreeing with the day totals. */
  newPatients: number;
  returningPatients: number;
}

export interface DayTotals {
  date: string;
  all: ShiftTotals;
  morning: ShiftTotals;
  evening: ShiftTotals;
  /** Day-wide new/returning. Identical to `all.newPatients` /
   *  `all.returningPatients`; kept because the on-screen summary strip and the
   *  report's overall summary have always read them from here. */
  newPatients: number;
  returningPatients: number;
}

export function isShift(value: string): value is Shift {
  return SHIFT_OPTIONS.includes(value as Shift);
}

export function isValidPhone(phone: string): boolean {
  return PHONE_REGEX.test(phone);
}

export function computeFee(isNewPatient: boolean): number {
  return isNewPatient ? FEES.newPatient : FEES.existingPatient;
}

/**
 * Medicine pricing. A new patient's first week is free, so only the weeks after
 * it are charged; a returning patient pays for every week.
 *
 * Shared by the form's live preview and the server, so what the desk is quoted
 * is computed by the same rule that is stored — but the server always recomputes
 * it from the raw week count and never trusts a client-sent amount.
 */
export function computeMedicineFee(weeks: number, isNewPatient: boolean): number {
  const w = Math.max(0, Math.min(MEDICINE.maxWeeks, Math.trunc(weeks || 0)));
  if (w === 0) return 0;
  const chargeable = isNewPatient ? w - 1 : w;
  return Math.max(0, chargeable) * MEDICINE.weekFee;
}

/** What the patient actually paid: appointment + medicine. Never stored. */
export function totalCharged(visit: { fee: number; medicineFee: number }): number {
  return visit.fee + visit.medicineFee;
}

/** Latin digits everywhere — ৳800, never ৳৮০০. One format across table, toast, and confirmation. */
export function formatCurrency(amount: number): string {
  return `৳${amount.toLocaleString("en-US")}`;
}

/** YYYY-MM-DD for today in Asia/Dhaka — the default date for the visit log. */
export function todayInClinicTz(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CLINIC_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Human label for a YYYY-MM-DD date, e.g. "Today" or "12 Aug 2026". */
export function formatDayLabel(date: string): string {
  if (date === todayInClinicTz()) return "Today";
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-GB", {
    timeZone: CLINIC_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDay(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-GB", {
    timeZone: CLINIC_TZ,
    weekday: "long",
  });
}

export function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString("en-GB", {
    timeZone: CLINIC_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/** "Thursday, 12 March 2026" from a YYYY-MM-DD clinic date. */
export function formatClinicDateLong(date: string): string {
  return formatCalendarDate(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/** "Thu 12 Mar 2026" from a YYYY-MM-DD clinic date. */
export function formatClinicDateShort(date: string): string {
  return formatCalendarDate(date, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

/**
 * Formats a date-only string without letting a timezone shift it.
 *
 * "2026-03-12" parsed as a Date is midnight UTC, which in a negative-offset
 * locale is still 11 March — so the calendar date is pinned to UTC and rendered
 * there, rather than being run through the clinic timezone like an instant.
 */
function formatCalendarDate(date: string, options: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    ...options,
  });
}

/* ------------------------------------------------------------------ */
/* Machine-readable clinic-time formats, for CSV                        */
/* ------------------------------------------------------------------ */
/*
 * Deliberately separate from the display helpers above. A spreadsheet is sorted
 * and filtered, so it wants ISO-ish values Excel parses as real dates, not
 * "29 Sept 2026". Everything is still rendered in Asia/Dhaka, so a row's date
 * matches the day the clinic filed it under.
 */

/** "2026-10-03" — the Asia/Dhaka calendar date of an instant. */
export function clinicDateOf(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CLINIC_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** "14:05" — 24-hour Asia/Dhaka wall-clock time, which Excel reads as a time. */
export function clinicTimeOf(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: CLINIC_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/** "2026-10-03 14:05" — both at once, for the timestamp columns. */
export function clinicDateTimeOf(iso: string | null): string {
  if (!iso) return "";
  return `${clinicDateOf(iso)} ${clinicTimeOf(iso)}`;
}

/** "29 Sept 2026, 10:12 am" in clinic time — when a visit was voided. */
export function formatVoidedAt(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: CLINIC_TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

/** How a visit's time reads: a clock time, or the fact that it was backdated. */
export interface VisitTimeDisplay {
  /** "09:30 am" normally; "Backdated" when the time is nominal. */
  primary: string;
  /** "entered 28 Sept 2026" for backdated rows, otherwise null. */
  secondary: string | null;
  backdated: boolean;
}

/**
 * The single source for the time cell in the table, the mobile cards and the
 * printed report.
 *
 * A backdated row's `visitAt` carries a made-up hour, so showing it as a clock
 * time would state something nobody knows. The word "Backdated" replaces it,
 * with the real entry date underneath — text, not colour, so it survives
 * monochrome printing and does not depend on distinguishing hues.
 */
export function visitTimeDisplay(visit: {
  visitAt: string;
  backdated: boolean;
  createdAt: string;
}): VisitTimeDisplay {
  if (!visit.backdated) {
    return { primary: formatTime(visit.visitAt), secondary: null, backdated: false };
  }
  return {
    primary: "Backdated",
    secondary: `entered ${formatDate(visit.createdAt)}`,
    backdated: true,
  };
}

export function getShiftBadgeClass(shift: Shift): string {
  return shift === "morning"
    ? "bg-morning text-morning-foreground border border-morning-foreground/20"
    : "bg-evening text-evening-foreground border border-evening-foreground/20";
}

export function getShiftRowClass(shift: Shift): string {
  return shift === "morning" ? "morning-row" : "evening-row";
}
