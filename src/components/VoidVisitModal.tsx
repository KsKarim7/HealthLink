import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertCircle, Loader2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { formatCurrency, totalCharged, type Visit } from "@/lib/types";

const REASON_MAX = 500;

/** Mirrors the server's rule: a trimmed, non-empty reason. */
const schema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "Give a reason for voiding this visit.")
    .max(REASON_MAX, `Keep the reason under ${REASON_MAX} characters.`),
});

type FormData = z.infer<typeof schema>;

interface VoidVisitModalProps {
  /** The visit being voided; null closes the dialog. */
  visit: Visit | null;
  onOpenChange: (open: boolean) => void;
  /** Performs the void and resolves once the server has accepted it. */
  onConfirm: (visit: Visit, reason: string) => Promise<void>;
}

function VoidVisitForm({
  visit,
  onConfirm,
  onCancel,
}: {
  visit: Visit;
  onConfirm: (visit: Visit, reason: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: { reason: "" },
  });

  const reason = form.watch("reason") ?? "";
  // Also gates implicit submission: with the button disabled, pressing Enter in
  // the field cannot submit an empty reason.
  const canSubmit = reason.trim().length > 0 && !form.formState.isSubmitting;

  const handleSubmit = form.handleSubmit(async (data) => {
    // Belt and braces — the zod schema and the disabled button both cover this,
    // but a void is irreversible, so an empty reason never reaches the server.
    const trimmed = data.reason.trim();
    if (!trimmed) return;

    setSubmitError(null);
    try {
      await onConfirm(visit, trimmed);
    } catch (err) {
      setSubmitError(
        err instanceof Error && err.message
          ? err.message
          : "Could not void this visit. Please try again.",
      );
    }
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Which visit, spelled out — the dialog is opened from a row, and the
          row is no longer visible behind a drawer on a phone. */}
      <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
        <p className="font-semibold text-foreground">{visit.name}</p>
        <p className="mt-0.5 text-muted-foreground">
          {visit.patientId} · {formatCurrency(totalCharged(visit))} ·{" "}
          {visit.shift === "morning" ? "Morning" : "Evening"}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="void-reason" className="text-sm font-medium">
          Reason for voiding
        </Label>
        <Input
          id="void-reason"
          autoFocus
          maxLength={REASON_MAX}
          placeholder="e.g. entered twice by mistake"
          className="h-12 text-base"
          {...form.register("reason")}
        />
        {form.formState.errors.reason && (
          <p className="text-xs text-destructive">{form.formState.errors.reason.message}</p>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-2.5 text-sm text-destructive">
        <AlertCircle size={16} className="mt-0.5 shrink-0" />
        <span>
          This cannot be undone here. The visit stays on record as voided and stops counting
          towards any total. To correct a mistake, record the correct visit afterwards.
        </span>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 mt-4 border-t border-border bg-card px-4 pt-4 safe-bottom md:static md:mx-0 md:bg-transparent md:px-0 md:pt-0">
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel} className="h-12 flex-1">
            Cancel
          </Button>
          <Button type="submit" variant="destructive" disabled={!canSubmit} className="h-12 flex-1">
            {form.formState.isSubmitting ? (
              <>
                <Loader2 className="mr-2 animate-spin" size={18} /> Voiding…
              </>
            ) : (
              "Void visit"
            )}
          </Button>
        </div>
        {submitError && (
          <div className="mt-2 flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-2.5 text-sm text-destructive">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{submitError}</span>
          </div>
        )}
        {reason.trim().length === 0 && (
          <p className="mt-2 text-center text-xs text-muted-foreground">Needed: a reason</p>
        )}
      </div>
    </form>
  );
}

/**
 * Confirms voiding one visit, in the same Dialog-above-640px / Drawer-below
 * shell the other modals use.
 *
 * The form is mounted only while a visit is selected, so the reason field
 * starts empty every time rather than carrying over from the last row.
 */
export function VoidVisitModal({ visit, onOpenChange, onConfirm }: VoidVisitModalProps) {
  const isDesktop = useMediaQuery("(min-width: 640px)");

  if (isDesktop === null) return null;

  const title = "Void this visit?";
  const description = "It stops counting towards the day's totals and the printed report.";
  const body = visit ? (
    <VoidVisitForm visit={visit} onConfirm={onConfirm} onCancel={() => onOpenChange(false)} />
  ) : null;

  if (isDesktop) {
    return (
      <Dialog open={visit !== null} onOpenChange={onOpenChange}>
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
    <Drawer open={visit !== null} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh] px-4 pb-2">
        <DrawerHeader className="px-0 pt-2">
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>
        {body}
      </DrawerContent>
    </Drawer>
  );
}
