import { History, KeyRound, LogOut, Plus, User2 } from "lucide-react";
import { ShiftToggle } from "./ShiftToggle";
import { SearchBox } from "./SearchBox";
import { cn } from "@/lib/utils";
import type { Shift } from "@/lib/types";

interface NavbarProps {
  shift: Shift | "all";
  onShiftChange: (shift: Shift | "all") => void;
  onAddPatient: () => void;
  /** Opens the same dialog in old-patient mode. */
  onAddOldPatients: () => void;
  search: string;
  onSearchChange: (value: string) => void;
  onLogout: () => void;
  /** Opens the shared-password change dialog. */
  onChangePassword: () => void;
  className?: string;
}

export function Navbar({
  shift,
  onShiftChange,
  onAddPatient,
  onAddOldPatients,
  search,
  onSearchChange,
  onLogout,
  onChangePassword,
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
          {/* Secondary by design: registering historical patients is occasional
              work, and must not compete with the everyday action beside it. */}
          <button
            type="button"
            onClick={onAddOldPatients}
            className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-white/40 px-4 text-sm font-medium text-white transition-colors hover:bg-white/10"
          >
            <History size={18} />
            Add Old Patients
          </button>
          {/* Icon-only: a third labelled button here would crowd the two that
              matter. 44px target, and the label is on the element for
              screen readers and as a tooltip. */}
          <button
            type="button"
            onClick={onChangePassword}
            title="Change password"
            aria-label="Change password"
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-white/90 transition-colors hover:bg-white/10"
          >
            <KeyRound size={18} />
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
            onClick={onChangePassword}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-white/90 hover:bg-white/10"
            aria-label="Change password"
          >
            <KeyRound size={20} />
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
          {/* Takes over the spacer that balanced the raised button, so the bar
              stays symmetrical. 44px tall minimum, clear of the FAB. */}
          <button
            type="button"
            onClick={onAddOldPatients}
            className="flex h-11 w-20 flex-col items-center justify-center rounded-lg border border-white/40 text-[11px] font-medium leading-tight text-white active:bg-white/10"
            aria-label="Add old patients"
          >
            <History size={16} />
            Old
          </button>
        </div>
      </div>
    </>
  );
}
