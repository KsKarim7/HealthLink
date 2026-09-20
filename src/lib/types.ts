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
  /** UTC instant, ISO string. Rendered in Asia/Dhaka. */
  visitAt: string;
  /** Operator display name — the accountability stamp. */
  recordedBy: string;
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
 */
export type VisitDraft = PatientFormData;

export interface VisitPage {
  rows: Visit[];
  total: number;
  totalPages: number;
  page: number;
}

export interface ShiftTotals {
  patients: number;
  fees: number;
}

export interface DayTotals {
  date: string;
  all: ShiftTotals;
  morning: ShiftTotals;
  evening: ShiftTotals;
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

export function getShiftBadgeClass(shift: Shift): string {
  return shift === "morning"
    ? "bg-morning text-morning-foreground border border-morning-foreground/20"
    : "bg-evening text-evening-foreground border border-evening-foreground/20";
}

export function getShiftRowClass(shift: Shift): string {
  return shift === "morning" ? "morning-row" : "evening-row";
}
