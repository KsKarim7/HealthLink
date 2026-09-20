import { type Shift } from "@/lib/types";
import { SHIFT_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Sun, Moon } from "lucide-react";

type ShiftToggleMode = "filter" | "input";

interface ShiftToggleProps {
  value: Shift | "all";
  onChange: (value: Shift | "all") => void;
  mode?: ShiftToggleMode;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** input mode only: render the "Select a shift" hint as an error, not a note. */
  invalid?: boolean;
}

export function ShiftToggle({
  value,
  onChange,
  mode = "filter",
  size = "md",
  className,
  invalid = false,
}: ShiftToggleProps) {
  const handleClick = (shift: Shift) => {
    if (value === shift) {
      onChange("all");
    } else {
      onChange(shift);
    }
  };

  const sizeClasses = {
    sm: "h-9 px-2.5 text-xs gap-1.5",
    md: "h-11 px-4 text-sm gap-2",
    lg: "h-12 px-5 text-base gap-2.5",
  };

  const iconSizes = {
    sm: 14,
    md: 16,
    lg: 18,
  };

  const base =
    "inline-flex items-center justify-center rounded-lg font-medium transition-colors border border-transparent min-w-[44px]";
  const inactive = "bg-muted text-muted-foreground hover:bg-muted/80 border-border";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <button
        type="button"
        aria-pressed={value === "morning"}
        onClick={() => handleClick("morning")}
        className={cn(
          base,
          sizeClasses[size],
          value === "morning"
            ? "bg-morning text-morning-foreground border-morning-foreground/20"
            : inactive,
        )}
      >
        <Sun size={iconSizes[size]} aria-hidden="true" />
        {SHIFT_LABELS.morning}
      </button>
      <button
        type="button"
        aria-pressed={value === "evening"}
        onClick={() => handleClick("evening")}
        className={cn(
          base,
          sizeClasses[size],
          value === "evening"
            ? "bg-evening text-evening-foreground border-evening-foreground/20"
            : inactive,
        )}
      >
        <Moon size={iconSizes[size]} aria-hidden="true" />
        {SHIFT_LABELS.evening}
      </button>
      {mode === "input" && value === "all" && (
        <span className={cn("text-xs", invalid ? "text-destructive" : "text-muted-foreground")}>
          Select a shift
        </span>
      )}
    </div>
  );
}
