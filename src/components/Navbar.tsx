import { LogOut, Plus, Repeat, User2 } from "lucide-react";
import { ShiftToggle } from "./ShiftToggle";
import { SearchBox } from "./SearchBox";
import { cn } from "@/lib/utils";
import type { OperatorOption } from "@/lib/auth";
import type { Shift } from "@/lib/types";

interface NavbarProps {
  shift: Shift | "all";
  onShiftChange: (shift: Shift | "all") => void;
  onAddPatient: () => void;
  search: string;
  onSearchChange: (value: string) => void;
  onLogout: () => void;
  /** Who this session records visits as — always visible, never guessed at. */
  operator: OperatorOption | null;
  /** Reopens the picker without logging out, for a shift handoff. */
  onSwitchOperator: () => void;
  className?: string;
}

export function Navbar({
  shift,
  onShiftChange,
  onAddPatient,
  search,
  onSearchChange,
  onLogout,
  operator,
  onSwitchOperator,
  className,
}: NavbarProps) {
  return (
    <>
      {/* Top bar: always present */}
      <header
        className={cn(
          "sticky top-0 z-40 flex h-16 items-center justify-between border-b border-white/10 bg-primary px-4 text-primary-foreground shadow-sm md:px-6",
          className,
        )}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onShiftChange("all")}
            className="flex items-center gap-2 rounded-lg p-1 transition-colors hover:bg-white/10"
            aria-label="Reset to all shifts"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-white/10">
              <User2 className="text-white" size={20} />
            </div>
            <span className="hidden text-lg font-bold tracking-tight sm:inline">HealthLink</span>
          </button>
        </div>

        {/* Desktop/tablet: full controls in one row */}
        <div className="hidden items-center gap-3 md:flex">
          <ShiftToggle value={shift} onChange={onShiftChange} size="sm" />
          <button
            type="button"
            onClick={onAddPatient}
            className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-white px-4 text-sm font-semibold text-primary shadow-sm transition-colors hover:bg-white/90"
          >
            <Plus size={18} />
            Add Patient
          </button>
          {/* Current operator + one-tap handoff. Sits next to Logout because
              switching names is the common case and logging out is not. */}
          <button
            type="button"
            onClick={onSwitchOperator}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-white/10 px-3 text-sm font-medium text-white transition-colors hover:bg-white/20"
            aria-label={
              operator ? `Recording as ${operator.displayName}. Switch operator.` : "Pick operator"
            }
          >
            <User2 size={16} />
            <span className="max-w-[10rem] truncate">{operator?.displayName ?? "Pick name"}</span>
            <span className="inline-flex items-center gap-1 rounded bg-white/15 px-1.5 py-0.5 text-xs">
              <Repeat size={12} />
              Switch
            </span>
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-white/90 transition-colors hover:bg-white/10"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>

        {/* Mobile top bar: search + logout */}
        <div className="flex items-center gap-2 md:hidden">
          <SearchBox variant="mobile" value={search} onChange={onSearchChange} />
          <button
            type="button"
            onClick={onSwitchOperator}
            className="flex h-11 max-w-[8rem] items-center gap-1.5 rounded-lg bg-white/10 px-2.5 text-sm font-medium text-white"
            aria-label={
              operator ? `Recording as ${operator.displayName}. Switch operator.` : "Pick operator"
            }
          >
            <User2 size={16} />
            <span className="truncate">{operator?.displayName ?? "Pick name"}</span>
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-white/90 hover:bg-white/10"
            aria-label="Logout"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Mobile: fixed bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-primary px-4 pb-[env(safe-area-inset-bottom)] pt-2 md:hidden">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <ShiftToggle value={shift} onChange={onShiftChange} size="sm" />
          <button
            type="button"
            onClick={onAddPatient}
            className="relative -mt-6 flex h-16 w-16 items-center justify-center rounded-full bg-white text-primary shadow-lg ring-4 ring-primary transition-transform hover:scale-105 active:scale-95"
            aria-label="Add Patient"
          >
            <Plus size={28} />
          </button>
          <div className="w-20" />
        </div>
      </div>
    </>
  );
}
