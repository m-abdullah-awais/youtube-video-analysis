import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, type Db } from "../db";
import { detectColumns, planRows, type ColumnGuess } from "../sheet/detect";
import { readTable, writeColumn, type Table } from "../sheet/workbook";
import {
  buildPrompt,
  cleanSummary,
  DEFAULT_TEMPLATE,
  MAX_TEMPLATE_LENGTH,
  sectionWarning,
  splitBilingual,
  templateProblem,
} from "../template/template";
import { UserError } from "../user-error";
import { CREDIT_COST } from "../vidiq/costs";
import {
  completeRow,
  configureJob,
  linkAsDuplicate,
  listTranscripts,
  queueTranscripts,
  setRowsPending,
  countRows,
  createJob,
  deleteJob,
  getJob,
  getPreview,
  getRow,
  listJobIds,
  listJobs,
  listRows,
  renameJob,
  requeueRow,
  saveEditedSummary,
  savePreview,
  updateJobSheet,
  type Job,
  type JobRow,
  type Preview,
  type DescriptionLanguage,
  type Language,
  type RowStatus,
  type Selection,
  type Transcript,
} from "./repo";
import { SPANISH_MISSING, type Gateway } from "./runner";

export { UserError };
export { getPreview };

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_ROWS = 5_000;
const PREVIEW_ROWS = 8;
const MAX_NAME_LENGTH = 120;

export type FileStore = {
  save(jobId: string, data: Uint8Array): void;
  read(jobId: string): Uint8Array;
  remove(jobId: string): void;
};

export function diskStore(dir = path.join(DATA_DIR, "jobs")): FileStore {
  const fileFor = (jobId: string) => path.join(dir, jobId, "original");
  return {
    save(jobId, data) {
      fs.mkdirSync(path.dirname(fileFor(jobId)), { recursive: true });
      fs.writeFileSync(fileFor(jobId), data);
    },
    read(jobId) {
      return new Uint8Array(fs.readFileSync(fileFor(jobId)));
    },
    remove(jobId) {
      fs.rmSync(path.join(dir, jobId), { recursive: true, force: true });
    },
  };
}

export function memoryStore(): FileStore {
  const files = new Map<string, Uint8Array>();
  return {
    save: (jobId, data) => void files.set(jobId, data),
    read: (jobId) => {
      const data = files.get(jobId);
      if (!data) throw new Error(`No file for job ${jobId}`);
      return data;
    },
    remove: (jobId) => void files.delete(jobId),
  };
}

export type TableInfo = {
  sheetNames: string[];
  sheetName: string;
  headers: string[];
  columnCount: number;
  headerRow: number;
  rowCount: number;
  preview: { sheetRow: number; cells: string[] }[];
  guess: ColumnGuess;
};

export type ConfigureInput = {
  sheetName?: string;
  videoCol: number;
  descriptionCol: number | "new";
  template: string;
  /** Omitted options keep the run's current value. */
  descriptionLanguage?: DescriptionLanguage;
  includeTranscripts?: boolean;
  selection?: Selection;
  overwrite: boolean;
};

export function createFromUpload(
  db: Db,
  store: FileStore,
  fileName: string,
  data: Uint8Array,
  options: { template?: string; descriptionLanguage?: DescriptionLanguage } = {},
): { jobId: string } {
  if (data.byteLength > MAX_UPLOAD_BYTES) throw new UserError("fileTooLarge");
  const table = parseOrExplain(data, fileName);
  if (table.rows.length === 0) throw new UserError("noRows");
  if (table.rows.length > MAX_ROWS) throw new UserError("tooManyRows", { rows: table.rows.length, max: MAX_ROWS });

  const jobId = randomUUID();
  store.save(jobId, data);
  createJob(db, { id: jobId, fileName, format: table.format, sheetName: table.sheetName, headerRow: table.headerRow });

  const guess = detectColumns(table.headers, table.rows);
  if (guess.video !== null) {
    applyConfig(db, jobId, table, guess, {
      videoCol: guess.video,
      descriptionCol: guess.description ?? "new",
      template: options.template ?? DEFAULT_TEMPLATE,
      descriptionLanguage: options.descriptionLanguage ?? "en",
      includeTranscripts: true,
      selection: { mode: "all" },
      overwrite: false,
    });
  }
  return { jobId };
}

