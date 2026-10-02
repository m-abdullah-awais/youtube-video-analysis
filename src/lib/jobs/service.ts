import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, type Db } from "../db";
import { detectColumns, planRows, type ColumnGuess } from "../sheet/detect";
import { readTable, writeColumn, type Table } from "../sheet/workbook";
import { buildPrompt, DEFAULT_TEMPLATE } from "../template/template";
import { CREDIT_COST } from "../vidiq/costs";
import { configureJob, createJob, getJob, listRows, updateJobSheet, type Job, type JobRow, type RowStatus } from "./repo";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_ROWS = 5_000;
const PREVIEW_ROWS = 8;

/** A problem the user can fix; shown as-is in the UI. */
export class UserError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "UserError";
  }
}

export type FileStore = {
  save(jobId: string, data: Uint8Array): void;
  read(jobId: string): Uint8Array;
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
  };
}

export type TableInfo = {
  sheetNames: string[];
  sheetName: string;
  headers: string[];
  columnCount: number;
  rowCount: number;
  preview: string[][];
  guess: ColumnGuess;
};

export type ConfigureInput = {
  sheetName?: string;
  videoCol: number;
  descriptionCol: number | "new";
  template: string;
  overwrite: boolean;
};

export function createFromUpload(db: Db, store: FileStore, fileName: string, data: Uint8Array): { jobId: string } {
  if (data.byteLength > MAX_UPLOAD_BYTES) throw new UserError("This file is over 20 MB. Split it into smaller files.");
  const table = parseOrExplain(data, fileName);
  if (table.rows.length === 0) throw new UserError("This file has no video rows under the header row.");
  if (table.rows.length > MAX_ROWS) {
    throw new UserError(`This file has ${table.rows.length} rows. Upload ${MAX_ROWS} or fewer at a time.`);
  }

  const jobId = randomUUID();
  store.save(jobId, data);
  createJob(db, { id: jobId, fileName, format: table.format, sheetName: table.sheetName, headerRow: table.headerRow });

  const guess = detectColumns(table.headers, table.rows);
  if (guess.video !== null) {
    applyConfig(db, jobId, table, guess, {
      videoCol: guess.video,
      descriptionCol: guess.description ?? "new",
      template: DEFAULT_TEMPLATE,
      overwrite: false,
    });
  }
  return { jobId };
}

export function getTableInfo(db: Db, store: FileStore, jobId: string, sheetName?: string): TableInfo {
  const job = requireJob(db, jobId);
  const table = loadTable(store, job, sheetName);
  if (sheetName && sheetName !== job.sheetName) updateJobSheet(db, jobId, table.sheetName, table.headerRow);
  return {
    sheetNames: table.sheetNames,
    sheetName: table.sheetName,
    headers: table.headers,
    columnCount: columnCount(table),
    rowCount: table.rows.length,
    preview: table.rows.slice(0, PREVIEW_ROWS).map((r) => r.cells.slice(0, columnCount(table))),
    guess: detectColumns(table.headers, table.rows),
  };
}

export function configure(db: Db, store: FileStore, jobId: string, input: ConfigureInput): void {
  const job = requireJob(db, jobId);
  const started = listRows(db, jobId).some((r) => ["running", "done", "failed"].includes(r.status) && r.duplicateOf === null);
  if (job.status !== "draft" || started) {
    throw new UserError("This run has already started. Upload the file again to change its settings.", 409);
  }
  const table = loadTable(store, job, input.sheetName);
  if (table.sheetName !== job.sheetName) updateJobSheet(db, jobId, table.sheetName, table.headerRow);
  applyConfig(db, jobId, table, detectColumns(table.headers, table.rows), input);
}

export type JobSummary = {
  job: Job;
  rows: JobRow[];
  counts: Record<RowStatus, number> & { total: number };
  estimate: { videos: number; long: number; short: number; credits: number };
};

export function summarize(db: Db, jobId: string): JobSummary {
  const job = requireJob(db, jobId);
  const rows = listRows(db, jobId);
  const counts = { total: rows.length, pending: 0, running: 0, done: 0, failed: 0, filled: 0, invalid: 0, duplicate: 0 };
  for (const row of rows) counts[row.status]++;

  const queued = rows.filter((r) => r.status === "pending" || (r.status === "running" && !r.vidiqJobId));
  const short = queued.filter((r) => r.isShort).length;
  const long = queued.length - short;
  return {
    job,
    rows,
    counts,
    estimate: { videos: queued.length, long, short, credits: long * CREDIT_COST.long + short * CREDIT_COST.short },
  };
}

export function downloadResult(db: Db, store: FileStore, jobId: string) {
  const job = requireJob(db, jobId);
  if (job.descriptionCol === null) throw new UserError("Choose a Description column first.");
  const values = new Map<number, string>();
  for (const row of listRows(db, jobId)) {
    if (row.status === "done" && row.summary) values.set(row.sheetRow, row.summary);
  }
  const data = writeColumn(store.read(jobId), job.fileName, {
    sheetName: job.sheetName,
    column: job.descriptionCol,
    header: job.descriptionHeader ? { row: job.headerRow, text: job.descriptionHeader } : undefined,
    values,
  });
  const dot = job.fileName.lastIndexOf(".");
  const base = dot > 0 ? job.fileName.slice(0, dot) : job.fileName;
  return { fileName: `${base} (summaries).${job.format}`, contentType: CONTENT_TYPES[job.format], data };
}

const CONTENT_TYPES = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
} as const;

function applyConfig(db: Db, jobId: string, table: Table, guess: ColumnGuess, input: ConfigureInput) {
  const width = columnCount(table);
  try {
    buildPrompt(input.template);
  } catch (error) {
    throw new UserError((error as Error).message);
  }
  if (!Number.isInteger(input.videoCol) || input.videoCol < 0 || input.videoCol >= width) {
    throw new UserError("Choose the column that holds the video links.");
  }
  const isNew = input.descriptionCol === "new";
  const descriptionCol = isNew ? width : (input.descriptionCol as number);
  if (!isNew && (descriptionCol < 0 || descriptionCol >= width || descriptionCol === input.videoCol)) {
    throw new UserError("Choose a Description column that is different from the video column.");
  }

  const plan = planRows(table.rows, { video: input.videoCol, description: isNew ? null : descriptionCol }, {
    overwrite: input.overwrite,
  });
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
      overwrite: input.overwrite,
    },
    plan,
    titles,
  );
}

function requireJob(db: Db, jobId: string): Job {
  const job = getJob(db, jobId);
  if (!job) throw new UserError("This run no longer exists.", 404);
  return job;
}

function loadTable(store: FileStore, job: Job, sheetName?: string): Table {
  return parseOrExplain(store.read(job.id), job.fileName, sheetName ?? job.sheetName);
}

function parseOrExplain(data: Uint8Array, fileName: string, sheetName?: string): Table {
  try {
    return readTable(data, fileName, sheetName);
  } catch (error) {
    throw new UserError(error instanceof Error ? error.message : "This file could not be read.");
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
