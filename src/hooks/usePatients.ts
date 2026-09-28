import { useCallback, useEffect, useState } from "react";
import { listVisits } from "@/lib/patients.server";
import type { Shift, Visit, VisitPage } from "@/lib/types";

export const PAGE_LIMIT = 10;

export interface UsePatientsOptions {
  /** YYYY-MM-DD in Asia/Dhaka. */
  date: string;
  shift: Shift | "all";
  page: number;
  search: string;
  /** Ignore `date` and list every day. Search overrides this too. */
  allDates: boolean;
  /** Also list voided visits, which are hidden everywhere by default. */
  includeVoided: boolean;
}

const EMPTY: VisitPage = { rows: [], total: 0, totalPages: 1, page: 1 };

/**
 * Reads the visit log from the server. Filtering, search, and pagination all
 * happen in Postgres now — this hook no longer loads everything and filters in
 * memory the way the localStorage version did.
 */
export function usePatients({
  date,
  shift,
  page,
  search,
  allDates,
  includeVoided,
}: UsePatientsOptions) {
  const [data, setData] = useState<VisitPage>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    // Guards against out-of-order responses while the operator is typing.
    let cancelled = false;
    setIsLoading(true);

    // A search looks across every visit ever recorded, so it sends neither date
    // nor shift. Otherwise: one day (or all days) with the shift filter applied.
    const term = search.trim();
    const query = term
      ? { search: term, page, pageSize: PAGE_LIMIT, includeVoided }
      : {
          date: allDates ? undefined : date,
          allDates,
          shift: shift === "all" ? undefined : shift,
          page,
          pageSize: PAGE_LIMIT,
          includeVoided,
        };

    listVisits({ data: query })
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setData(EMPTY);
        setError(err instanceof Error ? err.message : "Could not load visits.");
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [date, shift, page, search, allDates, includeVoided, reloadToken]);

  const refresh = useCallback(() => setReloadToken((t) => t + 1), []);

  return {
    visits: data.rows as Visit[],
    total: data.total,
    totalPages: data.totalPages,
    page: data.page,
    isLoading,
    error,
    refresh,
  };
}
