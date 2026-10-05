"use client";

import { AlertTriangle, Check, CircleDashed, CircleOff, CopyIcon, Loader2, MinusCircle, XCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import type { JobRow } from "@/lib/jobs/repo";
import { cn } from "@/lib/utils";

type Look = { className: string; Icon: typeof Check; spin?: boolean };

const LOOKS: Record<JobRow["status"], Look> = {
  pending: { className: "bg-muted text-muted-foreground", Icon: CircleDashed },
  running: { className: "bg-info-soft text-info", Icon: Loader2, spin: true },
  done: { className: "bg-success-soft text-success", Icon: Check },
  failed: { className: "bg-danger-soft text-destructive", Icon: XCircle },
  filled: { className: "bg-secondary text-muted-foreground", Icon: MinusCircle },
  invalid: { className: "bg-warning-soft text-warning", Icon: AlertTriangle },
  duplicate: { className: "bg-secondary text-muted-foreground", Icon: CopyIcon },
  excluded: { className: "bg-transparent text-muted-foreground ring-1 ring-border ring-inset", Icon: CircleOff },
};

export function RowStatus({ status, paused }: { status: JobRow["status"]; paused?: boolean }) {
  const { t } = useI18n();
  const sentPaused = status === "running" && paused;
  const look = LOOKS[status];
  const { Icon } = look;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        look.className,
      )}
    >
      <Icon aria-hidden className={cn("size-3.5", look.spin && !sentPaused && "animate-spin")} />
      {sentPaused ? t.status.sentPaused : t.status[status]}
    </span>
  );
}
