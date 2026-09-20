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

export const SHIFT_OPTIONS = ["morning", "evening"] as const;
export type Shift = (typeof SHIFT_OPTIONS)[number];

export const SHIFT_LABELS: Record<Shift, string> = {
  morning: "Morning",
  evening: "Evening",
};

// 11 digits; real Bangladeshi mobile prefixes are 013-019.
export const PHONE_REGEX = /^01[3-9]\d{8}$/;
export const PHONE_INVALID_MESSAGE =
  "Enter a valid 11-digit Bangladeshi mobile number (e.g. 017XXXXXXXX).";

export const STORAGE_KEYS = {
  patients: "dpas_patients",
  patientMasters: "dpas_patient_masters",
  auth: "dpas_auth",
};
