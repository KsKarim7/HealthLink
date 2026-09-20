import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { todayInClinicTz } from "@/lib/types";

interface DatePickerProps {
  /** YYYY-MM-DD in Asia/Dhaka. */
  value: string;
  onChange: (date: string) => void;
  className?: string;
}

/**
 * Which day of the visit log to show. Defaults to today in Asia/Dhaka; the max
 * is today, since visits cannot be recorded in the future.
 */
export function DatePicker({ value, onChange, className }: DatePickerProps) {
  const today = todayInClinicTz();

  return (
    <div className={cn("relative", className)}>
      <CalendarDays
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        size={18}
      />
      <input
        type="date"
        aria-label="Visit date"
        value={value}
        max={today}
        onChange={(e) => onChange(e.target.value || today)}
        className="h-11 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-base shadow-sm transition-colors focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );
}
