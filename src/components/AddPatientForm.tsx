import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Phone,
  Loader2,
  Check,
  AlertCircle,
  User,
  MapPin,
  Stethoscope,
  Pill,
  CalendarDays,
  Hash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShiftToggle } from "./ShiftToggle";
import { WeeksStepper } from "./WeeksStepper";
import { usePatientCodeLookup, usePatientLookup } from "@/hooks/usePatientLookup";
import { cn } from "@/lib/utils";
import { MEDICINE, PHONE_INVALID_MESSAGE, PHONE_REGEX } from "@/lib/constants";
import {
  computeFee,
  computeMedicineFee,
  formatClinicDateLong,
  formatCurrency,
  isValidPhone,
  todayInClinicTz,
  type PatientFormData,
  type Shift,
  type Visit,
  type VisitDraft,
} from "@/lib/types";

/** "new" is the everyday desk flow; "old" bills an unknown phone as returning. */
export type AddPatientMode = "new" | "old";

const NAME_MIN = 2;
const ADDRESS_MIN = 2;

const patientSchema = z.object({
  phone: z.string().min(1, "Phone is required").regex(PHONE_REGEX, PHONE_INVALID_MESSAGE),
  name: z.string().min(NAME_MIN, `Name must be at least ${NAME_MIN} characters`),
  address: z.string().min(ADDRESS_MIN, `Address must be at least ${ADDRESS_MIN} characters`),
  shift: z.enum(["morning", "evening"], { message: "Select a shift" }),
  medicineWeeks: z.number().int().min(0).max(MEDICINE.maxWeeks),
});

interface AddPatientFormProps {
  /** Called exactly once per submit with the raw draft. The server assigns id/fee. */
  onSubmit: (draft: VisitDraft) => Promise<void>;
  onCancel: () => void;
  /** Visits already logged for the selected day, for the repeat-visit warning. */
  todaysVisits?: Visit[];
  mode?: AddPatientMode;
  /**
   * Held by the modal, not here, so "+ Add Another" keeps the chosen date while
   * this form is unmounted and remounted empty. Only used in old mode.
   */
  visitDate?: string;
  onVisitDateChange?: (date: string) => void;
}

