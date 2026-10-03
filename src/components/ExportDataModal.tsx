import { useEffect, useState } from "react";
import { AlertCircle, Download, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { exportPatients, exportVisits } from "@/lib/patients.server";
import { asText, buildCsv, downloadCsv, type CsvValue } from "@/lib/csv";
import {
  clinicDateOf,
  clinicDateTimeOf,
  clinicTimeOf,
  todayInClinicTz,
  totalCharged,
  visitTimeDisplay,
  type PatientExportRow,
  type Visit,
} from "@/lib/types";

const VISIT_HEADERS = [
  "Patient ID",
  "Name",
  "Phone",
  "Address",
  "Visit date",
  "Visit time",
  "Shift",
  "Appointment fee",
  "Medicine weeks",
  "Medicine fee",
  "Total charged",
  "New or returning",
  "Old entry",
  "Backdated",
  "Recorded by",
  "Entered at",
  "Voided",
  "Void reason",
  "Voided by",
  "Voided at",
];

/**
 * One visit as a spreadsheet row.
 *
 * Amounts stay numeric and the flags are TRUE/FALSE, so the file can be summed
 * and filtered rather than only read — a display string like "৳1,400" would be
 * text to Excel.
 */
function visitRow(v: Visit): CsvValue[] {
  // The same judgement the on-screen time cell makes: a backdated visit's clock
  // time is a placeholder the system invented, so it is left blank here rather
  // than written out as though someone had observed it. The Backdated and
  // Entered at columns carry what is actually known.
  const time = visitTimeDisplay(v);

  return [
    v.patientId,
    v.name,
    // Text-locked: see asText. Bare digits lose the leading zero in Excel.
    asText(v.phone),
    v.address,
    // Dates and times are text too. Excel renders a value it has parsed as a
    // date or number as ######## whenever the column is narrower than the
    // formatted result, and a freshly opened CSV always uses the default width.
    // Text never does that — it simply overflows or clips — and ISO strings
    // still sort chronologically, which is what these columns are for.
    asText(clinicDateOf(v.visitAt)),
    asText(time.backdated ? "" : clinicTimeOf(v.visitAt)),
    v.shift === "morning" ? "Morning" : "Evening",
    v.fee,
    v.medicineWeeks,
    v.medicineFee,
    totalCharged(v),
    v.isNewPatient ? "New" : "Returning",
    v.legacyEntry,
    v.backdated,
    v.recordedBy,
    asText(clinicDateTimeOf(v.createdAt)),
    v.voided,
    v.voidReason ?? "",
    v.voidedBy ?? "",
    asText(clinicDateTimeOf(v.voidedAt)),
  ];
}

const PATIENT_HEADERS = [
  "Patient ID",
  "Name",
  "Phone",
  "Address",
  "First registered",
  "Last updated",
];

function patientRow(p: PatientExportRow): CsvValue[] {
  return [
    p.code,
    p.name,
    asText(p.phone),
    p.address,
    asText(clinicDateTimeOf(p.createdAt)),
    asText(clinicDateTimeOf(p.updatedAt)),
  ];
}

interface ExportDataModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Reports the outcome so the page can show a toast. */
  onDone: (message: string, detail?: string) => void;
}

type Busy = "backup" | "visits" | "patients" | null;

/**
 * Chrome (and Safari) treat a second programmatic download from the same
 * gesture as a popup and silently drop it, so the two files are sequenced with
 * a gap rather than fired together. Long enough for the first download to be
 * committed, short enough that the button does not feel stuck.
 */
