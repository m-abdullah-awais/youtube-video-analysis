"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, ExternalLink, Loader2, Pause, Play, RotateCcw, Upload } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, errorMessage, type JobSummary, type VidiqStatus } from "@/lib/client/api";
import { displayRow, formatDuration, formatNumber, plural } from "@/lib/client/format";
import type { JobRow } from "@/lib/jobs/repo";
import { cn } from "@/lib/utils";
import { PanelHeader } from "./panel-header";
import { RowStatus } from "./row-status";

type Filter = "all" | "done" | "working" | "failed" | "skipped";

const FILTERS: { id: Filter; label: string; match: (r: JobRow) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  { id: "done", label: "Done", match: (r) => r.status === "done" },
  { id: "working", label: "In progress", match: (r) => r.status === "pending" || r.status === "running" || r.status === "duplicate" },
  { id: "failed", label: "Failed", match: (r) => r.status === "failed" },
  { id: "skipped", label: "Skipped", match: (r) => r.status === "filled" || r.status === "invalid" },
];

const PAGE = 100;

type Props = {
  summary: JobSummary;
  vidiq: VidiqStatus | null;
  onSummary: (summary: JobSummary) => void;
  onNewRun: () => void;
  onConnect: () => void;
};

export function RunPanel({ summary, vidiq, onSummary, onNewRun, onConnect }: Props) {
  const { job, rows, counts } = summary;
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(PAGE);
  const [busy, setBusy] = useState<"pause" | "resume" | "retry" | number | null>(null);
  const [open, setOpen] = useState<JobRow | null>(null);
  const fresh = useFreshlyDone(rows);

  const act = async (kind: NonNullable<typeof busy>, call: () => Promise<JobSummary>, success?: string) => {
    setBusy(kind);
    try {
      onSummary(await call());
      if (success) toast.success(success);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const running = job.status === "running";
  const paused = job.status === "paused";
  const finished = job.status === "completed";
  const target = counts.pending + counts.running + counts.done + counts.failed + counts.duplicate;
  const percent = target ? Math.round((counts.done / target) * 100) : 100;
  const eta = useEta(summary);
  const visible = useMemo(() => rows.filter(FILTERS.find((f) => f.id === filter)!.match), [rows, filter]);
  const connected = vidiq?.connection.status === "connected";

  const title = finished
    ? counts.failed > 0
      ? "Finished with some failures"
      : "All summaries are ready"
    : paused
      ? "Summaries paused"
      : "Writing summaries";

  return (
    <section aria-labelledby="run-title" className="space-y-6">
      <PanelHeader
        id="run-title"
        title={title}
        description={<span className="font-medium text-foreground">{job.fileName}</span>}
        actions={
          <>
            {running && (
              <Button variant="outline" onClick={() => act("pause", () => api.pause(job.id))} disabled={busy === "pause"}>
                <Pause aria-hidden />
                Pause
              </Button>
            )}
            {paused && counts.pending + counts.running > 0 && (
              <Button
                onClick={() => act("resume", () => api.start(job.id), "Summaries resumed")}
                disabled={busy === "resume" || !connected}
              >
                {busy === "resume" ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />}
                Resume
              </Button>
            )}
            {counts.failed > 0 && !running && (
              <Button
                variant="outline"
                onClick={() => act("retry", () => api.retry(job.id), `Retrying ${plural(counts.failed, "video")}`)}
                disabled={busy === "retry" || !connected}
              >
                <RotateCcw aria-hidden />
                Retry failed ({formatNumber(counts.failed)})
              </Button>
            )}
            <Button
              variant={finished ? "default" : "outline"}
              render={<a href={api.downloadUrl(job.id)} download />}
              nativeButton={false}
            >
              <Download aria-hidden />
              {finished ? "Download spreadsheet" : "Download progress so far"}
            </Button>
          </>
        }
      />

      {paused && job.pauseReason === "credits" && (
        <Alert className="border-warning/40 bg-warning-soft">
          <AlertTitle>Out of vidIQ credits</AlertTitle>
          <AlertDescription>
            Add credits in your vidIQ account, then resume. Finished summaries are saved, and the remaining{" "}
            {plural(counts.pending + counts.running, "video")} will pick up where they stopped.
          </AlertDescription>
        </Alert>
      )}
      {paused && job.pauseReason === "auth" && (
        <Alert className="border-warning/40 bg-warning-soft">
          <AlertTitle>vidIQ needs you to sign in again</AlertTitle>
          <AlertDescription>Connect vidIQ again, then resume. Nothing finished so far is lost.</AlertDescription>
          <AlertAction>
            <Button size="sm" onClick={onConnect}>
              Connect vidIQ
            </Button>
          </AlertAction>
        </Alert>
      )}
      {paused && job.pauseReason === "user" && counts.running > 0 && (
        <Alert>
          <AlertTitle>Paused</AlertTitle>
          <AlertDescription>
            {plural(counts.running, "video was", "videos were")} already sent to vidIQ. Their summaries are collected when
            you resume, without using more credits.
          </AlertDescription>
        </Alert>
      )}
      {!connected && running && (
        <Alert className="border-warning/40 bg-warning-soft">
          <AlertTitle>vidIQ is not connected</AlertTitle>
          <AlertDescription>The run will pause until you connect again.</AlertDescription>
        </Alert>
      )}

      <div className="rounded-lg border bg-card p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <p className="text-4xl font-semibold tracking-tight">
            {formatNumber(counts.done)}
            <span className="text-lg font-normal text-muted-foreground"> of {formatNumber(target)} done</span>
          </p>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {running && eta ? `About ${eta} left` : running ? "Starting" : paused ? "Paused" : "Finished"}
          </p>
        </div>
        <div
          role="progressbar"
          aria-label="Summaries finished"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="mt-4 h-2 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out" style={{ width: `${percent}%` }} />
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <Stat label="In progress" value={counts.running} tone="text-info" />
          <Stat label="Waiting" value={counts.pending + counts.duplicate} />
          <Stat label="Failed" value={counts.failed} tone={counts.failed ? "text-destructive" : undefined} />
          <Stat label="Skipped" value={counts.filled + counts.invalid} />
        </dl>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Filter rows">
            {FILTERS.map((f) => {
              const count = rows.filter(f.match).length;
              return (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={filter === f.id}
                  onClick={() => {
                    setFilter(f.id);
                    setLimit(PAGE);
                  }}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    filter === f.id ? "bg-card font-medium shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f.label} <span className="text-muted-foreground">{formatNumber(count)}</span>
                </button>
              );
            })}
          </div>
          {finished && (
            <Button variant="ghost" onClick={onNewRun}>
              <Upload aria-hidden />
              Start a new run
            </Button>
          )}
        </div>

        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] border-collapse text-sm">
              <thead className="bg-muted/70 text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="w-14 border-b border-grid px-3 py-2 text-center font-medium">
                    Row
                  </th>
                  <th scope="col" className="w-64 border-b border-grid px-3 py-2 font-medium">
                    Video
                  </th>
                  <th scope="col" className="w-36 border-b border-grid px-3 py-2 font-medium">
                    Status
                  </th>
                  <th scope="col" className="border-b border-grid px-3 py-2 font-medium">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.slice(0, limit).map((row) => (
                  <LedgerRow
                    key={row.sheetRow}
                    row={row}
                    paused={!running}
                    fresh={fresh.has(row.sheetRow)}
                    retrying={busy === row.sheetRow}
                    canRetry={connected && !running}
                    onOpen={() => setOpen(row)}
                    onRetry={() =>
                      act(row.sheetRow, () => api.retry(job.id, row.sheetRow), `Retrying row ${displayRow(row.sheetRow)}`)
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
          {visible.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">No rows match this filter.</p>
          )}
          {visible.length > limit && (
            <div className="border-t p-3 text-center">
              <Button variant="ghost" onClick={() => setLimit((l) => l + PAGE)}>
                Show {formatNumber(Math.min(PAGE, visible.length - limit))} more rows
              </Button>
            </div>
          )}
        </div>
      </div>

      <SummaryDialog row={open} onClose={() => setOpen(null)} />
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("text-xl font-semibold", tone)}>{formatNumber(value)}</dd>
    </div>
  );
}

function LedgerRow({
  row,
  paused,
  fresh,
  retrying,
  canRetry,
  onOpen,
  onRetry,
}: {
  row: JobRow;
  paused: boolean;
  fresh: boolean;
  retrying: boolean;
  canRetry: boolean;
  onOpen: () => void;
  onRetry: () => void;
}) {
  const youtubeUrl = row.videoId
    ? row.isShort
      ? `https://www.youtube.com/shorts/${row.videoId}`
      : `https://www.youtube.com/watch?v=${row.videoId}`
    : null;

  return (
    <tr className="align-top hover:bg-muted/40">
      <td className="border-b border-grid px-3 py-3 text-center font-mono text-xs text-muted-foreground">
        {displayRow(row.sheetRow)}
      </td>
      <td className="border-b border-grid px-3 py-3">
        <span className="line-clamp-2 font-medium">{row.title || (row.videoId ? "Untitled video" : "No video")}</span>
        {youtubeUrl ? (
          <a
            href={youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
          >
            {row.videoId}
            {row.isShort ? " (Short)" : ""}
            <ExternalLink className="size-3" aria-hidden />
            <span className="sr-only">Open on YouTube</span>
          </a>
        ) : (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{row.source || "Empty cell"}</span>
        )}
      </td>
      <td className="border-b border-grid px-3 py-3">
        <RowStatus status={row.status} paused={paused} />
      </td>
      <td className={cn("border-b border-grid px-3 py-3", fresh && "animate-cell-fill")}>
        <DescriptionCell row={row} paused={paused} retrying={retrying} canRetry={canRetry} onOpen={onOpen} onRetry={onRetry} />
      </td>
    </tr>
  );
}

function DescriptionCell({
  row,
  paused,
  retrying,
  canRetry,
  onOpen,
  onRetry,
}: {
  row: JobRow;
  paused: boolean;
  retrying: boolean;
  canRetry: boolean;
  onOpen: () => void;
  onRetry: () => void;
}) {
  switch (row.status) {
    case "done":
      return (
        <button
          type="button"
          onClick={onOpen}
          className="group block w-full rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="line-clamp-3 whitespace-pre-line text-foreground/90">{row.summary}</span>
          <span className="mt-1 flex items-center gap-3 text-xs">
            <span className="text-primary group-hover:underline">Read full summary</span>
            {row.duplicateOf !== null && (
              <span className="text-muted-foreground">Same video as row {displayRow(row.duplicateOf)}</span>
            )}
            {row.warning && <span className="text-warning">{row.warning}</span>}
          </span>
        </button>
      );
    case "running":
      return paused ? (
        <span className="text-muted-foreground">Collected when you resume</span>
      ) : (
        <span className="block space-y-1.5" aria-label="Summary in progress">
          <span className="block h-2.5 w-11/12 animate-pulse rounded bg-info-soft" />
          <span className="block h-2.5 w-3/4 animate-pulse rounded bg-info-soft" />
          <span className="block h-2.5 w-1/2 animate-pulse rounded bg-info-soft" />
        </span>
      );
    case "failed":
      return (
        <span className="flex flex-wrap items-start justify-between gap-2">
          <span className="text-destructive">{row.error ?? "vidIQ could not summarize this video."}</span>
          {canRetry && (
            <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying}>
              {retrying ? <Loader2 className="animate-spin" aria-hidden /> : <RotateCcw aria-hidden />}
              Retry
            </Button>
          )}
        </span>
      );
    case "duplicate":
      return (
        <span className="text-muted-foreground">
          Uses the summary from row {row.duplicateOf !== null ? displayRow(row.duplicateOf) : "above"}
        </span>
      );
    case "filled":
      return <span className="text-muted-foreground">Already has a description, kept as is</span>;
    case "invalid":
      return <span className="text-warning">No YouTube link or video ID in this row</span>;
    default:
      return <span className="text-muted-foreground">Waiting for its turn</span>;
  }
}

function SummaryDialog({ row, onClose }: { row: JobRow | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!row?.summary) return;
    await navigator.clipboard.writeText(row.summary);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  };

  return (
    <Dialog open={row !== null} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        {row && (
          <>
            <DialogHeader>
              <DialogTitle>{row.title || row.videoId}</DialogTitle>
              <DialogDescription>Row {displayRow(row.sheetRow)} of your spreadsheet</DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-y-auto rounded-md border bg-muted/40 p-4 text-sm leading-relaxed whitespace-pre-line">
              {row.summary}
            </div>
            {row.warning && <p className="text-sm text-warning">{row.warning}</p>}
            <div className="flex justify-end">
              <Button variant="outline" onClick={copy}>
                {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                {copied ? "Copied" : "Copy summary"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Rows that turned done since the last update, for a brief highlight. */
function useFreshlyDone(rows: JobRow[]): Set<number> {
  const seen = useRef<Set<number> | null>(null);
  const [fresh, setFresh] = useState<Set<number>>(new Set());

  useEffect(() => {
    const done = new Set(rows.filter((r) => r.status === "done").map((r) => r.sheetRow));
    if (seen.current) {
      const added = [...done].filter((r) => !seen.current!.has(r));
      if (added.length) {
        setFresh(new Set(added));
        const timer = window.setTimeout(() => setFresh(new Set()), 1_600);
        seen.current = done;
        return () => window.clearTimeout(timer);
      }
    }
    seen.current = done;
  }, [rows]);

  return fresh;
}

function useEta({ job, counts, rows }: JobSummary): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);
  if (job.status !== "running" || !job.startedAt) return null;
  const finishedHere = rows.filter((r) => r.status === "done" && r.duplicateOf === null && r.updatedAt >= job.startedAt!).length;
  if (finishedHere === 0) return null;
  const perVideo = (Math.max(now, rows.reduce((t, r) => Math.max(t, r.updatedAt), 0)) - job.startedAt) / finishedHere;
  return formatDuration(perVideo * (counts.pending + counts.running));
}
