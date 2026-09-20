import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Phone, Loader2, Check, AlertCircle, User, MapPin, Stethoscope, Pill } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShiftToggle } from "./ShiftToggle";
import { WeeksStepper } from "./WeeksStepper";
import { usePatientLookup } from "@/hooks/usePatientLookup";
import { MEDICINE, PHONE_INVALID_MESSAGE, PHONE_REGEX } from "@/lib/constants";
import {
  computeFee,
  computeMedicineFee,
  formatCurrency,
  isValidPhone,
  type PatientFormData,
  type Shift,
  type Visit,
  type VisitDraft,
} from "@/lib/types";

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
}

export function AddPatientForm({ onSubmit, onCancel, todaysVisits }: AddPatientFormProps) {
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
  const isNewPatient = !match;
  const appointmentFee = computeFee(isNewPatient);
  // Recomputed on every render, so it follows both the stepper and the
  // new/returning status as the phone lookup resolves.
  const weeks = medicineWeeks ?? 0;
  const medicineFee = computeMedicineFee(weeks, isNewPatient);
  const total = appointmentFee + medicineFee;

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
  const alreadyLoggedToday =
    phoneIsValid && !!todaysVisits?.some((v) => v.phone === phone);

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
          className="h-12 text-base"
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
          className="h-12 text-base"
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
            {match ? `Returning · ${match.code}` : "New patient"}
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
