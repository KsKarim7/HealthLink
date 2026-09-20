import { useEffect, useState } from "react";
import { getDayTotals } from "@/lib/patients.server";
import type { DayTotals } from "@/lib/types";

/** Server-computed counts and ৳ totals for one Asia/Dhaka date. */
export function useDayTotals(date: string, reloadToken = 0) {
  const [totals, setTotals] = useState<DayTotals | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    getDayTotals({ data: { date } })
      .then((result) => {
        if (cancelled) return;
        setTotals(result);
        setIsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setTotals(null);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [date, reloadToken]);

  return { totals, isLoading };
}