export function getTableInfo(db: Db, store: FileStore, jobId: string, sheetName?: string): TableInfo {
  const job = requireJob(db, jobId);
  const table = loadTable(store, job, sheetName);
  if (sheetName && sheetName !== job.sheetName) updateJobSheet(db, jobId, table.sheetName, table.headerRow);
  const width = columnCount(table);
  return {
    sheetNames: table.sheetNames,
    sheetName: table.sheetName,
    headers: table.headers,
    columnCount: width,
    headerRow: table.headerRow,
    rowCount: table.rows.length,
    preview: table.rows.slice(0, PREVIEW_ROWS).map((r) => ({ sheetRow: r.sheetRow, cells: r.cells.slice(0, width) })),
    guess: detectColumns(table.headers, table.rows),
  };
}

export function configure(db: Db, store: FileStore, jobId: string, input: ConfigureInput): void {
  const job = requireJob(db, jobId);
  const counts = countRows(db, jobId);
  if (job.status !== "draft" || counts.running + counts.done + counts.failed > 0) {
    throw new UserError("runStarted", {}, 409);
  }
  const table = loadTable(store, job, input.sheetName);
  if (table.sheetName !== job.sheetName) updateJobSheet(db, jobId, table.sheetName, table.headerRow);
  applyConfig(db, jobId, table, detectColumns(table.headers, table.rows), {
    ...input,
    descriptionLanguage: input.descriptionLanguage ?? job.descriptionLanguage,
    includeTranscripts: input.includeTranscripts ?? job.includeTranscripts,
    selection: input.selection ?? job.selection,
  });
}

export type Counts = Record<RowStatus, number> & { total: number };

export type JobSummary = {
  job: Job;
  /** All rows, or only the rows changed since the `since` time when `partial` is true. */
  rows: JobRow[];
  partial: boolean;
  /** Pass back as `since` to get only the next changes. */
  serverTime: number;
  counts: Counts;
  estimate: {
    videos: number;
    long: number;
    short: number;
    summaryCredits: number;
    transcriptCredits: number;
    credits: number;
  };
  preview: Preview | null;
};

