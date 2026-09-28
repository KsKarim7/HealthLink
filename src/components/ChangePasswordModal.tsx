import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertCircle, Eye, EyeOff, Loader2, Lock } from "lucide-react";
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
import { changePassword } from "@/lib/auth.server";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/password.js";

/**
 * The same rules the server enforces, so the desk is told what is wrong before
 * a round-trip rather than after one. The server re-checks all of it — this is
 * feedback, not a gate.
 */
const schema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
      .max(MAX_PASSWORD_LENGTH, `Keep it under ${MAX_PASSWORD_LENGTH} characters.`),
    confirmPassword: z.string().min(1, "Repeat the new password."),
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    message: "The new password must be different from the current one.",
    path: ["newPassword"],
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "The two new passwords do not match.",
    path: ["confirmPassword"],
  });

type FormData = z.infer<typeof schema>;

interface ChangePasswordModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once the server has accepted the change. */
  onChanged: () => void;
}

/** A password field with its own show/hide toggle. */
function PasswordField({
  id,
  label,
  autoComplete,
  autoFocus,
  error,
  register,
}: {
  id: string;
  label: string;
  autoComplete: "current-password" | "new-password";
  autoFocus?: boolean;
  error?: string;
  register: ReturnType<ReturnType<typeof useForm<FormData>>["register"]>;
}) {
  const [shown, setShown] = useState(false);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium">
        <Lock className="mr-1 inline" size={14} /> {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type={shown ? "text" : "password"}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          maxLength={MAX_PASSWORD_LENGTH}
          className="h-12 pr-12 text-base"
          {...register}
        />
        {/* 44px target, always visible — never a hover-only affordance. */}
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={shown}
          className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
        >
          {shown ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function ChangePasswordForm({
  onChanged,
  onCancel,
}: {
  onChanged: () => void;
  onCancel: () => void;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    // Matches AddPatientForm: errors appear as a field is left, not only on
    // submit, since Submit is disabled while the form is invalid.
    mode: "onTouched",
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const { currentPassword, newPassword, confirmPassword } = form.watch();

  // What still blocks Submit, in field order — the same "Needed:" line the
  // Add Patient form uses.
  const missing: string[] = [];
  if (!currentPassword) missing.push("current password");
  if ((newPassword ?? "").length < MIN_PASSWORD_LENGTH)
    missing.push(`new password (${MIN_PASSWORD_LENGTH}+ characters)`);
  else if (newPassword === currentPassword) missing.push("a different new password");
  if (!confirmPassword) missing.push("confirmation");
  else if (newPassword !== confirmPassword) missing.push("matching confirmation");

  const canSubmit = missing.length === 0 && !form.formState.isSubmitting;

  const handleSubmit = form.handleSubmit(async (data) => {
    setSubmitError(null);
    try {
      await changePassword({
        data: { currentPassword: data.currentPassword, newPassword: data.newPassword },
      });
      form.reset();
      onChanged();
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Could not change the password. Please try again.";
      // A wrong current password belongs on that field, with everything else
      // left as typed so only the one entry has to be redone.
      if (/current password is incorrect/i.test(message)) {
        form.setError("currentPassword", { message });
        form.setFocus("currentPassword");
      } else {
        setSubmitError(message);
      }
    }
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PasswordField
        id="current-password"
        label="Current password"
        autoComplete="current-password"
        autoFocus
        error={form.formState.errors.currentPassword?.message}
        register={form.register("currentPassword")}
      />
      <PasswordField
        id="new-password"
        label="New password"
        autoComplete="new-password"
        error={form.formState.errors.newPassword?.message}
        register={form.register("newPassword")}
      />
      <PasswordField
        id="confirm-password"
        label="Confirm new password"
        autoComplete="new-password"
        error={form.formState.errors.confirmPassword?.message}
        register={form.register("confirmPassword")}
      />

      <p className="text-xs text-muted-foreground">
        Everyone else is signed out when the password changes. This device stays signed in.
      </p>

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
                <Loader2 className="mr-2 animate-spin" size={18} /> Changing…
              </>
            ) : (
              "Change password"
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
      </div>
    </form>
  );
}

/**
 * Change password, in the same Dialog-above-640px / Drawer-below shell the Add
 * Patient modal uses.
 *
 * The form is mounted only while the dialog is open, so closing it discards
 * every typed character rather than leaving passwords sitting in component
 * state behind a hidden panel.
 */
export function ChangePasswordModal({ open, onOpenChange, onChanged }: ChangePasswordModalProps) {
  const isDesktop = useMediaQuery("(min-width: 640px)");
  const [mountKey, setMountKey] = useState(0);

  // Remount the form on every open, so fields are always empty even if the
  // browser or a password manager left values behind.
  useEffect(() => {
    if (!open) setMountKey((k) => k + 1);
  }, [open]);

  const title = "Change password";
  const description = "Enter the current shared password, then the new one twice.";

  if (isDesktop === null) return null;

  const body = (
    <ChangePasswordForm
      key={mountKey}
      onChanged={onChanged}
      onCancel={() => onOpenChange(false)}
    />
  );

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
