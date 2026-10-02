"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, Play } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage, type JobSummary, type TableInfo, type VidiqStatus } from "@/lib/client/api";
import { columnLetter, displayRow, formatNumber, plural } from "@/lib/client/format";
import { DEFAULT_TEMPLATE, MAX_TEMPLATE_LENGTH, templateSections } from "@/lib/template/template";
import { cn } from "@/lib/utils";
import { PanelHeader } from "./panel-header";

const PRESETS = [
  { name: "Summary, key points, topics", template: DEFAULT_TEMPLATE },
  {
    name: "Short paragraph",
    template: "Summary: one paragraph of 3-4 sentences on what the video covers and why it is worth watching.",
  },
  { name: "Key points only", template: "Key Points: 5 bullet points with the most useful takeaways, one line each." },
  {
    name: "Detailed",
    template: [
      "Summary: 3-4 sentences on what the video covers.",
      "Key Points: 4-6 bullet points with the main takeaways.",
      "Who it is for: one sentence describing the ideal viewer.",
      "Topics: a comma-separated list of the main topics.",
    ].join("\n"),
  },
];

type Form = { videoCol: number | null; descriptionCol: number | "new"; template: string; overwrite: boolean };

type Props = {
  summary: JobSummary;
  vidiq: VidiqStatus | null;
  onSummary: (summary: JobSummary) => void;
  onStarted: (summary: JobSummary) => void;
  onConnect: () => void;
};

