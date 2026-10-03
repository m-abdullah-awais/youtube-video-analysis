"use client";

import { useI18n } from "@/lib/i18n/provider";
import { describeFailure } from "@/lib/vidiq/describe";

/** A failed video, explained in plain words with what to do next; vidIQ's own text is kept for reference. */
export function FailureNote({ message }: { message: string }) {
  const { t } = useI18n();
  const { reason, refunded } = describeFailure(message);
  const copy = t.failures[reason];
  return (
    <span className="block space-y-0.5">
      <span className="block font-medium text-destructive">{copy.title}</span>
      <span className="block text-muted-foreground">
        {copy.hint}
        {refunded ? ` ${t.run.refunded}` : ""}
      </span>
      {message && reason === "unknown" && (
        <span className="block text-xs text-muted-foreground/80">{t.run.vidiqSaid(message)}</span>
      )}
    </span>
  );
}
