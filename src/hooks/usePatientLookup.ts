import { useEffect, useState } from "react";
import { lookupByPhone } from "@/lib/patients.server";
import { isValidPhone, type PatientIdentity } from "@/lib/types";

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
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [phone]);

  return result;
}
