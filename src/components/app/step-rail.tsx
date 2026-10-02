import { Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepId = "connect" | "upload" | "configure" | "run";

export type StepState = { id: StepId; label: string; hint: string; done: boolean; locked: boolean };

/** The four steps, in order. On small screens it collapses to a compact row. */
export function StepRail({
  steps,
  active,
  onSelect,
}: {
  steps: StepState[];
  active: StepId;
  onSelect: (id: StepId) => void;
}) {
  return (
    <nav aria-label="Steps">
      <ol className="grid grid-cols-4 gap-1 lg:grid-cols-1 lg:gap-0.5">
        {steps.map((step, i) => {
          const current = step.id === active;
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => onSelect(step.id)}
                disabled={step.locked}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "group flex w-full flex-col items-center gap-1.5 rounded-md px-1 py-2 text-center outline-none transition-colors sm:flex-row sm:gap-3 sm:px-2 sm:text-left lg:px-3 lg:py-2.5",
                  "focus-visible:ring-2 focus-visible:ring-primary",
                  current ? "bg-card shadow-sm ring-2 ring-primary" : "hover:bg-card/70",
                  step.locked && "cursor-not-allowed opacity-55 hover:bg-transparent",
                )}
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    step.done
                      ? "bg-primary text-primary-foreground"
                      : current
                        ? "bg-accent text-accent-foreground ring-1 ring-primary"
                        : "bg-background text-muted-foreground ring-1 ring-border",
                  )}
                >
                  {step.done ? <Check className="size-3.5" aria-hidden /> : step.locked ? <Lock className="size-3" aria-hidden /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className={cn("block text-xs sm:text-sm", current ? "font-semibold" : "font-medium")}>{step.label}</span>
                  <span className="hidden truncate text-xs text-muted-foreground lg:block">{step.hint}</span>
                </span>
                <span className="sr-only">
                  {step.done ? ", done" : step.locked ? ", not available yet" : current ? ", current step" : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
