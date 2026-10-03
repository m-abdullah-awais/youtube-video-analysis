"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, FlaskConical, Loader2, Play } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage, type JobSummary, type TableInfo, type VidiqStatus } from "@/lib/client/api";
import { columnLetter, displayRow } from "@/lib/client/format";
import { useI18n } from "@/lib/i18n/provider";
import type { SummaryLanguage } from "@/lib/jobs/repo";
import { MAX_TEMPLATE_LENGTH, templateSections } from "@/lib/template/template";
import { cn } from "@/lib/utils";
import { CREDIT_COST } from "@/lib/vidiq/costs";
import { requestNotificationPermission } from "./notifications";
import { PanelHeader } from "./panel-header";
import { FailureNote } from "./failure-note";

type Form = {
  videoCol: number | null;
  descriptionCol: number | "new";
  template: string;
  summaryLanguage: SummaryLanguage;
  overwrite: boolean;
};

type Props = {
  summary: JobSummary;
  vidiq: VidiqStatus | null;
  onSummary: (summary: JobSummary) => void;
  onStarted: (summary: JobSummary) => void;
  onConnect: () => void;
};

export function ConfigurePanel({ summary, vidiq, onSummary, onStarted, onConnect }: Props) {
  const { t, n } = useI18n();
  const c = t.configure;
  const { job } = summary;
  const [table, setTable] = useState<TableInfo | null>(null);
  const [tableError, setTableError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(() => ({
    videoCol: job.videoCol,
    descriptionCol: job.descriptionHeader || job.descriptionCol === null ? "new" : job.descriptionCol,
    template: job.template || c.presets[0].template,
    summaryLanguage: job.summaryLanguage,
    overwrite: job.overwrite,
  }));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [trialStarting, setTrialStarting] = useState(false);
  const firstSave = useRef(true);

  const loadTable = useCallback(
    (sheet?: string) =>
      api.table(job.id, sheet).then(
        (info) => {
          setTable(info);
          setTableError(null);
          if (sheet) {
            setForm((f) => ({ ...f, videoCol: info.guess.video, descriptionCol: info.guess.description ?? "new" }));
          }
        },
        (e) => setTableError(errorMessage(e)),
      ),
    [job.id],
  );

  useEffect(() => {
    void loadTable();
  }, [loadTable]);

  // Save settings shortly after each change so the estimate stays current.
  useEffect(() => {
    if (firstSave.current) {
      firstSave.current = false;
      return;
    }
    if (form.videoCol === null || !table) return;
    const timer = window.setTimeout(async () => {
      setSaving(true);
      try {
        onSummary(
          await api.configure(job.id, {
            sheetName: table.sheetName,
            videoCol: form.videoCol!,
            descriptionCol: form.descriptionCol,
            template: form.template,
            summaryLanguage: form.summaryLanguage,
            overwrite: form.overwrite,
          }),
        );
        setSaveError(null);
      } catch (e) {
        setSaveError(errorMessage(e));
      } finally {
        setSaving(false);
      }
    }, 450);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, table?.sheetName]);

  const start = async () => {
    requestNotificationPermission();
    setStarting(true);
    try {
      onStarted(await api.start(job.id));
    } catch (e) {
      setSaveError(errorMessage(e));
    } finally {
      setStarting(false);
    }
  };

  const tryOne = async () => {
    setTrialStarting(true);
    try {
      onSummary(await api.preview(job.id));
      setSaveError(null);
    } catch (e) {
      setSaveError(errorMessage(e));
    } finally {
      setTrialStarting(false);
    }
  };

  const sections = useMemo(() => templateSections(form.template), [form.template]);
  const connected = vidiq?.connection.status === "connected";
  const balance = vidiq?.balance;
  const { counts, estimate, preview } = summary;
  const short = balance && !balance.unlimited && balance.total !== null && balance.total < estimate.credits;
  const templateTooLong = form.template.trim().length > MAX_TEMPLATE_LENGTH;
  const trialRunning = preview?.status === "running";
  const settingsValid = form.videoCol !== null && !saving && !saveError && !templateTooLong && !!form.template.trim();
  const canStart = connected && settingsValid && estimate.videos > 0 && !trialRunning;
  const invalidRows = summary.rows.filter((r) => r.status === "invalid");

  return (
    <section aria-labelledby="configure-title" className="space-y-8">
      <PanelHeader
        id="configure-title"
        title={c.title}
        description={
          <>
            <span className="font-medium text-foreground">{job.name}</span>
            {table ? c.fileRows(n(table.rowCount)) : ". "}
            {c.picked}
          </>
        }
      />

      {tableError && (
        <Alert variant="destructive">
          <AlertTitle>{c.fileError}</AlertTitle>
          <AlertDescription>{tableError}</AlertDescription>
        </Alert>
      )}

      {!table && !tableError && <div className="h-72 animate-pulse rounded-lg bg-muted" aria-label={c.loadingFile} />}

      {table && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {table.sheetNames.length > 1 && (
              <Field label={c.sheet} id="sheet">
                <Select
                  value={table.sheetName}
                  onValueChange={(value) => value && void loadTable(value)}
                  items={table.sheetNames.map((name) => ({ value: name, label: name }))}
                >
                  <SelectTrigger id="sheet" className="w-full bg-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {table.sheetNames.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
            <Field label={c.videoIn} id="video-col">
              <ColumnSelect
                id="video-col"
                table={table}
                value={form.videoCol}
                placeholder={c.chooseColumn}
                onChange={(videoCol) => setForm((f) => ({ ...f, videoCol }))}
              />
            </Field>
            <Field label={c.writeInto} id="description-col">
              <ColumnSelect
                id="description-col"
                table={table}
                value={form.descriptionCol}
                allowNew
                onChange={(descriptionCol) => setForm((f) => ({ ...f, descriptionCol: descriptionCol ?? "new" }))}
              />
            </Field>
          </div>

          {form.videoCol === null && (
            <Alert>
              <AlertTriangle aria-hidden />
              <AlertTitle>{c.noLinksTitle}</AlertTitle>
              <AlertDescription>{c.noLinksBody}</AlertDescription>
            </Alert>
          )}

          <PreviewGrid table={table} videoCol={form.videoCol} descriptionCol={form.descriptionCol} />
        </div>
      )}

      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold">{c.templateTitle}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{c.templateHelp}</p>
          </div>
          <div className="w-full space-y-1.5 sm:w-64">
            <Label htmlFor="summary-language">{c.summaryLanguage}</Label>
            <Select
              value={form.summaryLanguage}
              onValueChange={(value) => value && setForm((f) => ({ ...f, summaryLanguage: value as SummaryLanguage }))}
              items={(["auto", "en", "es"] as const).map((value) => ({ value, label: c.languages[value] }))}
            >
              <SelectTrigger id="summary-language" className="w-full bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["auto", "en", "es"] as const).map((value) => (
                  <SelectItem key={value} value={value}>
                    {c.languages[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label={c.presetsLabel}>
          {c.presets.map((preset) => {
            const active = preset.template === form.template.trim();
            return (
              <Button
                key={preset.name}
                size="sm"
                variant={active ? "secondary" : "outline"}
                aria-pressed={active}
                className={cn(active && "ring-2 ring-primary")}
                onClick={() => setForm((f) => ({ ...f, template: preset.template }))}
              >
                {preset.name}
              </Button>
            );
          })}
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <div>
            <Label htmlFor="template" className="sr-only">
              {c.templateTitle}
            </Label>
            <Textarea
              id="template"
              value={form.template}
              onChange={(e) => setForm((f) => ({ ...f, template: e.target.value }))}
              rows={7}
              aria-invalid={templateTooLong || undefined}
              aria-describedby="template-count"
              className="min-h-40 bg-card font-sans text-sm leading-relaxed"
            />
            <p
              id="template-count"
              className={cn("mt-1.5 text-right text-xs", templateTooLong ? "text-destructive" : "text-muted-foreground")}
            >
              {c.characters(n(form.template.trim().length), n(MAX_TEMPLATE_LENGTH))}
            </p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm font-medium">{c.eachSummaryHas}</p>
            {sections.length > 0 ? (
              <ol className="mt-3 space-y-2">
                {sections.map((section, i) => (
                  <li key={`${section}-${i}`} className="flex items-center gap-2 text-sm">
                    <span className="flex size-5 items-center justify-center rounded bg-accent text-[11px] font-semibold text-accent-foreground">
                      {i + 1}
                    </span>
                    {section}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">{c.noSections}</p>
            )}
            <p className="mt-4 text-xs text-muted-foreground">{c.plainText}</p>
          </div>
        </div>
      </div>

      <TrialCard
        summary={summary}
        form={form}
        disabled={!connected || !settingsValid || estimate.videos === 0}
        starting={trialStarting}
        onTry={tryOne}
      />

      <div className="rounded-lg border bg-card">
        <div className="grid gap-6 p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
          <div className="space-y-4">
            <h3 className="text-base font-semibold">{c.beforeStart}</h3>
            <ul className="space-y-1.5 text-sm">
              <li>
                <span className="font-semibold">{c.videosToSummarize(estimate.videos, n(estimate.videos))}</span>
                {c.toSummarize}
                {estimate.short > 0 && (
                  <span className="text-muted-foreground">{c.split(n(estimate.long), n(estimate.short))}</span>
                )}
              </li>
              {counts.duplicate > 0 && <li className="text-muted-foreground">{c.repeats(counts.duplicate)}</li>}
              {counts.invalid > 0 && (
                <li className="text-warning">
                  {c.invalid(
                    counts.invalid,
                    invalidRows
                      .slice(0, 8)
                      .map((r) => c.rowWord(String(displayRow(r.sheetRow))))
                      .join(", ") + (counts.invalid > 8 ? c.andMore : ""),
                  )}
                </li>
              )}
            </ul>
            <div className="flex items-start gap-3">
              <Switch
                id="overwrite"
                checked={form.overwrite}
                onCheckedChange={(overwrite) => setForm((f) => ({ ...f, overwrite }))}
              />
              <div className="space-y-0.5">
                <Label htmlFor="overwrite">{c.overwrite}</Label>
                <p className="text-xs text-muted-foreground">
                  {form.overwrite ? c.overwriteOn : counts.filled > 0 ? c.overwriteKept(counts.filled) : c.overwriteOff}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3 md:min-w-64 md:text-right">
            <div>
              <p className="text-sm text-muted-foreground">{c.estimatedCost}</p>
              <p className="text-3xl font-semibold tracking-tight">
                {n(estimate.credits)} <span className="text-base font-normal text-muted-foreground">{c.credits}</span>
              </p>
              {balance && !balance.unlimited && balance.total !== null && (
                <p className={cn("text-sm", short ? "text-warning" : "text-muted-foreground")}>{c.youHave(n(balance.total))}</p>
              )}
            </div>
            {connected ? (
              <Button size="lg" className="w-full md:w-auto" onClick={start} disabled={!canStart || starting}>
                {starting || saving ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />}
                {saving ? c.saving : c.start}
              </Button>
            ) : (
              <Button size="lg" className="w-full md:w-auto" onClick={onConnect}>
                {c.connectToStart}
              </Button>
            )}
          </div>
        </div>
        {(short || saveError) && (
          <div className="space-y-3 border-t px-6 py-4">
            {short && <p className="text-sm text-warning">{c.notEnough}</p>}
            {saveError && (
              <p className="text-sm text-destructive" role="alert">
                {saveError}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function TrialCard({
  summary,
  form,
  disabled,
  starting,
  onTry,
}: {
  summary: JobSummary;
  form: Form;
  disabled: boolean;
  starting: boolean;
  onTry: () => void;
}) {
  const { t } = useI18n();
  const c = t.configure;
  const { preview } = summary;
  const stale =
    preview && (preview.template !== form.template.trim() || preview.language !== form.summaryLanguage);
  const running = preview?.status === "running";

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-4 p-6">
        <div className="max-w-xl">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <FlaskConical className="size-4 text-primary" aria-hidden />
            {c.trialTitle}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{c.trialBody(CREDIT_COST.long)}</p>
        </div>
        <Button variant="outline" onClick={onTry} disabled={disabled || starting || running}>
          {starting || running ? <Loader2 className="animate-spin" aria-hidden /> : <FlaskConical aria-hidden />}
          {preview && !running ? c.trialAgain : c.trialButton}
        </Button>
      </div>

      {preview && (
        <div className="border-t px-6 py-5" aria-live="polite">
          {running && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{c.trialRunning(String(displayRow(preview.sheetRow)))}</p>
              <span className="block space-y-1.5" aria-hidden>
                <span className="block h-2.5 w-11/12 animate-pulse rounded bg-info-soft" />
                <span className="block h-2.5 w-3/4 animate-pulse rounded bg-info-soft" />
                <span className="block h-2.5 w-1/2 animate-pulse rounded bg-info-soft" />
              </span>
            </div>
          )}
          {preview.status === "done" && (
            <div className="space-y-3">
              <p className="text-sm font-medium">{c.trialResult(String(displayRow(preview.sheetRow)))}</p>
              <div className="max-h-72 overflow-y-auto rounded-md border bg-muted/40 p-4 text-sm leading-relaxed whitespace-pre-line">
                {preview.summary}
              </div>
              {preview.warning && <p className="text-sm text-warning">{preview.warning}</p>}
              <p className={cn("text-xs", stale ? "text-warning" : "text-muted-foreground")}>{stale ? c.trialStale : c.trialKept}</p>
            </div>
          )}
          {preview.status === "failed" && (
            <div className="space-y-1">
              <p className="text-sm font-medium text-destructive">{c.trialFailed}</p>
              <FailureNote message={preview.error ?? ""} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function ColumnSelect({
  id,
  table,
  value,
  allowNew,
  placeholder,
  onChange,
}: {
  id: string;
  table: TableInfo;
  value: number | "new" | null;
  allowNew?: boolean;
  placeholder?: string;
  onChange: (value: number | null) => void;
}) {
  const { t } = useI18n();
  const options = Array.from({ length: table.columnCount }, (_, i) => ({
    value: String(i),
    letter: columnLetter(i),
    name: table.headers[i] || t.configure.noHeader,
  }));
  if (allowNew) options.push({ value: "new", letter: columnLetter(table.columnCount), name: t.configure.newColumn });
  const items = options.map((o) => ({ value: o.value, label: `${o.letter} ${o.name}` }));
  const render = (option: (typeof options)[number]) => (
    <>
      <span className="inline-flex min-w-6 justify-center rounded bg-muted px-1 font-mono text-xs text-muted-foreground">
        {option.letter}
      </span>
      <span className="truncate">{option.name}</span>
    </>
  );

  return (
    <Select
      value={value === null ? null : String(value)}
      onValueChange={(next) => onChange(next === null || next === "new" ? null : Number(next))}
      items={items}
    >
      <SelectTrigger id={id} className="w-full bg-card">
        <SelectValue placeholder={placeholder}>
          {(selected: string | null) => {
            const option = options.find((o) => o.value === selected);
            return option ? render(option) : placeholder;
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {render(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PreviewGrid({
  table,
  videoCol,
  descriptionCol,
}: {
  table: TableInfo;
  videoCol: number | null;
  descriptionCol: number | "new";
}) {
  const { t, n } = useI18n();
  const c = t.configure;
  const extra = descriptionCol === "new" ? 1 : 0;
  const columns = Array.from({ length: table.columnCount + extra }, (_, i) => i);
  const targetCol = descriptionCol === "new" ? table.columnCount : descriptionCol;

  const tone = (col: number) =>
    col === videoCol ? "bg-info-soft/70" : col === targetCol ? "bg-success-soft/70" : undefined;

  return (
    <figure className="overflow-hidden rounded-lg border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/70 text-xs text-muted-foreground">
              <th scope="col" className="w-10 border-r border-b border-grid px-2 py-1 font-normal">
                <span className="sr-only">{t.run.columns.row}</span>
              </th>
              {columns.map((col) => (
                <th key={col} scope="col" className={cn("border-r border-b border-grid px-3 py-1 text-center font-mono font-normal", tone(col))}>
                  {columnLetter(col)}
                </th>
              ))}
            </tr>
            <tr>
              <th scope="row" className="border-r border-b border-grid bg-muted/70 px-2 py-2 text-center font-mono text-xs font-normal text-muted-foreground">
                {displayRow(table.headerRow)}
              </th>
              {columns.map((col) => (
                <th
                  key={col}
                  scope="col"
                  className={cn(
                    "max-w-56 border-r border-b border-grid px-3 py-2 text-left font-semibold whitespace-nowrap",
                    tone(col),
                    (col === videoCol || col === targetCol) && "outline-2 -outline-offset-2 outline-primary",
                  )}
                >
                  <span className="block truncate">
                    {col === table.columnCount && descriptionCol === "new" ? "Description" : table.headers[col] || ""}
                  </span>
                  {col === videoCol && <span className="block text-xs font-normal text-info">{c.videoLinks}</span>}
                  {col === targetCol && (
                    <span className="block text-xs font-normal text-success">
                      {descriptionCol === "new" ? c.newColumnForSummaries : c.summariesGoHere}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.preview.map(({ sheetRow, cells }) => (
              <tr key={sheetRow}>
                <th scope="row" className="border-r border-b border-grid bg-muted/70 px-2 py-1.5 text-center font-mono text-xs font-normal text-muted-foreground">
                  {displayRow(sheetRow)}
                </th>
                {columns.map((col) => (
                  <td key={col} className={cn("max-w-56 border-r border-b border-grid px-3 py-1.5", tone(col))}>
                    <span className="block truncate text-muted-foreground">{cells[col] ?? ""}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <figcaption className="border-t px-3 py-2 text-xs text-muted-foreground">
        {c.previewCaption(Math.min(table.preview.length, table.rowCount), n(table.rowCount))}
      </figcaption>
    </figure>
  );
}
