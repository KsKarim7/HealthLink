import { useEffect, useState } from "react";
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
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { AddPatientForm, type AddPatientMode } from "./AddPatientForm";
import {
  formatClinicDateShort,
  formatCurrency,
  totalCharged,
  type Visit,
  type VisitDraft,
} from "@/lib/types";

interface AddPatientModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Persists the draft server-side and resolves with the stored visit. */
  onSubmit: (draft: VisitDraft) => Promise<Visit>;
  /** Visits already shown for the selected day, for the repeat-visit warning. */
  todaysVisits?: Visit[];
  /** "old" bills an unrecognised phone as returning and offers a visit date. */
  mode?: AddPatientMode;
}

/**
 * Post-add confirmation. Shown identically in the Dialog and Drawer branches.
 * "+ Add Another" only clears `justAdded`, which unmounts this panel and mounts a
 * fresh AddPatientForm (empty fields, phone refocused by the form's mount effect).
 * It never submits.
 */
function AddedConfirmation({
  visit,
  onClose,
  onAddAnother,
  className,
}: {
  visit: Visit;
  onClose: () => void;
  onAddAnother: () => void;
  className: string;
}) {
  return (
    <div className={className}>
      <p className="text-center text-lg font-semibold text-primary">
        {visit.name} added successfully
      </p>
      <p className="mt-1 text-center text-sm text-muted-foreground">
        {visit.patientId} · Total: {formatCurrency(totalCharged(visit))} · Shift: {visit.shift}
      </p>
      {visit.backdated && (
        <p className="mt-1 text-center text-sm font-medium text-foreground">
          Recorded for {formatClinicDateShort(visit.visitAt.slice(0, 10))}
        </p>
      )}
      {visit.medicineWeeks > 0 && (
        <p className="mt-1 text-center text-xs text-muted-foreground">
          Appointment {formatCurrency(visit.fee)} + Medicine ({visit.medicineWeeks} wk
          {visit.medicineWeeks === 1 ? "" : "s"}) {formatCurrency(visit.medicineFee)}
        </p>
      )}
      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="h-12 flex-1 rounded-lg border border-input bg-background font-medium text-foreground"
        >
          Close
        </button>
        <button
          type="button"
          onClick={onAddAnother}
          className="h-12 flex-1 rounded-lg bg-primary font-medium text-primary-foreground"
        >
          + Add Another
        </button>
      </div>
    </div>
  );
}

export function AddPatientModal({
  open,
  onOpenChange,
  onSubmit,
  todaysVisits,
  mode = "new",
}: AddPatientModalProps) {
  const isDesktop = useMediaQuery("(min-width: 640px)");
  const [justAdded, setJustAdded] = useState<Visit | null>(null);
  // Lives here rather than in the form: "+ Add Another" unmounts the form to
  // clear it, and a batch of old visits is usually entered for the same day, so
  // the date has to outlive that remount. Closing the dialog resets it.
  const [visitDate, setVisitDate] = useState("");

  // Reset "just added" state when modal closes.
  useEffect(() => {
    if (!open) {
      setJustAdded(null);
      setVisitDate("");
    }
  }, [open]);

  // Confirm using the record the server actually stored, not the submitted draft.
  // If the write fails this rejects, the form catches it and shows the error, and
  // the confirmation panel stays closed.
  const handleSubmit = async (draft: VisitDraft) => {
    setJustAdded(await onSubmit(draft));
  };

  const handleAddAnother = () => {
    setJustAdded(null);
  };

  const isOldMode = mode === "old";
  const title = justAdded ? "Patient added" : isOldMode ? "Add Old Patient" : "Add Patient";
  const description = justAdded
    ? `${justAdded.name} (${justAdded.patientId}) has been added. Add another?`
    : isOldMode
      ? "Billed as an old patient: ৳300 + ৳300 per week of medicine."
      : "Enter the patient details. Fee is computed automatically.";

  if (isDesktop === null) return null;

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {justAdded ? (
            <AddedConfirmation
              visit={justAdded}
              onClose={() => onOpenChange(false)}
              onAddAnother={handleAddAnother}
              className="py-6"
            />
          ) : (
            <AddPatientForm
              onSubmit={handleSubmit}
              onCancel={() => onOpenChange(false)}
              todaysVisits={todaysVisits}
              mode={mode}
              visitDate={visitDate}
              onVisitDateChange={setVisitDate}
            />
          )}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh] px-4 pb-2">
        <DrawerHeader className="px-0 pt-2">
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>
        {justAdded ? (
          <AddedConfirmation
            visit={justAdded}
            onClose={() => onOpenChange(false)}
            onAddAnother={handleAddAnother}
            className="py-8"
          />
        ) : (
          <AddPatientForm
            onSubmit={handleSubmit}
            onCancel={() => onOpenChange(false)}
            todaysVisits={todaysVisits}
            mode={mode}
            visitDate={visitDate}
            onVisitDateChange={setVisitDate}
          />
        )}
      </DrawerContent>
    </Drawer>
  );
}
