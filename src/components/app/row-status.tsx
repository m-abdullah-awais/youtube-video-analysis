import { AlertTriangle, Check, CircleDashed, CopyIcon, Loader2, MinusCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { JobRow } from "@/lib/jobs/repo";

type Look = { label: string; className: string; Icon: typeof Check; spin?: boolean };

const LOOKS: Record<JobRow["status"], Look> = {
  pending: { label: "Waiting", className: "bg-muted text-muted-foreground", Icon: CircleDashed },
  running: { label: "Summarizing", className: "bg-info-soft text-info", Icon: Loader2, spin: true },
  done: { label: "Done", className: "bg-success-soft text-success", Icon: Check },
  failed: { label: "Failed", className: "bg-danger-soft text-destructive", Icon: XCircle },
  filled: { label: "Kept existing", className: "bg-secondary text-muted-foreground", Icon: MinusCircle },
  invalid: { label: "Not a video link", className: "bg-warning-soft text-warning", Icon: AlertTriangle },
  duplicate: { label: "Repeat", className: "bg-secondary text-muted-foreground", Icon: CopyIcon },
};

export function RowStatus({ status, paused }: { status: JobRow["status"]; paused?: boolean }) {
  const look = status === "running" && paused ? { ...LOOKS.running, label: "Sent, paused", spin: false } : LOOKS[status];
  const { Icon } = look;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        look.className,
      )}
    >
      <Icon aria-hidden className={cn("size-3.5", look.spin && "animate-spin")} />
      {look.label}
    </span>
  );
}
