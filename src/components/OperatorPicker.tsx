import { useEffect, useState } from "react";
import { Check, Loader2, User2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listOperators } from "@/lib/auth.server";
import { cn } from "@/lib/utils";
import type { OperatorOption } from "@/lib/auth";

interface OperatorPickerProps {
  /** Highlighted as the current choice; null on the first pick after signing in. */
  current: OperatorOption | null;
  onSelect: (operatorId: number) => Promise<void>;
  /** Only supplied when switching — there is nothing to go back to on first pick. */
  onCancel?: () => void;
}

/**
 * "Who is at the desk?" — shown full-screen after signing in, and again whenever
 * someone taps Switch.
 *
 * This is the only way an operator is ever chosen. The selection is written into
 * the server-side session by `selectOperator`; this component just shows the
 * roster and reports which button was pressed.
 */
export function OperatorPicker({ current, onSelect, onCancel }: OperatorPickerProps) {
  const [operators, setOperators] = useState<OperatorOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    listOperators()
      .then((rows) => {
        if (!cancelled) setOperators(rows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setOperators([]);
        setError(err instanceof Error ? err.message : "Could not load the operator list.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const choose = async (operatorId: number) => {
    setPendingId(operatorId);
    setError(null);
    try {
      await onSelect(operatorId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that choice.");
      setPendingId(null);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-lg">
        <div className="mb-6 flex items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <User2 size={32} />
          </div>
        </div>

        <h1 className="text-center text-2xl font-bold tracking-tight text-foreground">
          Who's at the desk?
        </h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          Every visit you record is signed with this name.
        </p>

        <div className="mt-8 space-y-3">
          {operators === null ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading names…</p>
          ) : operators.length === 0 && !error ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No active operators are set up yet.
            </p>
          ) : (
            operators.map((operator) => {
              const isCurrent = current?.id === operator.id;
              return (
                <button
                  key={operator.id}
                  type="button"
                  disabled={pendingId !== null}
                  onClick={() => void choose(operator.id)}
                  className={cn(
                    // Full-width, 56px tall: a reliable target on the desk tablet.
                    "flex h-14 w-full items-center justify-between rounded-lg border px-4 text-base font-medium transition-colors disabled:opacity-60",
                    isCurrent
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-input bg-card text-foreground hover:bg-muted",
                  )}
                >
                  <span>{operator.displayName}</span>
                  {pendingId === operator.id ? (
                    <Loader2 className="animate-spin text-muted-foreground" size={18} />
                  ) : isCurrent ? (
                    <Check className="text-primary" size={18} />
                  ) : null}
                </button>
              );
            })
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={pendingId !== null}
            className="mt-6 h-11 w-full"
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
