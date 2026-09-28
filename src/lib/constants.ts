// Fees and app-level constants. These mirror what the backend would compute
// so the UI can give instant feedback before the real request completes.

export const FEES = {
  newPatient: 800,
  existingPatient: 300,
} as const;

/** Medicine is sold by the week, at a flat rate per chargeable week. */
export const MEDICINE = {
  weekFee: 300,
  maxWeeks: 12,
} as const;

/**
 * The name every write is attributed to.
 *
 * The site has one shared login and no per-person identification, so there is
 * nothing truthful to put in `recorded_by` beyond "this clinic". Stamping one
 * fixed name is honest about that; inventing a person would not be. The column
 * is still written server-side and never accepted from the client.
 *
 * Change it here and all future rows follow. Rows written before a change keep
 * whatever name they were stamped with, which is the point of an audit trail.
 */
export const RECORDER_NAME = "Clinic";

export const SHIFT_OPTIONS = ["morning", "evening"] as const;
export type Shift = (typeof SHIFT_OPTIONS)[number];

export const SHIFT_LABELS: Record<Shift, string> = {
  morning: "Morning",
  evening: "Evening",
};

/**
 * Wall-clock time (Asia/Dhaka) stamped on a backdated visit.
 *
 * An old visit is entered days or months later and nobody remembers the minute
 * it happened, so the shift supplies a nominal time. It exists to place the row
 * inside the right shift and to order it sensibly against its neighbours — it is
 * not a claim about when the patient actually walked in. The real moment of data
 * entry is always kept separately in `visits.created_at`.
 */
export const BACKDATED_SHIFT_TIME: Record<Shift, string> = {
  morning: "10:00",
  evening: "18:00",
};

// 11 digits; real Bangladeshi mobile prefixes are 013-019.
export const PHONE_REGEX = /^01[3-9]\d{8}$/;
export const PHONE_INVALID_MESSAGE =
  "Enter a valid 11-digit Bangladeshi mobile number (e.g. 017XXXXXXXX).";

// STORAGE_KEYS is gone: the last of them, `dpas_auth`, was the localStorage flag
// the demo login treated as proof of identity. Sessions now live server-side and
// the browser keeps nothing at all.
