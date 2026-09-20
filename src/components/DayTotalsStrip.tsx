import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDayLabel, type DayTotals } from "@/lib/types";

interface DayTotalsStripProps {
  totals: DayTotals | null;
  isLoading?: boolean;
}

/**
 * The accountability summary for the selected day — counts and ৳ collected,
 * computed server-side so it always agrees with the rows in the table.
 */
export function DayTotalsStrip({ totals, isLoading }: DayTotalsStripProps) {
  if (isLoading) {
    return (
      <div className="mb-4 rounded-xl border border-border bg-card p-3 shadow-sm">
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>
    );
  }

  if (!totals) return null;

  const label = formatDayLabel(totals.date);
  const patients = totals.all.patients;

  return (
    <div className="mb-4 rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="font-semibold text-foreground">{label}</span>
        <span className="text-muted-foreground">—</span>
        <span className="font-medium text-foreground">
          {patients} patient{patients === 1 ? "" : "s"}
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">{totals.morning.patients} morning</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">{totals.evening.patients} evening</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">
          {totals.newPatients} new / {totals.returningPatients} returning
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="font-semibold text-primary">
          {formatCurrency(totals.all.fees)} collected
        </span>
      </div>
    </div>
  );
}