export function AddPatientForm({
  onSubmit,
  onCancel,
  todaysVisits,
  mode = "new",
  visitDate = "",
  onVisitDateChange,
}: AddPatientFormProps) {
  const isOldMode = mode === "old";
  const today = todayInClinicTz();
  // Only a date strictly before today backdates anything; today is just today.
  const isBackdating = isOldMode && !!visitDate && visitDate < today;
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = useForm<PatientFormData>({
    resolver: zodResolver(patientSchema),
    // Surface errors as soon as a field is left, not only on submit — the Submit
    // button is disabled while invalid, so an onSubmit-only mode showed nothing.
    mode: "onTouched",
    defaultValues: {
      phone: "",
      name: "",
      address: "",
      shift: undefined as unknown as Shift,
      // Fully optional: 0 means no medicine, and submitting without touching
      // the stepper behaves exactly as before this field existed.
      medicineWeeks: 0,
    },
  });

  const { phone, name, address, shift, medicineWeeks } = form.watch();
  const phoneIsValid = isValidPhone(phone ?? "");

  // One phone = one person: the lookup resolves to a single patient or nobody.
  const { match, isLoading: lookupLoading } = usePatientLookup(phone ?? "");

  // The optional ID shortcut, regular mode only. Deliberately NOT part of the
  // form schema: it is never submitted and never reaches the server as part of
  // a visit — it only fills the phone number in, and the phone takes over from
  // there exactly as if it had been typed by hand.
  const [patientCode, setPatientCode] = useState("");
  const codeLookup = usePatientCodeLookup(isOldMode ? "" : patientCode);
  // The same verdict the server will reach: a known phone is always returning,
  // and in old mode an unknown one is billed as returning too. Both sides run
  // computeFee/computeMedicineFee, so the quote matches what gets stored.
  const isNewPatient = !match && !isOldMode;
  const appointmentFee = computeFee(isNewPatient);
  // Recomputed on every render, so it follows both the stepper and the
  // new/returning status as the phone lookup resolves.
  // A backdated visit must not rewrite a known patient's current details, so the
  // fields are shown but not editable. Clearing the date unlocks them again.
  const identityLocked = isBackdating && !!match;
  const weeks = medicineWeeks ?? 0;
  const medicineFee = computeMedicineFee(weeks, isNewPatient);
  const total = appointmentFee + medicineFee;

  // An ID match fills the phone in, which hands control straight to the phone
  // lookup below. Applied once per distinct match, tracked by code: without that
  // guard, re-running this effect would overwrite a phone the operator had since
  // corrected by hand.
  const appliedCode = useRef<string | null>(null);
  useEffect(() => {
    const found = codeLookup.match;
    if (!found) {
      if (!codeLookup.isLoading && !codeLookup.searched) appliedCode.current = null;
      return;
    }
    if (appliedCode.current === found.code) return;
    appliedCode.current = found.code;

    // Name and address are set here too so the fill is immediate rather than
    // waiting on a second round-trip; the phone lookup then sets the same
    // values again, which is harmless.
    form.setValue("phone", found.phone, { shouldValidate: true });
    form.setValue("name", found.name, { shouldValidate: true });
    form.setValue("address", found.address, { shouldValidate: true });
  }, [codeLookup.match, codeLookup.isLoading, codeLookup.searched, form]);

  // Auto-fill from the matched record; clear those fields again if the operator
  // edits the phone away from a match, so one patient's details never ride along
  // onto a different number.
  const autofilledFor = useRef<string | null>(null);
  useEffect(() => {
    if (match) {
      form.setValue("name", match.name, { shouldValidate: true });
      form.setValue("address", match.address, { shouldValidate: true });
      autofilledFor.current = match.code;
    } else if (autofilledFor.current) {
      form.setValue("name", "", { shouldValidate: false });
      form.setValue("address", "", { shouldValidate: false });
      autofilledFor.current = null;
    }
  }, [match, form]);

  // Autofocus phone after animation frame.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById("add-patient-phone") as HTMLInputElement | null;
      el?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // A returning patient is the normal case, so only warn about a repeat visit
  // already logged for the same phone on the day being viewed. The rows handed in
  // are already scoped to that date by the server, so no local-time check here.
  //
  // Backdating deliberately skips the warning: the rows on hand belong to the
  // day on screen, not to the chosen past date, so they cannot answer whether
  // that phone was already seen then. Checking properly would need a query the
  // client does not have, and a warning about the wrong day is worse than none.
  const alreadyLoggedToday =
    !isBackdating && phoneIsValid && !!todaysVisits?.some((v) => v.phone === phone);

  // What still blocks Submit, in the same order as the fields.
  const missing: string[] = [];
  if (!phoneIsValid) missing.push("valid phone");
  if ((name ?? "").trim().length < NAME_MIN) missing.push("name");
  if ((address ?? "").trim().length < ADDRESS_MIN) missing.push("address");
  if (!shift) missing.push("shift");

  const canSubmit = missing.length === 0 && !form.formState.isSubmitting;
  // Once anything has been touched (or a submit was attempted), unset fields
  // read as errors rather than as neutral not-yet-filled state.
  const attempted =
    form.formState.isSubmitted || Object.keys(form.formState.touchedFields).length > 0;

  // Submits exactly once. The phone alone determines identity; the server assigns
  // the code, fee, isNewPatient and timestamp.
  const handleSubmit = form.handleSubmit(async (data) => {
    setSubmitError(null);
    try {
      await onSubmit({
        phone: data.phone,
        name: data.name,
        address: data.address,
        shift: data.shift,
        medicineWeeks: data.medicineWeeks ?? 0,
        // Sent only in old mode. The server rejects a visitDate without this
        // flag, so the regular dialog can never backdate even if tampered with.
        ...(isOldMode
          ? { asOldPatient: true, ...(visitDate ? { visitDate } : {}) }
          : {}),
      });
    } catch (err) {
      setSubmitError(
        err instanceof Error && err.message
          ? err.message
          : "Could not save this visit. Please try again.",
      );
    }
  });

  return (
    <form id="add-patient-form" onSubmit={handleSubmit} className="space-y-4">
      {/* Patient ID — regular mode only, and purely a shortcut to the phone
          number. Never autofocused: the phone field keeps that, because typing
          a number is still the normal way in. */}
      {!isOldMode && (
        <div className="space-y-1.5">
          <Label htmlFor="add-patient-code" className="text-sm font-medium">
            <Hash className="mr-1 inline" size={14} /> Patient ID (optional)
          </Label>
          <div className="relative">
            <Input
              id="add-patient-code"
              inputMode="numeric"
              placeholder="PT-000042"
              maxLength={20}
              value={patientCode}
              onChange={(e) => setPatientCode(e.target.value)}
              className="h-12 pr-10 text-base"
            />
            {/* Same spinner/tick language as the phone field. */}
            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
              {codeLookup.isLoading ? (
                <Loader2 className="animate-spin text-muted-foreground" size={18} />
              ) : codeLookup.match ? (
                <Check className="text-teal" size={18} />
              ) : null}
            </div>
          </div>
          {codeLookup.searched && !codeLookup.isLoading && !codeLookup.match ? (
            <p className="text-xs text-destructive">No patient found with this ID.</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Know their ID? Enter it to pull up their info.
            </p>
          )}
        </div>
      )}

      {/* Phone */}
      <div className="space-y-1.5">
        <Label htmlFor="add-patient-phone" className="text-sm font-medium">
          Phone
        </Label>
        <div className="relative">
          <Phone className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
          <Input
            id="add-patient-phone"
            type="tel"
            inputMode="numeric"
            placeholder="01XXXXXXXXX"
            maxLength={11}
            className="h-12 pl-10 text-base"
            {...form.register("phone")}
          />
          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
            {!phoneIsValid ? null : lookupLoading ? (
              <Loader2 className="animate-spin text-muted-foreground" size={18} />
            ) : match ? (
              <Check className="text-teal" size={18} />
            ) : (
              <span className="text-xs text-muted-foreground">New</span>
            )}
          </div>
        </div>
        {form.formState.errors.phone && (
          <p className="text-xs text-destructive">{form.formState.errors.phone.message}</p>
        )}
      </div>

      {/* Name */}
      <div className="space-y-1.5">
        <Label htmlFor="add-patient-name" className="text-sm font-medium">
          <User className="mr-1 inline" size={14} /> Name
        </Label>
        <Input
          id="add-patient-name"
          placeholder="Patient name"
          readOnly={identityLocked}
          className={cn("h-12 text-base", identityLocked && "bg-muted text-muted-foreground")}
          {...form.register("name")}
        />
        {form.formState.errors.name && (
          <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
        )}
      </div>

      {/* Address */}
      <div className="space-y-1.5">
        <Label htmlFor="add-patient-address" className="text-sm font-medium">
          <MapPin className="mr-1 inline" size={14} /> Address
        </Label>
        <Input
          id="add-patient-address"
          placeholder="Patient address"
          readOnly={identityLocked}
          className={cn("h-12 text-base", identityLocked && "bg-muted text-muted-foreground")}
          {...form.register("address")}
        />
        {form.formState.errors.address && (
          <p className="text-xs text-destructive">{form.formState.errors.address.message}</p>
        )}
      </div>

      {/* Shift */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">
          <Stethoscope className="mr-1 inline" size={14} /> Shift
        </Label>
        <ShiftToggle
          mode="input"
          value={shift || "all"}
          onChange={(v) => form.setValue("shift", v === "all" ? (undefined as unknown as Shift) : v, { shouldValidate: true })}
          size="md"
          invalid={attempted && !shift}
        />
      </div>

      {identityLocked && (
        <p className="-mt-2 text-xs text-muted-foreground">
          Existing patient. Details are not changed by backdated entries.
        </p>
      )}

      {/* Visit date — old mode only. The regular flow has no date field at all
          and therefore cannot backdate. */}
      {isOldMode && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="add-patient-visit-date" className="text-sm font-medium">
              <CalendarDays className="mr-1 inline" size={14} /> Visit date (optional)
            </Label>
            {visitDate && (
              <button
                type="button"
                onClick={() => onVisitDateChange?.("")}
                className="h-8 rounded-md px-2 text-xs font-medium text-primary hover:bg-muted"
              >
                Use today
              </button>
            )}
          </div>
          <input
            id="add-patient-visit-date"
            type="date"
            value={visitDate}
            max={today}
            onChange={(e) => onVisitDateChange?.(e.target.value)}
            className="h-12 w-full rounded-lg border border-input bg-card px-3 text-base shadow-sm transition-colors focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground">
            {isBackdating
              ? `Will be recorded on ${formatClinicDateLong(visitDate)} (backdated)`
              : "Will be recorded as today's visit."}
          </p>
          {!visitDate && (
            <p className="text-xs text-muted-foreground">Leave empty for today.</p>
          )}
        </div>
      )}

      {/* Weeks of medicine */}
      <div className="space-y-1.5">
        <Label htmlFor="add-patient-weeks" className="text-sm font-medium">
          <Pill className="mr-1 inline" size={14} /> Weeks of medicine
        </Label>
        <WeeksStepper
          id="add-patient-weeks"
          value={weeks}
          onChange={(w) => form.setValue("medicineWeeks", w, { shouldValidate: true })}
        />
      </div>

      {/* Repeat-visit-today warning */}
      {alreadyLoggedToday && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-2.5 text-sm text-destructive">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>This phone is already in today’s list. Please confirm before submitting.</span>
        </div>
      )}

      {/* Identity + fee readout */}
      <div className="rounded-lg border border-border bg-muted/40 p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {match
              ? `Returning · ${match.code}`
              : isOldMode
                ? "Old patient (will be registered)"
                : "New patient"}
          </span>
          <span className="text-lg font-bold text-primary">{formatCurrency(total)}</span>
        </div>
        {weeks > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            Appointment {formatCurrency(appointmentFee)} + Medicine ({weeks} wk
            {weeks === 1 ? "" : "s"}) {formatCurrency(medicineFee)} ={" "}
            {formatCurrency(total)}
            {isNewPatient && " · first week free"}
          </p>
        )}
      </div>

      {/* Footer buttons */}
      <div className="sticky bottom-0 z-10 -mx-4 mt-4 border-t border-border bg-card px-4 pt-4 safe-bottom md:static md:mx-0 md:bg-transparent md:px-0 md:pt-0">
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel} className="h-12 flex-1">
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={!canSubmit}
            className="h-12 flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {form.formState.isSubmitting ? (
              <>
                <Loader2 className="mr-2 animate-spin" size={18} /> Saving…
              </>
            ) : (
              "Submit"
            )}
          </Button>
        </div>
        {submitError && (
          <div className="mt-2 flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-2.5 text-sm text-destructive">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{submitError}</span>
          </div>
        )}
        {missing.length > 0 && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Needed: {missing.join(", ")}
          </p>
        )}
        {/* "+ Add Another" lives on the confirmation panel in AddPatientModal — it
            resets the form rather than submitting, so it is deliberately not here. */}
      </div>
    </form>
  );
}
