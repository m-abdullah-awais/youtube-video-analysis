"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, ExternalLink, Loader2, Pause, PenLine, Play, RefreshCw, RotateCcw, Upload } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage, type JobSummary, type VidiqStatus } from "@/lib/client/api";
import { displayRow, formatDuration } from "@/lib/client/format";
import { useI18n } from "@/lib/i18n/provider";
import type { JobRow } from "@/lib/jobs/repo";
import { cn } from "@/lib/utils";
import { CREDIT_COST } from "@/lib/vidiq/costs";
import { FailureNote } from "./failure-note";
import { requestNotificationPermission } from "./notifications";
import { PanelHeader } from "./panel-header";
import { RowStatus } from "./row-status";

type Filter = "all" | "done" | "working" | "failed" | "skipped";

const FILTERS: { id: Filter; match: (r: JobRow) => boolean }[] = [
  { id: "all", match: () => true },
  { id: "done", match: (r) => r.status === "done" },
  { id: "working", match: (r) => r.status === "pending" || r.status === "running" || r.status === "duplicate" },
  { id: "failed", match: (r) => r.status === "failed" },
  { id: "skipped", match: (r) => r.status === "filled" || r.status === "invalid" },
];

const PAGE = 100;

type Busy = "pause" | "resume" | "retry" | number | null;
type Opened = { row: JobRow; mode: "view" | "edit" | "regenerate" } | null;

type Props = {
  summary: JobSummary;
  vidiq: VidiqStatus | null;
  onSummary: (summary: JobSummary) => void;
  onNewRun: () => void;
  onConnect: () => void;
};

