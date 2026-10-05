"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Captions,
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Loader2,
  Pause,
  PenLine,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage, type JobSummary, type ReportItem, type VidiqStatus } from "@/lib/client/api";
import { downloadFile } from "@/lib/client/download";
import { displayRow, formatDuration } from "@/lib/client/format";
import { downloadRunPdf, downloadVideoPdf } from "@/lib/client/pdf";
import { matchesQuery } from "@/lib/client/search";
import { useI18n } from "@/lib/i18n/provider";
import type { JobRow, Language } from "@/lib/jobs/repo";
import { cn } from "@/lib/utils";
import { CREDIT_COST } from "@/lib/vidiq/costs";
import { FailureNote } from "./failure-note";
import { requestNotificationPermission } from "./notifications";
import { PanelHeader } from "./panel-header";
import { RowStatus } from "./row-status";

type Filter = "all" | "done" | "working" | "failed" | "skipped" | "excluded";

const FILTERS: { id: Filter; match: (r: JobRow) => boolean }[] = [
  { id: "all", match: () => true },
  { id: "done", match: (r) => r.status === "done" },
  { id: "working", match: (r) => r.status === "pending" || r.status === "running" || r.status === "duplicate" },
  { id: "failed", match: (r) => r.status === "failed" },
  { id: "skipped", match: (r) => r.status === "filled" || r.status === "invalid" },
  { id: "excluded", match: (r) => r.status === "excluded" },
];

const PAGE = 100;

type Busy = "pause" | "resume" | "retry" | "export" | "transcripts" | "selection" | number | null;
type Mode = "view" | "edit" | "regenerate";
type Opened = { row: JobRow; mode: Mode } | null;

/** Finished rows whose transcripts were never fetched, or failed. */
const needsTranscripts = (row: JobRow) =>
  row.status === "done" && !!row.videoId && (row.transcripts.en === null || row.transcripts.en === "failed" || row.transcripts.es === "failed");

type Props = {
  summary: JobSummary;
  vidiq: VidiqStatus | null;
  onSummary: (summary: JobSummary) => void;
  onNewRun: () => void;
  onConnect: () => void;
};

