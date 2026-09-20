import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { User2, Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
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
  const { user, isLoading: authLoading, login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  // Send an already-authenticated visitor home from an effect, not during render.
  useEffect(() => {
    if (!authLoading && user) {
      navigate({ to: "/", replace: true });
    }
  }, [authLoading, user, navigate]);

  const onSubmit = form.handleSubmit(async (data) => {
    setError(null);
    const found = await login(data.username, data.password);
    if (found) {
      navigate({ to: "/", replace: true });
    } else {
      setError("Invalid username or password.");
    }
  });

  if (authLoading || user) {
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
            <Label htmlFor="username" className="text-sm font-medium">
              <User2 className="mr-1 inline" size={14} /> Username
            </Label>
            <Input
              id="username"
              autoFocus
              placeholder="doctor or receptionist"
              className="h-12 text-base"
              {...form.register("username")}
            />
            {form.formState.errors.username && (
              <p className="text-xs text-destructive">{form.formState.errors.username.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-sm font-medium">
              <Lock className="mr-1 inline" size={14} /> Password
            </Label>
            <Input
              id="password"
              type="password"
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

        <div className="mt-6 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Demo credentials</p>
          <p>Username: <span className="font-mono text-foreground">receptionist</span>, Password: <span className="font-mono text-foreground">receptionist123</span></p>
          <p>Username: <span className="font-mono text-foreground">doctor</span>, Password: <span className="font-mono text-foreground">doctor123</span></p>
        </div>
      </div>
    </div>
  );
}