function totals(db: Db, jobId: string): Counts {
  const counts = countRows(db, jobId);
  return { ...counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
}

export function summarize(db: Db, jobId: string, options: { since?: number } = {}): JobSummary {
  const serverTime = Date.now();
  const job = requireJob(db, jobId);
  const partial = options.since !== undefined;
  const rows = listRows(db, jobId, options.since);

  const queued = db
    .prepare(
      `SELECT is_short, COUNT(*) AS n FROM job_rows
       WHERE job_id = ? AND (status = 'pending' OR (status = 'running' AND vidiq_job_id IS NULL)) GROUP BY is_short`,
    )
    .all(jobId) as { is_short: number; n: number }[];
  const short = queued.find((q) => q.is_short === 1)?.n ?? 0;
  const long = queued.find((q) => q.is_short === 0)?.n ?? 0;
  const waitingTranscripts = (
    db.prepare("SELECT COUNT(*) AS n FROM row_transcripts WHERE job_id = ? AND status IN ('pending', 'running')").get(jobId) as {
      n: number;
    }
  ).n;
  const summaryCredits = long * CREDIT_COST.long + short * CREDIT_COST.short;
  const transcriptCredits =
    ((job.includeTranscripts ? (long + short) * 2 : 0) + waitingTranscripts) * CREDIT_COST.transcript;

  return {
    job,
    rows,
    partial,
    serverTime,
    counts: totals(db, jobId),
    estimate: {
      videos: long + short,
      long,
      short,
      summaryCredits,
      transcriptCredits,
      credits: summaryCredits + transcriptCredits,
    },
    preview: getPreview(db, jobId),
  };
}

export type RunListItem = Job & { counts: Counts };

export function listRuns(db: Db): RunListItem[] {
  return listJobs(db).map((job) => ({ ...job, counts: totals(db, job.id) }));
}

export function renameRun(db: Db, jobId: string, name: string): void {
  requireJob(db, jobId);
  const clean = name.trim().slice(0, MAX_NAME_LENGTH);
  if (!clean) throw new UserError("nameEmpty");
  renameJob(db, jobId, clean);
}

export function deleteRun(db: Db, store: FileStore, jobId: string): void {
  requireJob(db, jobId);
  deleteJob(db, jobId);
  store.remove(jobId);
}

export function clearAllRuns(db: Db, store: FileStore): number {
  const ids = listJobIds(db);
  for (const id of ids) deleteRun(db, store, id);
  return ids.length;
}

/** Saves a hand-written summary, in one language, for a finished or failed row. */
export function editRow(db: Db, jobId: string, sheetRow: number, summary: string, language: Language = "en"): void {
  const row = requireRow(db, jobId, sheetRow);
  if (row.status !== "done" && row.status !== "failed") throw new UserError("rowNotEditable");
  saveEditedSummary(db, jobId, sheetRow, language, summary.trim());
}

/**
 * Queues English and Spanish transcripts for finished videos (all, or the given rows).
 * The caller starts the runner. Returns how many videos got new work.
 */
export function requestTranscripts(db: Db, jobId: string, sheetRows?: number[]): number {
  requireJob(db, jobId);
  const wanted = sheetRows ? new Set(sheetRows) : null;
  const owners = new Set<number>();
  for (const row of listRows(db, jobId)) {
    if (row.status !== "done" || !row.videoId) continue;
    if (wanted && !wanted.has(row.sheetRow)) continue;
    owners.add(row.duplicateOf ?? row.sheetRow);
  }
  const queued = queueTranscripts(db, jobId, [...owners]);
  if (queued === 0) throw new UserError("nothingForTranscripts");
  return queued;
}

/** Adds rows that were left out of the run. Repeats of a video already in the run share its summary. */
export function includeRows(db: Db, jobId: string, sheetRows: number[]): number {
  requireJob(db, jobId);
  let changed = 0;
  for (const sheetRow of sheetRows) {
    const row = getRow(db, jobId, sheetRow);
    if (row?.status !== "excluded" || !row.videoId) continue;
    const other = listRows(db, jobId).find(
      (r) => r.videoId === row.videoId && r.sheetRow !== sheetRow && !["excluded", "invalid", "filled"].includes(r.status),
    );
    const owner = other && getRow(db, jobId, other.duplicateOf ?? other.sheetRow);
    if (owner) linkAsDuplicate(db, jobId, sheetRow, owner);
    else setRowsPending(db, jobId, [sheetRow]);
    changed++;
  }
  if (changed === 0) throw new UserError("nothingToInclude");
  return changed;
}

/** Asks vidIQ for a fresh summary of one row (the caller starts the runner). */
export function regenerateRow(db: Db, jobId: string, sheetRow: number): void {
  const row = requireRow(db, jobId, sheetRow);
  if (row.status === "running") throw new UserError("rowBusy", {}, 409);
  if (row.duplicateOf === null) {
    requeueRow(db, jobId, sheetRow);
    return;
  }
  // A repeated video shares its original's summary: regenerate the original, and let this row take the new result.
  db.prepare("UPDATE job_rows SET edited = 0 WHERE job_id = ? AND sheet_row = ?").run(jobId, sheetRow);
  requeueRow(db, jobId, row.duplicateOf);
}

/** Picks the first waiting video and records a trial run of the current template on it. */
export function startPreview(db: Db, jobId: string): Preview {
  const job = requireJob(db, jobId);
  const current = getPreview(db, jobId);
  if (current?.status === "running") throw new UserError("previewBusy", {}, 409);
  const problem = templateProblem(job.template);
  if (problem) throw new UserError(problem);
  const row = db
    .prepare("SELECT sheet_row FROM job_rows WHERE job_id = ? AND status = 'pending' ORDER BY sheet_row LIMIT 1")
    .get(jobId) as { sheet_row: number } | undefined;
  if (!row) throw new UserError("nothingToPreview");

  savePreview(db, jobId, {
    sheetRow: row.sheet_row,
    template: job.template,
    status: "running",
    vidiqJobId: null,
    summary: null,
    summaryEs: null,
    warning: null,
    error: null,
  });
  return getPreview(db, jobId)!;
}

/** Runs (or resumes) the recorded trial: submit once, then poll until vidIQ finishes. */
export async function runPreview(
  db: Db,
  jobId: string,
  gateway: Gateway,
  options: { pollMs: number; sleep?: (ms: number) => Promise<void> },
): Promise<void> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const preview = getPreview(db, jobId);
  const row = preview && getRow(db, jobId, preview.sheetRow);
  if (!preview || preview.status !== "running" || !row?.videoId) return;

  const save = (patch: Partial<Preview>) => savePreview(db, jobId, { ...getPreview(db, jobId)!, ...patch });
  try {
    let vidiqJobId = preview.vidiqJobId;
    if (!vidiqJobId) {
      vidiqJobId = await gateway.submit(
        { videoId: row.videoId, isShort: row.isShort, source: row.source },
        buildPrompt(preview.template),
      );
      save({ vidiqJobId });
    }
    for (;;) {
      await sleep(options.pollMs);
      const result = await gateway.poll(vidiqJobId);
      if (result.state === "running") continue;
      if (result.state === "done") {
        const split = splitBilingual(result.text, preview.template);
        const en = split?.en ?? cleanSummary(result.text, preview.template);
        const es = split?.es ?? null;
        const warning = [es ? null : SPANISH_MISSING, sectionWarning(preview.template, en, es)].filter(Boolean).join(". ") || null;
        save({ status: "done", summary: en, summaryEs: es, warning });
      } else {
        save({ status: "failed", error: result.message });
      }
      return;
    }
  } catch (error) {
    save({ status: "failed", error: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * If the trial finished with the settings the run is about to use, its summary
 * becomes that row's result, so the video is not sent to vidIQ (and paid for) twice.
 */
export function consumePreview(db: Db, jobId: string): boolean {
  const job = requireJob(db, jobId);
  const preview = getPreview(db, jobId);
  if (!preview || preview.status !== "done" || !preview.summary) return false;
  if (preview.template !== job.template) return false;
  if (getRow(db, jobId, preview.sheetRow)?.status !== "pending") return false;
  completeRow(db, jobId, preview.sheetRow, preview.summary, preview.summaryEs, preview.warning);
  if (job.includeTranscripts) queueTranscripts(db, jobId, [preview.sheetRow]);
  return true;
}

const LANGUAGE_NAME: Record<Language, string> = { en: "English", es: "Spanish" };

/**
 * The finished spreadsheet: the chosen language in the Description column, the other
 * language in a new column (when there is any), and optionally both transcripts.
 * Every other cell is left exactly as it was.
 */
export function downloadResult(db: Db, store: FileStore, jobId: string, options: { transcripts?: boolean } = {}) {
  const job = requireJob(db, jobId);
  if (job.descriptionCol === null) throw new UserError("chooseDescriptionColumn");
  const rows = listRows(db, jobId).filter((r) => r.status === "done");
  const text = (row: JobRow, language: Language) => (language === "es" ? row.summaryEs : row.summary);
  const primary = job.descriptionLanguage;
  const secondary: Language = primary === "en" ? "es" : "en";
  const valuesFor = (pick: (row: JobRow) => string | null | undefined) =>
    new Map(rows.flatMap((row) => {
      const value = pick(row);
      return value ? [[row.sheetRow, value] as const] : [];
    }));

  let data = writeColumn(store.read(jobId), job.fileName, {
    sheetName: job.sheetName,
    column: job.descriptionCol,
    header: job.descriptionHeader ? { row: job.headerRow, text: job.descriptionHeader } : undefined,
    values: valuesFor((row) => text(row, primary)),
  });

  // New columns go after everything already in the sheet (including a new Description column).
  let next = Math.max(columnCount(loadTable(store, job)), job.descriptionCol + 1);
  const addColumn = (header: string, values: Map<number, string>) => {
    data = writeColumn(data, job.fileName, { sheetName: job.sheetName, column: next++, header: { row: job.headerRow, text: header }, values });
  };

  const second = valuesFor((row) => text(row, secondary));
  if (second.size > 0) addColumn(`Description (${LANGUAGE_NAME[secondary]})`, second);
  if (options.transcripts) {
    const transcripts = listTranscripts(db, jobId);
    for (const language of ["en", "es"] as const) {
      addColumn(`Transcript (${LANGUAGE_NAME[language]})`, valuesFor((row) => transcripts.get(row.sheetRow)?.[language]?.text));
    }
  }

  const dot = job.fileName.lastIndexOf(".");
  const base = (dot > 0 ? job.fileName.slice(0, dot) : job.fileName).replace(/ \(summaries\)$/, "");
  return { fileName: `${base} (summaries).${job.format}`, contentType: CONTENT_TYPES[job.format], data };
}

export type ReportItem = {
  sheetRow: number;
  title: string | null;
  videoId: string | null;
  isShort: boolean;
  source: string;
  summaryEn: string | null;
  summaryEs: string | null;
  warning: string | null;
  transcripts: Record<Language, Pick<Transcript, "status" | "text"> | null>;
};

/** Everything the PDF needs for finished videos (all, or the given rows). */
export function report(db: Db, jobId: string, sheetRows?: number[]): { job: Job; items: ReportItem[] } {
  const job = requireJob(db, jobId);
  const wanted = sheetRows ? new Set(sheetRows) : null;
  const transcripts = listTranscripts(db, jobId);
  const pick = (t: Transcript | undefined) => (t ? { status: t.status, text: t.text } : null);
  const items = listRows(db, jobId)
    .filter((row) => row.status === "done" && (!wanted || wanted.has(row.sheetRow)))
    .map((row) => ({
      sheetRow: row.sheetRow,
      title: row.title,
      videoId: row.videoId,
      isShort: row.isShort,
      source: row.source,
      summaryEn: row.summary,
      summaryEs: row.summaryEs,
      warning: row.warning,
      transcripts: { en: pick(transcripts.get(row.sheetRow)?.en), es: pick(transcripts.get(row.sheetRow)?.es) },
    }));
  return { job, items };
}

const CONTENT_TYPES = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
} as const;

function applyConfig(db: Db, jobId: string, table: Table, guess: ColumnGuess, input: ConfigureInput) {
  const width = columnCount(table);
  const problem = templateProblem(input.template);
  if (problem) throw new UserError(problem, { max: MAX_TEMPLATE_LENGTH, length: input.template.trim().length });
  if (!Number.isInteger(input.videoCol) || input.videoCol < 0 || input.videoCol >= width) {
    throw new UserError("chooseVideoColumn");
  }
  const isNew = input.descriptionCol === "new";
  const descriptionCol = isNew ? width : (input.descriptionCol as number);
  if (!isNew && (descriptionCol < 0 || descriptionCol >= width || descriptionCol === input.videoCol)) {
    throw new UserError("chooseDescriptionColumn");
  }

  const mapping = { video: input.videoCol, description: isNew ? null : descriptionCol };
  const selection = input.selection ?? { mode: "all" };
  const plan = planRows(table.rows, mapping, { overwrite: input.overwrite, include: includeFor(selection, table, mapping, input.overwrite) });
  const titles = new Map<number, string>();
  if (guess.title !== null) for (const row of table.rows) titles.set(row.sheetRow, row.cells[guess.title] ?? "");

  configureJob(
    db,
    jobId,
    {
      videoCol: input.videoCol,
      descriptionCol,
      descriptionHeader: isNew ? "Description" : null,
      template: input.template.trim(),
      descriptionLanguage: input.descriptionLanguage ?? "en",
      includeTranscripts: input.includeTranscripts ?? true,
      selection,
      overwrite: input.overwrite,
    },
    plan,
    titles,
  );
}

/**
 * Turns a selection into a row filter. "First N" counts videos. Repeats of a chosen
 * video come along, since they reuse its summary at no extra cost.
 */
function includeFor(
  selection: Selection,
  table: Table,
  mapping: { video: number; description: number | null },
  overwrite: boolean,
): ((sheetRow: number) => boolean) | undefined {
  if (selection.mode === "all") return undefined;
  const everything = planRows(table.rows, mapping, { overwrite });
  const chosen =
    selection.mode === "first"
      ? everything.filter((r) => r.status === "pending").slice(0, Math.max(0, selection.count))
      : everything.filter((r) => selection.rows.includes(r.sheetRow));
  const videos = new Set(chosen.map((r) => r.videoId));
  const allowed = new Set([
    ...chosen.map((r) => r.sheetRow),
    ...everything.filter((r) => r.status === "duplicate" && videos.has(r.videoId)).map((r) => r.sheetRow),
  ]);
  return (sheetRow) => allowed.has(sheetRow);
}

function requireJob(db: Db, jobId: string): Job {
  const job = getJob(db, jobId);
  if (!job) throw new UserError("runNotFound", {}, 404);
  return job;
}

function requireRow(db: Db, jobId: string, sheetRow: number): JobRow {
  requireJob(db, jobId);
  const row = getRow(db, jobId, sheetRow);
  if (!row) throw new UserError("rowNotFound", {}, 404);
  return row;
}

function loadTable(store: FileStore, job: Job, sheetName?: string): Table {
  return parseOrExplain(store.read(job.id), job.fileName, sheetName ?? job.sheetName);
}

function parseOrExplain(data: Uint8Array, fileName: string, sheetName?: string): Table {
  try {
    return readTable(data, fileName, sheetName);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/CSV or Excel/.test(message)) throw new UserError("unsupportedFile");
    if (/sheet/i.test(message)) throw new UserError("sheetNotFound", { name: sheetName ?? "" });
    throw new UserError("unreadableFile");
  }
}

/** Widest used column, so a new Description column never overwrites unlabelled data. */
function columnCount(table: Table): number {
  let width = table.headers.length;
  for (const row of table.rows) {
    for (let c = row.cells.length - 1; c >= width; c--) {
      if (row.cells[c].trim() !== "") {
        width = c + 1;
        break;
      }
    }
  }
  return width;
}