export function RunPanel({ summary, vidiq, onSummary, onNewRun, onConnect }: Props) {
  const { t, n } = useI18n();
  const r = t.run;
  const { job, rows, counts } = summary;
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(PAGE);
  const [busy, setBusy] = useState<Busy>(null);
  const [opened, setOpened] = useState<Opened>(null);
  const fresh = useFreshlyDone(rows);

  const act = async (kind: NonNullable<Busy>, call: () => Promise<JobSummary>, success?: string) => {
    setBusy(kind);
    try {
      onSummary(await call());
      if (success) toast.success(success);
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
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
  const filterCounts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.id, rows.filter(f.match).length])) as Record<Filter, number>,
    [rows],
  );
  const connected = vidiq?.connection.status === "connected";
  // Keep the dialog in sync with live updates to its row.
  const openRow = opened ? (rows.find((x) => x.sheetRow === opened.row.sheetRow) ?? opened.row) : null;

  const title = finished ? (counts.failed > 0 ? r.titleDoneFailures : r.titleDone) : paused ? r.titlePaused : r.titleRunning;

  return (
    <section aria-labelledby="run-title" className="space-y-6">
      <PanelHeader
        id="run-title"
        title={title}
        description={<span className="font-medium text-foreground">{job.name}</span>}
        actions={
          <>
            {running && (
              <Button variant="outline" onClick={() => act("pause", () => api.pause(job.id))} disabled={busy === "pause"}>
                <Pause aria-hidden />
                {r.pause}
              </Button>
            )}
            {paused && counts.pending + counts.running > 0 && (
              <Button
                onClick={() => {
                  requestNotificationPermission();
                  void act("resume", () => api.start(job.id), r.resumed);
                }}
                disabled={busy === "resume" || !connected}
              >
                {busy === "resume" ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />}
                {r.resume}
              </Button>
            )}
            {counts.failed > 0 && !running && (
              <Button
                variant="outline"
                onClick={() => act("retry", () => api.retry(job.id), r.retrying(counts.failed))}
                disabled={busy === "retry" || !connected}
              >
                <RotateCcw aria-hidden />
                {r.retryFailed(n(counts.failed))}
              </Button>
            )}
            <Button variant={finished ? "default" : "outline"} render={<a href={api.downloadUrl(job.id)} download />} nativeButton={false}>
              <Download aria-hidden />
              {finished ? r.download : r.downloadSoFar}
            </Button>
          </>
        }
      />

      {paused && job.pauseReason === "credits" && (
        <Alert className="border-warning/40 bg-warning-soft">
          <AlertTitle>{r.creditsTitle}</AlertTitle>
          <AlertDescription>{r.creditsBody(counts.pending + counts.running)}</AlertDescription>
        </Alert>
      )}
      {paused && job.pauseReason === "auth" && (
        <Alert className="border-warning/40 bg-warning-soft">
          <AlertTitle>{r.authTitle}</AlertTitle>
          <AlertDescription>{r.authBody}</AlertDescription>
          <AlertAction>
            <Button size="sm" onClick={onConnect}>
              {r.connect}
            </Button>
          </AlertAction>
        </Alert>
      )}
      {paused && job.pauseReason === "user" && counts.running > 0 && (
        <Alert>
          <AlertTitle>{r.pausedTitle}</AlertTitle>
          <AlertDescription>{r.pausedBody(counts.running)}</AlertDescription>
        </Alert>
      )}
      {!connected && running && (
        <Alert className="border-warning/40 bg-warning-soft">
          <AlertTitle>{r.notConnectedTitle}</AlertTitle>
          <AlertDescription>{r.notConnectedBody}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-lg border bg-card p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <p className="text-4xl font-semibold tracking-tight">
            {n(counts.done)}
            <span className="text-lg font-normal text-muted-foreground">{r.of(n(target))}</span>
          </p>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {running && eta ? r.left(eta) : running ? r.starting : paused ? r.paused : r.finished}
          </p>
        </div>
        <div
          role="progressbar"
          aria-label={r.progressLabel}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="mt-4 h-2 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out" style={{ width: `${percent}%` }} />
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <Stat label={r.stats.running} value={n(counts.running)} tone="text-info" />
          <Stat label={r.stats.waiting} value={n(counts.pending + counts.duplicate)} />
          <Stat label={r.stats.failed} value={n(counts.failed)} tone={counts.failed ? "text-destructive" : undefined} />
          <Stat label={r.stats.skipped} value={n(counts.filled + counts.invalid)} />
        </dl>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1" role="group" aria-label={r.filtersLabel}>
            {FILTERS.map((f) => (
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
                {r.filters[f.id]} <span className="text-muted-foreground">{n(filterCounts[f.id])}</span>
              </button>
            ))}
          </div>
          {finished && (
            <Button variant="ghost" onClick={onNewRun}>
              <Upload aria-hidden />
              {r.newRun}
            </Button>
          )}
        </div>

        <div className="overflow-hidden rounded-lg border bg-card">
          {/* Phones: one card per row, so the description is never off-screen. */}
          <ul className="divide-y md:hidden">
            {visible.slice(0, limit).map((row) => (
              <li key={row.sheetRow} className={cn("space-y-3 p-4", fresh.has(row.sheetRow) && "animate-cell-fill")}>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 w-7 shrink-0 font-mono text-xs text-muted-foreground">{displayRow(row.sheetRow)}</span>
                  <VideoCell row={row} />
                  <RowStatus status={row.status} paused={!running} />
                </div>
                <div className="pl-10 text-sm">
                  <DescriptionCell
                    row={row}
                    paused={!running}
                    retrying={busy === row.sheetRow}
                    canRetry={connected && !running}
                    onOpen={(mode) => setOpened({ row, mode })}
                    onRetry={() => act(row.sheetRow, () => api.retry(job.id, row.sheetRow), r.retryingRow(String(displayRow(row.sheetRow))))}
                  />
                </div>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[46rem] border-collapse text-sm">
              <thead className="bg-muted/70 text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="w-14 border-b border-grid px-3 py-2 text-center font-medium">
                    {r.columns.row}
                  </th>
                  <th scope="col" className="w-64 border-b border-grid px-3 py-2 font-medium">
                    {r.columns.video}
                  </th>
                  <th scope="col" className="w-36 border-b border-grid px-3 py-2 font-medium">
                    {r.columns.status}
                  </th>
                  <th scope="col" className="border-b border-grid px-3 py-2 font-medium">
                    {r.columns.description}
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
                    onOpen={(mode) => setOpened({ row, mode })}
                    onRetry={() => act(row.sheetRow, () => api.retry(job.id, row.sheetRow), r.retryingRow(String(displayRow(row.sheetRow))))}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {visible.length === 0 && <p className="px-4 py-10 text-center text-sm text-muted-foreground">{r.noMatch}</p>}
          {visible.length > limit && (
            <div className="border-t p-3 text-center">
              <Button variant="ghost" onClick={() => setLimit((l) => l + PAGE)}>
                {r.showMore(n(Math.min(PAGE, visible.length - limit)))}
              </Button>
            </div>
          )}
        </div>
      </div>

      <SummaryDialog
        row={openRow}
        mode={opened?.mode ?? "view"}
        canRegenerate={connected}
        busy={openRow ? busy === openRow.sheetRow : false}
        onMode={(mode) => opened && setOpened({ ...opened, mode })}
        onClose={() => setOpened(null)}
        onSave={async (text) => {
          if (!openRow) return;
          if (await act(openRow.sheetRow, () => api.editRow(job.id, openRow.sheetRow, text), r.saved)) setOpened(null);
        }}
        onRegenerate={async () => {
          if (!openRow) return;
          if (await act(openRow.sheetRow, () => api.regenerateRow(job.id, openRow.sheetRow), r.regenerating)) setOpened(null);
        }}
      />
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("text-xl font-semibold", tone)}>{value}</dd>
    </div>
  );
}

type RowProps = {
  row: JobRow;
  paused: boolean;
  fresh: boolean;
  retrying: boolean;
  canRetry: boolean;
  onOpen: (mode: "view" | "edit") => void;
  onRetry: () => void;
};

function VideoCell({ row }: { row: JobRow }) {
  const { t } = useI18n();
  const r = t.run;
  const youtubeUrl = row.videoId
    ? row.isShort
      ? `https://www.youtube.com/shorts/${row.videoId}`
      : `https://www.youtube.com/watch?v=${row.videoId}`
    : null;
  return (
    <span className="block min-w-0 flex-1">
      <span className="line-clamp-2 font-medium">{row.title || (row.videoId ? r.untitled : r.noVideo)}</span>
      {youtubeUrl ? (
        <a
          href={youtubeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-0.5 inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
        >
          {row.videoId}
          {row.isShort ? r.shortTag : ""}
          <ExternalLink className="size-3" aria-hidden />
          <span className="sr-only">{r.openOnYoutube}</span>
        </a>
      ) : (
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{row.source || r.emptyCell}</span>
      )}
    </span>
  );
}

function LedgerRow({ row, paused, fresh, retrying, canRetry, onOpen, onRetry }: RowProps) {
  return (
    <tr className="align-top hover:bg-muted/40">
      <td className="border-b border-grid px-3 py-3 text-center font-mono text-xs text-muted-foreground">{displayRow(row.sheetRow)}</td>
      <td className="border-b border-grid px-3 py-3">
        <VideoCell row={row} />
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

function DescriptionCell({ row, paused, retrying, canRetry, onOpen, onRetry }: Omit<RowProps, "fresh">) {
  const { t } = useI18n();
  const r = t.run;
  switch (row.status) {
    case "done":
      return (
        <button
          type="button"
          onClick={() => onOpen("view")}
          className="group block w-full rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="line-clamp-3 whitespace-pre-line text-foreground/90">{row.summary}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
            <span className="text-primary group-hover:underline">{r.readFull}</span>
            {row.edited && <span className="rounded bg-secondary px-1.5 py-0.5 text-muted-foreground">{r.edited}</span>}
            {row.duplicateOf !== null && <span className="text-muted-foreground">{r.sameAs(String(displayRow(row.duplicateOf)))}</span>}
            {row.warning && <span className="text-warning">{row.warning}</span>}
          </span>
        </button>
      );
    case "running":
      return paused ? (
        <span className="text-muted-foreground">{r.collectedOnResume}</span>
      ) : (
        <span className="block space-y-1.5" aria-label={r.inProgress}>
          <span className="block h-2.5 w-11/12 animate-pulse rounded bg-info-soft" />
          <span className="block h-2.5 w-3/4 animate-pulse rounded bg-info-soft" />
          <span className="block h-2.5 w-1/2 animate-pulse rounded bg-info-soft" />
        </span>
      );
    case "failed":
      return (
        <span className="flex flex-wrap items-start justify-between gap-3">
          <span className="min-w-0 flex-1">
            <FailureNote message={row.error ?? ""} />
          </span>
          <span className="flex gap-1.5">
            {canRetry && (
              <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying}>
                {retrying ? <Loader2 className="animate-spin" aria-hidden /> : <RotateCcw aria-hidden />}
                {r.retry}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => onOpen("edit")}>
              <PenLine aria-hidden />
              {r.writeIt}
            </Button>
          </span>
        </span>
      );
    case "duplicate":
      return (
        <span className="text-muted-foreground">
          {r.usesSummaryFrom(row.duplicateOf !== null ? String(displayRow(row.duplicateOf)) : "")}
        </span>
      );
    case "filled":
      return <span className="text-muted-foreground">{r.filledKept}</span>;
    case "invalid":
      return <span className="text-warning">{r.invalidRow}</span>;
    default:
      return <span className="text-muted-foreground">{r.waitingTurn}</span>;
  }
}

function SummaryDialog({
  row,
  mode,
  canRegenerate,
  busy,
  onMode,
  onClose,
  onSave,
  onRegenerate,
}: {
  row: JobRow | null;
  mode: "view" | "edit" | "regenerate";
  canRegenerate: boolean;
  busy: boolean;
  onMode: (mode: "view" | "edit" | "regenerate") => void;
  onClose: () => void;
  onSave: (text: string) => void;
  onRegenerate: () => void;
}) {
  const { t } = useI18n();
  const r = t.run;
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftFor, setDraftFor] = useState<string | null>(null);

  // Start each edit from the row's current text.
  const draftKey = row && mode === "edit" ? `${row.sheetRow}:${row.updatedAt}` : null;
  if (draftKey !== draftFor) {
    setDraftFor(draftKey);
    setDraft(row?.summary ?? "");
  }

  const copy = async () => {
    if (!row?.summary) return;
    await navigator.clipboard.writeText(row.summary);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  };

  const cost = row?.isShort ? CREDIT_COST.short : CREDIT_COST.long;

  return (
    <Dialog open={row !== null} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        {row && (
          <>
            <DialogHeader>
              <DialogTitle>{row.title || row.videoId}</DialogTitle>
              <DialogDescription>{r.dialogRow(String(displayRow(row.sheetRow)))}</DialogDescription>
            </DialogHeader>

            {mode === "edit" ? (
              <div className="space-y-1.5">
                <Label htmlFor="summary-edit">{r.editLabel}</Label>
                <Textarea
                  id="summary-edit"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={12}
                  autoFocus
                  className="max-h-[55vh] text-sm leading-relaxed"
                />
              </div>
            ) : mode === "regenerate" ? (
              <p className="text-sm text-muted-foreground">{r.regenerateBody(cost)}</p>
            ) : (
              <>
                <div className="max-h-[55vh] overflow-y-auto rounded-md border bg-muted/40 p-4 text-sm leading-relaxed whitespace-pre-line">
                  {row.summary}
                </div>
                {row.warning && <p className="text-sm text-warning">{row.warning}</p>}
              </>
            )}

            <DialogFooter className="gap-2 sm:justify-between">
              {mode === "view" ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => onMode("edit")}>
                      <PenLine aria-hidden />
                      {r.edit}
                    </Button>
                    {canRegenerate && row.videoId && (
                      <Button variant="ghost" onClick={() => onMode("regenerate")}>
                        <RefreshCw aria-hidden />
                        {r.regenerate}
                      </Button>
                    )}
                  </div>
                  <Button variant="outline" onClick={copy}>
                    {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                    {copied ? r.copied : r.copy}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" onClick={() => (row.status === "done" ? onMode("view") : onClose())}>
                    {r.cancel}
                  </Button>
                  {mode === "edit" ? (
                    <Button onClick={() => onSave(draft)} disabled={busy || !draft.trim()}>
                      {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
                      {r.save}
                    </Button>
                  ) : (
                    <Button onClick={onRegenerate} disabled={busy}>
                      {busy ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
                      {r.regenerateConfirm}
                    </Button>
                  )}
                </>
              )}
            </DialogFooter>
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
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);
  if (job.status !== "running" || !job.startedAt) return null;
  const finishedHere = rows.filter((r) => r.status === "done" && r.duplicateOf === null && r.updatedAt >= job.startedAt!).length;
  if (finishedHere === 0) return null;
  const perVideo = (Math.max(now, rows.reduce((max, r) => Math.max(max, r.updatedAt), 0)) - job.startedAt) / finishedHere;
  return formatDuration(perVideo * (counts.pending + counts.running), t.duration);
}