const DOWNLOAD_GAP_MS = 900;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function ExportDataForm({ onDone }: { onDone: ExportDataModalProps["onDone"] }) {
  const today = todayInClinicTz();
  const [scope, setScope] = useState<"all" | "range">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  // A range needs both ends, and they have to be the right way round.
  const rangeInvalid = scope === "range" && (!from || !to || from > to);

  /** Builds and downloads the visits file. Returns what it wrote. */
  const downloadVisits = async (bounds: { from?: string; to?: string }, filename: string) => {
    const { rows, truncated } = await exportVisits({ data: bounds });
    // An empty result still produces a valid file: headers and nothing else is
    // a correct answer to "no visits in this range", not an error.
    downloadCsv(filename, buildCsv(VISIT_HEADERS, rows.map(visitRow)));
    return { count: rows.length, truncated };
  };

  /** Builds and downloads the patients file. */
  const downloadPatients = async (filename: string) => {
    const { rows, truncated } = await exportPatients();
    downloadCsv(filename, buildCsv(PATIENT_HEADERS, rows.map(patientRow)));
    return { count: rows.length, truncated };
  };

  /** The main event: both files, all data, one press. */
  const runBackup = async () => {
    setBusy("backup");
    setError(null);
    try {
      const v = await downloadVisits({}, `healthlink-visits-${today}.csv`);
      await sleep(DOWNLOAD_GAP_MS);
      const p = await downloadPatients(`healthlink-patients-${today}.csv`);
      onDone(
        `Backup downloaded — ${v.count} visit${v.count === 1 ? "" : "s"}, ${p.count} patient${p.count === 1 ? "" : "s"}`,
        v.truncated || p.truncated
          ? "One of the files hit its row limit and is not complete. Export narrower date ranges to get everything."
          : "Two files: visits and patients.",
      );
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Could not build the backup. Please try again.",
      );
    } finally {
      setBusy(null);
    }
  };

  const run = async (what: "visits" | "patients") => {
    setBusy(what);
    setError(null);
    try {
      if (what === "visits") {
        const bounds = scope === "range" ? { from, to } : {};
        const name =
          scope === "range"
            ? `healthlink-visits-${from}-to-${to}.csv`
            : `healthlink-visits-${today}.csv`;
        const { count, truncated } = await downloadVisits(bounds, name);
        onDone(
          `Exported ${count} visit${count === 1 ? "" : "s"}`,
          truncated
            ? "The export hit its row limit, so this file is not complete. Export a narrower date range to get everything."
            : name,
        );
      } else {
        const name = `healthlink-patients-${today}.csv`;
        const { count, truncated } = await downloadPatients(name);
        onDone(
          `Exported ${count} patient${count === 1 ? "" : "s"}`,
          truncated
            ? "The export hit its row limit, so this file is not complete."
            : name,
        );
      }
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Could not build the export. Please try again.",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* The whole point of the feature, so it gets the whole top of the dialog
          and the only filled button. */}
      <section className="space-y-2">
        <Button
          type="button"
          onClick={() => void runBackup()}
          disabled={busy !== null}
          className="h-14 w-full bg-primary text-base font-semibold text-primary-foreground hover:bg-primary/90"
        >
          {busy === "backup" ? (
            <>
              <Loader2 className="mr-2 animate-spin" size={20} /> Preparing both files…
            </>
          ) : (
            <>
              <Download className="mr-2" size={20} /> Download backup
            </>
          )}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Two files — every visit and every patient. This is the one to use for a backup.
        </p>
      </section>

      <section className="space-y-3 border-t border-border pt-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Or export one file
        </h3>
        <div>
          <h4 className="text-sm font-semibold text-foreground">Visits</h4>
          <p className="text-xs text-muted-foreground">
            Every visit, including voided ones, each marked in its own columns.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {/* Radios rather than a dropdown: two options, both worth seeing. */}
          {(
            [
              ["all", "All data (recommended for backup)"],
              ["range", "A date range"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border border-input px-3 text-sm"
            >
              <input
                type="radio"
                name="export-scope"
                value={value}
                checked={scope === value}
                onChange={() => setScope(value)}
                className="h-4 w-4 accent-primary"
              />
              <span>{label}</span>
            </label>
          ))}
        </div>

        {scope === "range" && (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="export-from" className="text-xs font-medium">
                From
              </Label>
              <input
                id="export-from"
                type="date"
                value={from}
                max={today}
                onChange={(e) => setFrom(e.target.value)}
                className="h-12 w-full rounded-lg border border-input bg-card px-3 text-base shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="export-to" className="text-xs font-medium">
                To
              </Label>
              <input
                id="export-to"
                type="date"
                value={to}
                max={today}
                onChange={(e) => setTo(e.target.value)}
                className="h-12 w-full rounded-lg border border-input bg-card px-3 text-base shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          onClick={() => void run("visits")}
          disabled={busy !== null || rangeInvalid}
          className="h-12 w-full"
        >
          {busy === "visits" ? (
            <>
              <Loader2 className="mr-2 animate-spin" size={18} /> Preparing…
            </>
          ) : (
            <>
              <Download className="mr-2" size={18} /> Export visits (CSV)
            </>
          )}
        </Button>
        {rangeInvalid && (
          <p className="text-center text-xs text-muted-foreground">
            Needed: {!from || !to ? "both dates" : "a From date on or before the To date"}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h4 className="text-sm font-semibold text-foreground">Patients</h4>
          <p className="text-xs text-muted-foreground">
            The people on file, with when each was first registered.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void run("patients")}
          disabled={busy !== null}
          className="h-12 w-full"
        >
          {busy === "patients" ? (
            <>
              <Loader2 className="mr-2 animate-spin" size={18} /> Preparing…
            </>
          ) : (
            <>
              <Download className="mr-2" size={18} /> Export patients (CSV)
            </>
          )}
        </Button>
      </section>

      <p className="text-xs text-muted-foreground">
        Files open directly in Excel. Nothing is changed or stored by exporting.
      </p>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-2.5 text-sm text-destructive">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Export, in the same Dialog-above-640px / Drawer-below shell as the other
 * modals. A dialog rather than two more header buttons: the header already
 * carries the controls that matter day to day, and a backup is occasional work.
 */
export function ExportDataModal({ open, onOpenChange, onDone }: ExportDataModalProps) {
  const isDesktop = useMediaQuery("(min-width: 640px)");
  const [mountKey, setMountKey] = useState(0);

  // Fresh state on each open, so a half-set date range never carries over.
  useEffect(() => {
    if (!open) setMountKey((k) => k + 1);
  }, [open]);

  if (isDesktop === null) return null;

  const title = "Export data";
  const description = "Download a CSV copy for your records or as a backup.";
  const body = <ExportDataForm key={mountKey} onDone={onDone} />;

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {body}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh] px-4 pb-4">
        <DrawerHeader className="px-0 pt-2">
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>
        {body}
      </DrawerContent>
    </Drawer>
  );
}
