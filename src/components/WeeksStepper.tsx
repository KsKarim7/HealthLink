import { Minus, Plus } from "lucide-react";
import { MEDICINE } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface WeeksStepperProps {
  value: number;
  onChange: (weeks: number) => void;
  id?: string;
  className?: string;
}

/**
 * Week count for medicine, 0 to MEDICINE.maxWeeks.
 *
 * Deliberately not a native number input: its spinner arrows are a few pixels
 * tall and unusable on the tablet at the reception desk. These are 48px targets
 * either side of a read-only display. The value is still typeable via keyboard
 * on the field itself for speed on desktop.
 */
export function WeeksStepper({ value, onChange, id, className }: WeeksStepperProps) {
  const clamp = (n: number) => Math.max(0, Math.min(MEDICINE.maxWeeks, n));
  const set = (n: number) => onChange(clamp(Number.isFinite(n) ? Math.trunc(n) : 0));

  const atMin = value <= 0;
  const atMax = value >= MEDICINE.maxWeeks;

  const button =
    "flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-input bg-card text-foreground transition-colors hover:bg-muted disabled:opacity-40 disabled:hover:bg-card";

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <button
        type="button"
        onClick={() => set(value - 1)}
        disabled={atMin}
        aria-label="One week less"
        className={button}
      >
        <Minus size={20} />
      </button>

      <input
        id={id}
        type="text"
        inputMode="numeric"
        aria-label="Weeks of medicine"
        value={value}
        onChange={(e) => set(parseInt(e.target.value.replace(/\D/g, ""), 10) || 0)}
        className="h-12 w-16 rounded-lg border border-input bg-card text-center text-base font-semibold text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
      />

      <button
        type="button"
        onClick={() => set(value + 1)}
        disabled={atMax}
        aria-label="One week more"
        className={button}
      >
        <Plus size={20} />
      </button>

      <span className="text-sm text-muted-foreground">
        {value === 0 ? "No medicine" : value === 1 ? "1 week" : `${value} weeks`}
      </span>
    </div>
  );
}
