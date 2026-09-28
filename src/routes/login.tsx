import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Lock, Loader2, User2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";

// One shared credential for the whole clinic: no username to ask for, and no
// identity step after it — signing in lands straight on the homepage.
const loginSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Login — HealthLink" },
      { name: "description", content: "Sign in to the HealthLink clinic management system." },
    ],
  }),
});

function LoginPage() {
  // Mirror of HomePage: all hooks run unconditionally, above the auth gate.
  const { isAuthenticated, isLoading: authLoading, login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { password: "" },
  });

  // Send an already-authenticated visitor home from an effect, not during render.
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate({ to: "/", replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);

  const onSubmit = form.handleSubmit(async (data) => {
    setError(null);
    try {
      await login(data.password);
      navigate({ to: "/", replace: true });
    } catch {
      // Deliberately generic: the server never distinguishes a wrong password
      // from no password having been configured yet.
      setError("Incorrect password.");
      form.resetField("password");
    }
  });

  if (authLoading || isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-lg">
        <div className="mb-6 flex items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <User2 size={32} />
          </div>
        </div>
        <h1 className="text-center text-2xl font-bold tracking-tight text-foreground">HealthLink</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">Doctor-Patient Accountability System</p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-sm font-medium">
              <Lock className="mr-1 inline" size={14} /> Clinic password
            </Label>
            <Input
              id="password"
              type="password"
              autoFocus
              autoComplete="current-password"
              placeholder="••••••••"
              className="h-12 text-base"
              {...form.register("password")}
            />
            {form.formState.errors.password && (
              <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
            )}
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}

          <Button
            type="submit"
            disabled={form.formState.isSubmitting}
            className="h-12 w-full bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {form.formState.isSubmitting ? (
              <>
                <Loader2 className="mr-2 animate-spin" size={18} /> Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </Button>
        </form>

      </div>
    </div>
  );
}
