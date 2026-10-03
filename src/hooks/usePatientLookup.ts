import { useEffect, useState } from "react";
import { lookupByCode, lookupByPhone } from "@/lib/patients.server";
import { isValidPhone, type PatientIdentity } from "@/lib/types";

/** Shared debounce for both lookups, so they feel identical at the desk. */
const LOOKUP_DEBOUNCE_MS = 400;

export interface LookupResult {
  /** The one patient who owns this phone, or null when the number is unused. */
  match: PatientIdentity | null;
  isLoading: boolean;
}

/**
 * Resolves a phone number to at most one patient (one phone = one person, now a
 * UNIQUE constraint in Postgres). Only queries once the number is a valid
 * 11-digit 01… mobile, so partial input never produces a New/Returning verdict.
 */
export function usePatientLookup(phone: string): LookupResult {
  const [result, setResult] = useState<LookupResult>({ match: null, isLoading: false });

  useEffect(() => {
    if (!isValidPhone(phone)) {
      setResult({ match: null, isLoading: false });
      return;
    }

    let cancelled = false;
    setResult((prev) => ({ ...prev, isLoading: true }));

    const timer = setTimeout(() => {
      lookupByPhone({ data: { phone } })
        .then((match) => {
          if (!cancelled) setResult({ match, isLoading: false });
        })
        .catch(() => {
          // A failed lookup must not block the desk — fall back to "new patient".
          if (!cancelled) setResult({ match: null, isLoading: false });
        });
    }, LOOKUP_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [phone]);

  return result;
}

export interface CodeLookupResult {
  /** The patient holding this ID, or null once a lookup has come back empty. */
  match: PatientIdentity | null;
  isLoading: boolean;
  /**
   * True only after a lookup has actually completed for the current input.
   * Without it, "No patient found" would flash while someone is still typing
   * the second digit of their ID.
   */
  searched: boolean;
}

const NO_CODE_RESULT: CodeLookupResult = { match: null, isLoading: false, searched: false };

/**
 * Resolves a printed patient ID to at most one patient.
 *
 * A convenience shortcut only: what it finds is used to fill the phone number
 * in, and the phone lookup above remains the thing that decides new vs
 * returning. Normalisation of the typed ID happens server-side, so "42",
 * "000042" and "PT-000042" all arrive at the same patient.
 */
export function usePatientCodeLookup(code: string): CodeLookupResult {
  const [result, setResult] = useState<CodeLookupResult>(NO_CODE_RESULT);

  useEffect(() => {
    const trimmed = code.trim();
    if (!trimmed) {
      // Clearing the field clears the verdict with it.
      setResult(NO_CODE_RESULT);
      return;
    }

    let cancelled = false;
    setResult((prev) => ({ ...prev, isLoading: true }));

    const timer = setTimeout(() => {
      lookupByCode({ data: { code: trimmed } })
        .then((match) => {
          if (!cancelled) setResult({ match, isLoading: false, searched: true });
        })
        .catch(() => {
          // A failed lookup must not block the desk — the ID is optional, so
          // this falls back to filling the form in by hand.
          if (!cancelled) setResult({ match: null, isLoading: false, searched: true });
        });
    }, LOOKUP_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [code]);

  return result;
}