export function RunPanel({ summary, vidiq, onSummary, onNewRun, onConnect }: Props) {
  const i18n = useI18n();
  const { t, n } = i18n;
  const r = t.run;
  const { job, rows, counts } = summary;
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [busy, setBusy] = useState<Busy>(null);
  const [opened, setOpened] = useState<Opened>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const fresh = useFreshlyDone(rows);

  const act = async (kind: NonNullable<Busy>, call: () => Promise<JobSummary | void>, success?: string) => {
    setBusy(kind);
    try {
      const next = await call();
      if (next) onSummary(next);
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
  const connected = vidiq?.connection.status === "connected";
  const words = { t, date: i18n.date };

  const visible = useMemo(() => {
    const match = FILTERS.find((f) => f.id === filter)!.match;
    return rows.filter((row) => match(row) && matchesQuery(row, query));
  }, [rows, filter, query]);
  const filterCounts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.id, rows.filter(f.match).length])) as Record<Filter, number>,
    [rows],
  );
  const missingTranscripts = useMemo(() => rows.filter(needsTranscripts).length, [rows]);
  const page = visible.slice(0, limit);

  // Selection only keeps rows that still exist.
  const chosen = rows.filter((row) => selected.has(row.sheetRow));
  const toProcess = chosen.filter((row) => row.status === "excluded" || row.status === "failed");
  const chosenDone = chosen.filter((row) => row.status === "done");
  const allShownSelected = page.length > 0 && page.every((row) => selected.has(row.sheetRow));
  const toggle = (sheetRow: number, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(sheetRow);
      else next.delete(sheetRow);
      return next;
    });

  // Keep the dialog in sync with live updates to its row.
  const openRow = opened ? (rows.find((x) => x.sheetRow === opened.row.sheetRow) ?? opened.row) : null;

  const exportSheet = (transcripts: boolean) =>
    act("export", () => downloadFile(api.downloadUrl(job.id, transcripts), `${job.name}.${job.format}`)).then(
      (ok) => ok || undefined,
    );
  const exportPdf = (sheetRows?: number[]) =>
    act("export", async () => {
      const report = await api.report(job.id, sheetRows);
      if (report.items.length === 0) throw new Error(r.nothingToExport);
      toast(r.preparingPdf);
      if (sheetRows?.length === 1) await downloadVideoPdf(report, words);
      else await downloadRunPdf(report, words);
    }, r.pdfReady);

  const processSelected = () =>
    act("selection", async () => {
      requestNotificationPermission();
      const excluded = toProcess.filter((row) => row.status === "excluded").map((row) => row.sheetRow);
      let next: JobSummary | undefined;
      if (excluded.length) next = await api.include(job.id, excluded);
      for (const row of toProcess.filter((x) => x.status === "failed")) next = await api.retry(job.id, row.sheetRow);
      setSelected(new Set());
      return next;
    }, r.added(toProcess.length));

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
            {missingTranscripts > 0 && !running && (
              <Button
                variant="outline"
                onClick={() => act("transcripts", () => api.transcripts(job.id), r.transcriptsQueued)}
                disabled={busy === "transcripts" || !connected}
              >
                <Captions aria-hidden />
                {r.getTranscriptsAll(n(missingTranscripts))}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant={finished ? "default" : "outline"} disabled={busy === "export"} />}
              >
                {busy === "export" ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
                {r.exportLabel}
                <ChevronDown aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-60">
                <DropdownMenuItem onClick={() => void exportSheet(false)}>
                  <FileSpreadsheet aria-hidden />
                  {r.exportSheet}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void exportSheet(true)}>
                  <FileSpreadsheet aria-hidden />
                  {r.exportSheetTranscripts}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void exportPdf()}>
                  <FileText aria-hidden />
                  {r.exportPdf}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
          <Stat label={r.stats.skipped} value={n(counts.filled + counts.invalid + counts.excluded)} />
        </dl>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
            placeholder={r.searchPlaceholder}
            aria-label={r.searchPlaceholder}
            className="h-10 bg-card pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1" role="group" aria-label={r.filtersLabel}>
            {FILTERS.filter((f) => f.id !== "excluded" || filterCounts.excluded > 0).map((f) => (
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

        {chosen.length > 0 && (
          <div
            role="region"
            aria-label={r.selected(n(chosen.length))}
            className="sticky top-16 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-accent px-4 py-2.5 shadow-sm"
          >
            <span className="mr-auto text-sm font-medium text-accent-foreground">{r.selected(n(chosen.length))}</span>
            {toProcess.length > 0 && (
              <Button size="sm" onClick={processSelected} disabled={busy === "selection" || !connected || running}>
                <Play aria-hidden />
                {r.addToRun}
              </Button>
            )}
            {chosenDone.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  act("transcripts", () => api.transcripts(job.id, chosenDone.map((row) => row.sheetRow)), r.transcriptsQueued)
                }
                disabled={busy === "transcripts" || !connected}
              >
                <Captions aria-hidden />
                {r.getTranscripts}
              </Button>
            )}
            {chosenDone.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => exportPdf(chosenDone.map((row) => row.sheetRow))} disabled={busy === "export"}>
                <FileText aria-hidden />
                {r.downloadPdf}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              <X aria-hidden />
              {r.clearSelection}
            </Button>
          </div>
        )}

        <div className="overflow-hidden rounded-lg border bg-card">
          {/* Phones: one card per row, so the description is never off-screen. */}
          <ul className="divide-y md:hidden">
            {page.map((row) => (
              <li key={row.sheetRow} className={cn("space-y-3 p-4", fresh.has(row.sheetRow) && "animate-cell-fill")}>
                <div className="flex items-start gap-3">
                  <Checkbox
                    className="mt-0.5"
                    checked={selected.has(row.sheetRow)}
                    onCheckedChange={(on) => toggle(row.sheetRow, on)}
                    aria-label={r.selectRow(String(displayRow(row.sheetRow)))}
                  />
                  <span className="mt-0.5 w-7 shrink-0 font-mono text-xs text-muted-foreground">{displayRow(row.sheetRow)}</span>
                  <VideoCell row={row} />
                  <RowStatus status={row.status} paused={!running} />
                </div>
                <div className="pl-16 text-sm">
                  <DescriptionCell
                    row={row}
                    primary={job.descriptionLanguage}
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
            <table className="w-full min-w-[48rem] border-collapse text-sm">
              <thead className="bg-muted/70 text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="w-10 border-b border-grid px-3 py-2">
                    <Checkbox
                      checked={allShownSelected}
                      onCheckedChange={(on) =>
                        setSelected((current) => {
                          const next = new Set(current);
                          for (const row of page) {
                            if (on) next.add(row.sheetRow);
                            else next.delete(row.sheetRow);
                          }
                          return next;
                        })
                      }
                      aria-label={r.selectShown}
                    />
                  </th>
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
                {page.map((row) => (
                  <tr key={row.sheetRow} className={cn("align-top hover:bg-muted/40", selected.has(row.sheetRow) && "bg-accent/50")}>
                    <td className="border-b border-grid px-3 py-3">
                      <Checkbox
                        checked={selected.has(row.sheetRow)}
                        onCheckedChange={(on) => toggle(row.sheetRow, on)}
                        aria-label={r.selectRow(String(displayRow(row.sheetRow)))}
                      />
                    </td>
                    <td className="border-b border-grid px-3 py-3 text-center font-mono text-xs text-muted-foreground">
                      {displayRow(row.sheetRow)}
                    </td>
                    <td className="border-b border-grid px-3 py-3">
                      <VideoCell row={row} />
                    </td>
                    <td className="border-b border-grid px-3 py-3">
                      <RowStatus status={row.status} paused={!running} />
                    </td>
                    <td className={cn("border-b border-grid px-3 py-3", fresh.has(row.sheetRow) && "animate-cell-fill")}>
                      <DescriptionCell
                        row={row}
                        primary={job.descriptionLanguage}
                        paused={!running}
                        retrying={busy === row.sheetRow}
                        canRetry={connected && !running}
                        onOpen={(mode) => setOpened({ row, mode })}
                        onRetry={() =>
                          act(row.sheetRow, () => api.retry(job.id, row.sheetRow), r.retryingRow(String(displayRow(row.sheetRow))))
                        }
                      />
                    </td>
                  </tr>
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
        jobId={job.id}
        row={openRow}
        mode={opened?.mode ?? "view"}
        primary={job.descriptionLanguage}
        canRegenerate={connected}
        busy={openRow ? busy === openRow.sheetRow : false}
        onMode={(mode) => opened && setOpened({ ...opened, mode })}
        onClose={() => setOpened(null)}
        onSave={async (text, language) => {
          if (!openRow) return;
          if (await act(openRow.sheetRow, () => api.editRow(job.id, openRow.sheetRow, text, language), r.saved)) {
            setOpened({ row: openRow, mode: "view" });
          }
        }}
        onRegenerate={async () => {
          if (!openRow) return;
          if (await act(openRow.sheetRow, () => api.regenerateRow(job.id, openRow.sheetRow), r.regenerating)) setOpened(null);
        }}
        onPdf={() => openRow && exportPdf([openRow.sheetRow])}
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

/** Small markers for which summaries and transcripts a finished row has. */
function Availability({ row }: { row: JobRow }) {
  const { t } = useI18n();
  const chip = (label: string, ok: boolean, title: string) => (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-mono text-[10px] font-medium",
        ok ? "bg-success-soft text-success" : "bg-muted text-muted-foreground line-through",
      )}
    >
      {label}
    </span>
  );
  const transcript = (language: Language) => row.transcripts[language];
  return (
    <span className="flex flex-wrap items-center gap-1">
      {chip("EN", !!row.summary, t.run.tabs.summaryEn)}
      {chip("ES", !!row.summaryEs, t.run.tabs.summaryEs)}
      {(["en", "es"] as const).map((language) => {
        const state = transcript(language);
        if (state === null) return null;
        const label = `${language.toUpperCase()} ${t.run.transcript[state]}`;
        return (
          <span
            key={language}
            title={language === "en" ? t.run.tabs.transcriptEn : t.run.tabs.transcriptEs}
            className={cn(
              "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
              state === "done" ? "bg-info-soft text-info" : "bg-muted text-muted-foreground",
            )}
          >
            <Captions className="size-3" aria-hidden />
            {label}
          </span>
        );
      })}
    </span>
  );
}

type CellProps = {
  row: JobRow;
  primary: Language;
  paused: boolean;
  retrying: boolean;
  canRetry: boolean;
  onOpen: (mode: Mode) => void;
  onRetry: () => void;
};

function DescriptionCell({ row, primary, paused, retrying, canRetry, onOpen, onRetry }: CellProps) {
  const { t } = useI18n();
  const r = t.run;
  switch (row.status) {
    case "done": {
      const text = (primary === "es" ? row.summaryEs : row.summary) ?? row.summary ?? row.summaryEs;
      return (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => onOpen("view")}
            className="group block w-full rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="line-clamp-3 whitespace-pre-line text-foreground/90">{text}</span>
            <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
              <span className="text-primary group-hover:underline">{r.readFull}</span>
              {row.edited && <span className="rounded bg-secondary px-1.5 py-0.5 text-muted-foreground">{r.edited}</span>}
              {row.duplicateOf !== null && <span className="text-muted-foreground">{r.sameAs(String(displayRow(row.duplicateOf)))}</span>}
              {row.warning && <span className="text-warning">{row.warning}</span>}
            </span>
          </button>
          <Availability row={row} />
        </div>
      );
    }
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
    case "excluded":
      return <span className="text-muted-foreground">{t.status.excluded}</span>;
    default:
      return <span className="text-muted-foreground">{r.waitingTurn}</span>;
  }
}

type Tab = "summaryEn" | "summaryEs" | "transcriptEn" | "transcriptEs";

function SummaryDialog({
  jobId,
  row,
  mode,
  primary,
  canRegenerate,
  busy,
  onMode,
  onClose,
  onSave,
  onRegenerate,
  onPdf,
}: {
  jobId: string;
  row: JobRow | null;
  mode: Mode;
  primary: Language;
  canRegenerate: boolean;
  busy: boolean;
  onMode: (mode: Mode) => void;
  onClose: () => void;
  onSave: (text: string, language: Language) => void;
  onRegenerate: () => void;
  onPdf: () => void;
}) {
  const { t } = useI18n();
  const r = t.run;
  const firstTab: Tab = primary === "es" ? "summaryEs" : "summaryEn";
  const [tab, setTab] = useState<Tab>(firstTab);
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftFor, setDraftFor] = useState<string | null>(null);
  const [details, setDetails] = useState<{ key: string; item: ReportItem | null } | null>(null);

  const editLanguage: Language = tab === "summaryEs" ? "es" : "en";
  const summaryText = row ? (editLanguage === "es" ? row.summaryEs : row.summary) : null;

  // Start each edit from the current text of the language being edited.
  const draftKey = row && mode === "edit" ? `${row.sheetRow}:${editLanguage}:${row.updatedAt}` : null;
  if (draftKey !== draftFor) {
    setDraftFor(draftKey);
    setDraft(summaryText ?? "");
  }

  // Reset to the Description-column language each time a different row opens.
  const [openFor, setOpenFor] = useState<number | null>(null);
  if ((row?.sheetRow ?? null) !== openFor) {
    setOpenFor(row?.sheetRow ?? null);
    setTab(mode === "edit" ? "summaryEn" : firstTab);
  }

  // Transcripts are long, so they are loaded only when the dialog opens.
  const detailsKey = row && row.status === "done" ? `${row.sheetRow}:${row.transcripts.en}:${row.transcripts.es}` : null;
  useEffect(() => {
    if (!detailsKey || !row) return;
    let alive = true;
    api.report(jobId, [row.sheetRow]).then(
      (report) => alive && setDetails({ key: detailsKey, item: report.items[0] ?? null }),
      () => alive && setDetails({ key: detailsKey, item: null }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, detailsKey]);
  const item = details?.key === detailsKey ? details.item : undefined;

  const shownText =
    tab === "summaryEn" ? row?.summary : tab === "summaryEs" ? row?.summaryEs : item?.transcripts[tab === "transcriptEn" ? "en" : "es"]?.text;

  const copy = async () => {
    if (!shownText) return;
    await navigator.clipboard.writeText(shownText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  };

  const cost = row?.isShort ? CREDIT_COST.short : CREDIT_COST.long;
  const tabs: { id: Tab; label: string }[] = [
    ...(primary === "es"
      ? [
          { id: "summaryEs" as const, label: r.tabs.summaryEs },
          { id: "summaryEn" as const, label: r.tabs.summaryEn },
        ]
      : [
          { id: "summaryEn" as const, label: r.tabs.summaryEn },
          { id: "summaryEs" as const, label: r.tabs.summaryEs },
        ]),
    { id: "transcriptEn", label: r.tabs.transcriptEn },
    { id: "transcriptEs", label: r.tabs.transcriptEs },
  ];

  const transcriptBody = (language: Language) => {
    const state = row?.transcripts[language] ?? null;
    if (item === undefined && state === "done") return <p className="text-sm text-muted-foreground">{r.loadingText}</p>;
    const entry = item?.transcripts[language];
    if (entry?.status === "done" && entry.text) return <TextBox text={entry.text} small />;
    const message =
      state === "unavailable"
        ? r.transcriptUnavailable(t.configure.languageWords[language])
        : state === "pending" || state === "running"
          ? r.transcriptWaiting
          : state === "failed"
            ? r.transcriptFailed
            : r.transcriptNone;
    return <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{message}</p>;
  };

  return (
    <Dialog open={row !== null} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        {row && (
          <>
            <DialogHeader>
              <DialogTitle>{row.title || row.videoId}</DialogTitle>
              <DialogDescription>{r.dialogRow(String(displayRow(row.sheetRow)))}</DialogDescription>
            </DialogHeader>

            {mode === "regenerate" ? (
              <p className="text-sm text-muted-foreground">{r.regenerateBody(cost)}</p>
            ) : (
              <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
                <TabsList className="h-auto w-full flex-wrap justify-start">
                  {tabs
                    .filter((x) => mode !== "edit" || x.id.startsWith("summary"))
                    .map((x) => (
                      <TabsTrigger key={x.id} value={x.id} className="flex-none">
                        {x.label}
                      </TabsTrigger>
                    ))}
                </TabsList>
                {(["summaryEn", "summaryEs"] as const).map((id) => (
                  <TabsContent key={id} value={id} className="mt-3">
                    {mode === "edit" ? (
                      <div className="space-y-1.5">
                        <Label htmlFor={`summary-edit-${id}`}>{r.editLabel}</Label>
                        <Textarea
                          id={`summary-edit-${id}`}
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          rows={12}
                          autoFocus
                          className="max-h-[50vh] text-sm leading-relaxed"
                        />
                      </div>
                    ) : (id === "summaryEn" ? row.summary : row.summaryEs) ? (
                      <TextBox text={(id === "summaryEn" ? row.summary : row.summaryEs)!} />
                    ) : (
                      <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                        {id === "summaryEs" ? r.spanishMissing : t.pdf.notAvailable}
                      </p>
                    )}
                  </TabsContent>
                ))}
                <TabsContent value="transcriptEn" className="mt-3">
                  {transcriptBody("en")}
                </TabsContent>
                <TabsContent value="transcriptEs" className="mt-3">
                  {transcriptBody("es")}
                </TabsContent>
              </Tabs>
            )}
            {mode === "view" && row.warning && <p className="text-sm text-warning">{row.warning}</p>}

            <DialogFooter className="gap-2 sm:justify-between">
              {mode === "view" ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    {tab.startsWith("summary") && row.status === "done" && (
                      <Button variant="outline" onClick={() => onMode("edit")}>
                        <PenLine aria-hidden />
                        {r.edit}
                      </Button>
                    )}
                    {canRegenerate && row.videoId && (
                      <Button variant="ghost" onClick={() => onMode("regenerate")}>
                        <RefreshCw aria-hidden />
                        {r.regenerate}
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {row.status === "done" && (
                      <Button variant="outline" onClick={onPdf}>
                        <FileText aria-hidden />
                        {r.downloadPdf}
                      </Button>
                    )}
                    <Button variant="outline" onClick={copy} disabled={!shownText}>
                      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                      {copied ? r.copied : r.copyText}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <Button variant="ghost" onClick={() => (row.status === "done" ? onMode("view") : onClose())}>
                    {r.cancel}
                  </Button>
                  {mode === "edit" ? (
                    <Button onClick={() => onSave(draft, editLanguage)} disabled={busy || !draft.trim()}>
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

function TextBox({ text, small }: { text: string; small?: boolean }) {
  return (
    <div
      className={cn(
        "max-h-[50vh] overflow-y-auto rounded-md border bg-muted/40 p-4 leading-relaxed whitespace-pre-line",
        small ? "text-[13px]" : "text-sm",
      )}
    >
      {text}
    </div>
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