export function ConfigurePanel({ summary, vidiq, onSummary, onStarted, onConnect }: Props) {
  const { job } = summary;
  const [table, setTable] = useState<TableInfo | null>(null);
  const [tableError, setTableError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(() => ({
    videoCol: job.videoCol,
    descriptionCol: job.descriptionHeader || job.descriptionCol === null ? "new" : job.descriptionCol,
    template: job.template || DEFAULT_TEMPLATE,
    overwrite: job.overwrite,
  }));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
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
    setStarting(true);
    try {
      onStarted(await api.start(job.id));
    } catch (e) {
      setSaveError(errorMessage(e));
    } finally {
      setStarting(false);
    }
  };

  const sections = useMemo(() => templateSections(form.template), [form.template]);
  const connected = vidiq?.connection.status === "connected";
  const balance = vidiq?.balance;
  const { counts, estimate } = summary;
  const short = balance && !balance.unlimited && balance.total !== null && balance.total < estimate.credits;
  const templateTooLong = form.template.trim().length > MAX_TEMPLATE_LENGTH;
  const canStart =
    connected && form.videoCol !== null && estimate.videos > 0 && !saving && !saveError && !templateTooLong && !!form.template.trim();

  return (
    <section aria-labelledby="configure-title" className="space-y-8">
      <PanelHeader
        id="configure-title"
        title="Choose columns and template"
        description={
          <>
            <span className="font-medium text-foreground">{job.fileName}</span>
            {table ? `, ${plural(table.rowCount, "row")}` : ""}. We picked the columns automatically; change them if they are wrong.
          </>
        }
      />

      {tableError && (
        <Alert variant="destructive">
          <AlertTitle>The file could not be read</AlertTitle>
          <AlertDescription>{tableError}</AlertDescription>
        </Alert>
      )}

      {!table && !tableError && <div className="h-72 animate-pulse rounded-lg bg-muted" aria-label="Loading the file" />}

      {table && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {table.sheetNames.length > 1 && (
              <Field label="Sheet" id="sheet">
                <Select
                  value={table.sheetName}
                  onValueChange={(value) => value && void loadTable(value)}
                  items={table.sheetNames.map((name) => ({ value: name, label: name }))}
                >
                  <SelectTrigger id="sheet" className="w-full">
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
            <Field label="Video links are in" id="video-col">
              <ColumnSelect
                id="video-col"
                table={table}
                value={form.videoCol}
                placeholder="Choose a column"
                onChange={(videoCol) => setForm((f) => ({ ...f, videoCol }))}
              />
            </Field>
            <Field label="Write summaries into" id="description-col">
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
              <AlertTitle>No YouTube links found</AlertTitle>
              <AlertDescription>Choose the column that holds the video links or IDs.</AlertDescription>
            </Alert>
          )}

          <PreviewGrid table={table} videoCol={form.videoCol} descriptionCol={form.descriptionCol} />
        </div>
      )}

      <div className="space-y-4">
        <div>
          <h3 className="text-base font-semibold">Summary template</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Every summary follows this structure. Start each section with its name and a colon.
          </p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Template presets">
          {PRESETS.map((preset) => {
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
              Summary template
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
              {formatNumber(form.template.trim().length)} of {formatNumber(MAX_TEMPLATE_LENGTH)} characters
            </p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm font-medium">Each summary will have</p>
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
              <p className="mt-2 text-sm text-muted-foreground">
                No sections found yet. Write lines like &quot;Summary: 2 sentences&quot; so every summary has the same shape.
              </p>
            )}
            <p className="mt-4 text-xs text-muted-foreground">Written as plain text, ready for a YouTube description.</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="grid gap-6 p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
          <div className="space-y-4">
            <h3 className="text-base font-semibold">Before you start</h3>
            <ul className="space-y-1.5 text-sm">
              <li>
                <span className="font-semibold">{plural(estimate.videos, "video")}</span> to summarize
                {estimate.short > 0 && (
                  <span className="text-muted-foreground">
                    {" "}
                    ({plural(estimate.long, "long video")}, {plural(estimate.short, "Short")})
                  </span>
                )}
              </li>
              {counts.duplicate > 0 && (
                <li className="text-muted-foreground">
                  {plural(counts.duplicate, "row repeats", "rows repeat")} a video and will reuse its summary
                </li>
              )}
              {counts.invalid > 0 && (
                <li className="text-warning">
                  {plural(counts.invalid, "row has", "rows have")} no YouTube link and will be skipped:{" "}
                  {summary.rows
                    .filter((r) => r.status === "invalid")
                    .slice(0, 8)
                    .map((r) => `row ${displayRow(r.sheetRow)}`)
                    .join(", ")}
                  {counts.invalid > 8 ? ", and more" : ""}
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
                <Label htmlFor="overwrite">Replace descriptions that already have text</Label>
                <p className="text-xs text-muted-foreground">
                  {form.overwrite
                    ? "Existing descriptions will be replaced with new summaries."
                    : counts.filled > 0
                      ? `${plural(counts.filled, "row")} with a description will be kept as is.`
                      : "Rows that already have a description are kept as is."}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3 md:min-w-64 md:text-right">
            <div>
              <p className="text-sm text-muted-foreground">Estimated cost</p>
              <p className="text-3xl font-semibold tracking-tight">
                {formatNumber(estimate.credits)} <span className="text-base font-normal text-muted-foreground">credits</span>
              </p>
              {balance && !balance.unlimited && balance.total !== null && (
                <p className={cn("text-sm", short ? "text-warning" : "text-muted-foreground")}>
                  You have {formatNumber(balance.total)} credits
                </p>
              )}
            </div>
            {connected ? (
              <Button size="lg" className="w-full md:w-auto" onClick={start} disabled={!canStart || starting}>
                {starting || saving ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />}
                {saving ? "Saving settings" : "Start summaries"}
              </Button>
            ) : (
              <Button size="lg" className="w-full md:w-auto" onClick={onConnect}>
                Connect vidIQ to start
              </Button>
            )}
          </div>
        </div>
        {(short || saveError) && (
          <div className="space-y-3 border-t px-6 py-4">
            {short && (
              <p className="text-sm text-warning">
                Not enough credits for every video. The run pauses when credits run out, and you can resume after
                adding credits in vidIQ.
              </p>
            )}
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
  const options = Array.from({ length: table.columnCount }, (_, i) => ({
    value: String(i),
    letter: columnLetter(i),
    name: table.headers[i] || "(no header)",
  }));
  if (allowNew) options.push({ value: "new", letter: columnLetter(table.columnCount), name: "New column: Description" });
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
                <span className="sr-only">Row</span>
              </th>
              {columns.map((c) => (
                <th key={c} scope="col" className={cn("border-r border-b border-grid px-3 py-1 text-center font-mono font-normal", tone(c))}>
                  {columnLetter(c)}
                </th>
              ))}
            </tr>
            <tr>
              <th scope="row" className="border-r border-b border-grid bg-muted/70 px-2 py-2 text-center font-mono text-xs font-normal text-muted-foreground">
                {displayRow(table.headerRow)}
              </th>
              {columns.map((c) => (
                <th
                  key={c}
                  scope="col"
                  className={cn(
                    "max-w-56 border-r border-b border-grid px-3 py-2 text-left font-semibold whitespace-nowrap",
                    tone(c),
                    (c === videoCol || c === targetCol) && "outline-2 -outline-offset-2 outline-primary",
                  )}
                >
                  <span className="block truncate">
                    {c === table.columnCount && descriptionCol === "new" ? "Description" : table.headers[c] || ""}
                  </span>
                  {c === videoCol && <span className="block text-xs font-normal text-info">Video links</span>}
                  {c === targetCol && (
                    <span className="block text-xs font-normal text-success">
                      {descriptionCol === "new" ? "New column for summaries" : "Summaries go here"}
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
                {columns.map((c) => (
                  <td key={c} className={cn("max-w-56 border-r border-b border-grid px-3 py-1.5", tone(c))}>
                    <span className="block truncate text-muted-foreground">{cells[c] ?? ""}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <figcaption className="border-t px-3 py-2 text-xs text-muted-foreground">
        Showing the first {Math.min(table.preview.length, table.rowCount)} of {plural(table.rowCount, "video row")}.
      </figcaption>
    </figure>
  );
}
