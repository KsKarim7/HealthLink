import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { SearchBox } from "@/components/SearchBox";
import { DatePicker } from "@/components/DatePicker";
import { DayTotalsStrip } from "@/components/DayTotalsStrip";
import { PatientTable } from "@/components/PatientTable";
import { PatientCardList } from "@/components/PatientCard";
import { Pagination } from "@/components/Pagination";
import { AddPatientModal } from "@/components/AddPatientModal";
import { ChangePasswordModal } from "@/components/ChangePasswordModal";
import { VoidVisitModal } from "@/components/VoidVisitModal";
import { PrintDayReport } from "@/components/PrintDayReport";
import { Button } from "@/components/ui/button";
import { Printer, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePatients } from "@/hooks/usePatients";
import { useDayTotals } from "@/hooks/useDayTotals";
import { createVisit, getDayTotals, listDayVisits, voidVisit } from "@/lib/patients.server";
import { isAuthError } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import {
  formatClinicDateShort,
  formatCurrency,
  formatDayLabel,
  totalCharged,
  type DayTotals,
  todayInClinicTz,
  type Shift,
  type Visit,
  type VisitDraft,
} from "@/lib/types";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  // Every hook runs unconditionally, before any early return — the auth gate below
  // must never change the number of hooks between renders.
  const {
    isAuthenticated,
    isLoading: authLoading,
    logout,
    refresh: refreshSession,
  } = useAuth();
  const navigate = useNavigate();
  const [date, setDate] = useState(todayInClinicTz);
  const [shift, setShift] = useState<Shift | "all">("all");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  // "View all patients": every date instead of `date`. Picking a date turns it off.
  const [allDates, setAllDates] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  // Which flow the one dialog is running: the everyday one, or old patients.
  const [addMode, setAddMode] = useState<"new" | "old">("new");
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  // Off by default: a voided visit is not part of the day's work.
  const [showVoided, setShowVoided] = useState(false);
  // The visit awaiting confirmation, or null when the dialog is closed.
  const [voidTarget, setVoidTarget] = useState<Visit | null>(null);
  const [totalsToken, setTotalsToken] = useState(0);
  // Full-day rows for the printable report — fetched on demand, unpaginated,
  // and deliberately independent of the on-screen shift/page/search state.
  const [printRows, setPrintRows] = useState<Visit[] | null>(null);
  const [printTotals, setPrintTotals] = useState<DayTotals | null>(null);
  const [printLoading, setPrintLoading] = useState(false);
  const [pendingPrint, setPendingPrint] = useState(false);

  const { visits, total, totalPages, page: safePage, isLoading, error, refresh } = usePatients({
    date,
    shift,
    page,
    search,
    allDates,
    includeVoided: showVoided,
  });
  const { totals, isLoading: totalsLoading } = useDayTotals(date, totalsToken);

  // Redirect from an effect, never during render, and only once auth has settled.
  // While `authLoading` is true a logged-in session may still be restoring, so
  // redirecting here would bounce a valid user off the page on every refresh.
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate({ to: "/login", replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);

  // A data call rejected for lack of a session means the session ended
  // elsewhere (expired, or logged out on another tab). Re-reading it clears
  // `isAuthenticated`, and the effect above then sends the user to /login.
  useEffect(() => {
    if (error && isAuthError(error)) {
      void refreshSession();
    }
  }, [error, refreshSession]);

  useEffect(() => {
    if (!pendingPrint || !printRows) return;
    setPendingPrint(false);
    // Wait for the browser to paint the report before opening the dialog.
    const raf = requestAnimationFrame(() => window.print());
    return () => cancelAnimationFrame(raf);
  }, [pendingPrint, printRows]);

  if (authLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  // Plain handlers, not hooks — safe to declare after the auth guard above.
  const handleAddPatient = async (draft: VisitDraft): Promise<Visit> => {
    // The server is the sole authority on code/fee/isNewPatient/visit_at and
    // recorded_by, so there is nothing about them to send. The toast reports the
    // record it actually stored.
    const saved = await createVisit({ data: { draft } });
    refresh();
    setTotalsToken((t) => t + 1);
    const breakdown =
      saved.medicineWeeks > 0
        ? `${formatCurrency(saved.fee)} + ${saved.medicineWeeks} wk medicine ${formatCurrency(saved.medicineFee)} = ${formatCurrency(totalCharged(saved))}`
        : `${formatCurrency(totalCharged(saved))}`;
    // A backdated visit will not appear in the list below (that shows the
    // selected day), so the toast has to say where it went.
    const when = saved.backdated
      ? ` · recorded for ${formatClinicDateShort(saved.visitAt.slice(0, 10))}`
      : "";
    toast.success(`${saved.name} added (${saved.patientId})`, {
      description: `${breakdown} · Shift: ${saved.shift}${when}`,
    });
    return saved;
  };

  const handleVoid = async (visit: Visit, reason: string) => {
    // The server decides everything here; this only reports the outcome. It
    // deliberately does not catch — the dialog shows the error and stays open.
    await voidVisit({ data: { visitId: visit.id, reason } });
    setVoidTarget(null);
    // The row leaves the default view and the totals drop it, both immediately.
    refresh();
    setTotalsToken((t) => t + 1);
    toast.success(`Visit voided (${visit.patientId})`, {
      description: `${visit.name} · no longer counted in totals or the report.`,
    });
  };

  const handlePrint = async () => {
    setPrintLoading(true);
    try {
      // Always the whole selected day, both shifts, every row — and a matching
      // totals snapshot taken at the same moment. Reading the on-screen totals
      // instead would print stale figures whenever another device had recorded
      // visits since this page loaded, leaving the report disagreeing with its
      // own table.
      const [rows, dayTotals] = await Promise.all([
        listDayVisits({ data: { date } }),
        getDayTotals({ data: { date } }),
      ]);
      setPrintRows(rows);
      setPrintTotals(dayTotals);
      setPendingPrint(true);
    } catch (err) {
      toast.error("Could not build the day report.", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setPrintLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate({ to: "/login", replace: true });
  };

  const dayLabel = formatDayLabel(date);
  const shiftLabel =
    shift === "all" ? "All shifts" : `${shift.charAt(0).toUpperCase() + shift.slice(1)} shift`;
  const countLabel = isLoading ? "Loading…" : `${total} visit${total === 1 ? "" : "s"}`;
  const searchTerm = search.trim();

  // What the table is actually showing. Search wins over everything, then the
  // all-dates view, then the normal single day. The subtitle and the summary strip
  // both follow this, so neither can describe a different set than the table.
  const scope: "search" | "all" | "day" = searchTerm ? "search" : allDates ? "all" : "day";
  // With voided rows shown, the table holds more rows than the totals below it
  // count. Saying so keeps the two from looking like they disagree.
  const voidedNote = showVoided ? " · including voided" : "";
  const scopeLabel =
    scope === "search"
      ? `Search results for “${searchTerm}” · ${countLabel} · all dates and shifts${voidedNote}`
      : scope === "all"
        ? `All patients · ${countLabel} · ${shiftLabel}${voidedNote}`
        : `${countLabel} · ${dayLabel} · ${shiftLabel}${voidedNote}`;

  return (
    <>
      <div className="screen-only flex min-h-screen flex-col bg-background">
      <Navbar
        shift={shift}
        onShiftChange={(s) => {
          setShift(s);
          setPage(1);
        }}
        onAddPatient={() => {
          setAddMode("new");
          setAddOpen(true);
        }}
        onAddOldPatients={() => {
          setAddMode("old");
          setAddOpen(true);
        }}
        search={search}
        onSearchChange={(s) => {
          setSearch(s);
          setPage(1);
        }}
        onLogout={() => void handleLogout()}
        onChangePassword={() => setChangePasswordOpen(true)}
      />

      <main className="flex-1 p-4 pb-28 md:px-6 md:pb-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">Patients</h1>
              <p className="text-sm text-muted-foreground">{scopeLabel}</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <DatePicker
                // Blank while viewing all dates, so choosing any date (even the one
                // previously selected) fires a change and returns to the day view.
                value={allDates ? "" : date}
                onChange={(d) => {
                  setDate(d);
                  setAllDates(false);
                  setPage(1);
                }}
                className="sm:w-44"
              />
              <Button
                type="button"
                variant={allDates ? "default" : "outline"}
                aria-pressed={allDates}
                onClick={() => {
                  setAllDates((v) => !v);
                  setPage(1);
                }}
                className="h-11"
              >
                View all patients
              </Button>
              {/* Reveals voided rows in whatever the current view is. They stay
                  out of the summary strip and the printed report either way. */}
              <Button
                type="button"
                variant={showVoided ? "default" : "outline"}
                aria-pressed={showVoided}
                onClick={() => {
                  setShowVoided((v) => !v);
                  setPage(1);
                }}
                className="h-11"
              >
                Show voided
              </Button>
              {/* Only meaningful for a single day: a search or the all-dates
                  view is not a day, so the control is hidden there. */}
              {scope === "day" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePrint}
                  disabled={printLoading || totalsLoading}
                  className="h-11"
                >
                  {printLoading ? (
                    <>
                      <Loader2 className="mr-2 animate-spin" size={16} /> Preparing…
                    </>
                  ) : (
                    <>
                      <Printer className="mr-2" size={16} /> Print day report
                    </>
                  )}
                </Button>
              )}
              <div className="hidden md:block md:w-72">
                <SearchBox
                  value={search}
                  onChange={(s) => {
                    setSearch(s);
                    setPage(1);
                  }}
                />
              </div>
            </div>
          </div>

          {/* Daily totals describe one day, so they only appear in the single-day
              view. During a search or the all-dates view the subtitle carries the
              count instead, and nothing can contradict the table. */}
          {scope === "day" && <DayTotalsStrip totals={totals} isLoading={totalsLoading} />}

          {error && (
            <div className="mb-4 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="hidden md:block">
            <PatientTable
              visits={visits}
              isLoading={isLoading}
              tabletMode={false}
              search={search}
              onVoid={setVoidTarget}
            />
          </div>
          <div className="md:hidden">
            <PatientCardList
              visits={visits}
              isLoading={isLoading}
              search={search}
              onVoid={setVoidTarget}
            />
          </div>

          {totalPages > 1 && (
            <div className="mt-6">
              <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
            </div>
          )}
        </div>
      </main>

      <AddPatientModal
        open={addOpen}
        onOpenChange={setAddOpen}
        onSubmit={handleAddPatient}
        mode={addMode}
        // Only the rows of *today's* day view are "today's list"; search and
        // all-dates rows span other days and would trigger false warnings.
        todaysVisits={scope === "day" && date === todayInClinicTz() ? visits : undefined}
      />

      <VoidVisitModal
        visit={voidTarget}
        onOpenChange={(open) => !open && setVoidTarget(null)}
        onConfirm={handleVoid}
      />

      <ChangePasswordModal
        open={changePasswordOpen}
        onOpenChange={setChangePasswordOpen}
        onChanged={() => {
          // The caller keeps their session, so there is nothing to redirect to
          // — only the other devices were signed out.
          setChangePasswordOpen(false);
          toast.success("Password changed. Other devices have been signed out.");
        }}
      />

      <Toaster
        position="top-right"
        toastOptions={{
          className: "md:top-right",
        }}
      />
      </div>

      {/* Hidden on screen; revealed only by the print stylesheet. */}
      <PrintDayReport date={date} visits={printRows ?? []} totals={printTotals ?? totals} />
    </>
  );
}
