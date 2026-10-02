import type { Db } from "../db";
import type { PlannedRow } from "../sheet/detect";
import type { SheetFormat } from "../sheet/workbook";

export type JobStatus = "draft" | "running" | "paused" | "completed";
export type PauseReason = "user" | "credits" | "auth";
export type RowStatus = "pending" | "running" | "done" | "failed" | "filled" | "invalid" | "duplicate";

export type Job = {
  id: string;
  createdAt: number;
  fileName: string;
  format: SheetFormat;
  sheetName: string;
  headerRow: number;
  videoCol: number | null;
  descriptionCol: number | null;
  /** Set when the Description column is new and needs a header cell. */
  descriptionHeader: string | null;
  template: string;
  overwrite: boolean;
  status: JobStatus;
  pauseReason: PauseReason | null;
  startedAt: number | null;
  finishedAt: number | null;
};

export type JobRow = {
  sheetRow: number;
  title: string | null;
  source: string;
  videoId: string | null;
  isShort: boolean;
  status: RowStatus;
  duplicateOf: number | null;
  vidiqJobId: string | null;
  summary: string | null;
  warning: string | null;
  error: string | null;
  attempts: number;
  updatedAt: number;
};

export type JobConfig = {
  videoCol: number;
  descriptionCol: number;
  descriptionHeader: string | null;
  template: string;
  overwrite: boolean;
};

type Raw = Record<string, unknown>;

const toJob = (r: Raw): Job => ({
  id: r.id as string,
  createdAt: r.created_at as number,
  fileName: r.file_name as string,
  format: r.format as SheetFormat,
  sheetName: r.sheet_name as string,
  headerRow: r.header_row as number,
  videoCol: (r.video_col as number | null) ?? null,
  descriptionCol: (r.description_col as number | null) ?? null,
  descriptionHeader: (r.description_header as string | null) ?? null,
  template: r.template as string,
  overwrite: r.overwrite === 1,
  status: r.status as JobStatus,
  pauseReason: (r.pause_reason as PauseReason | null) ?? null,
  startedAt: (r.started_at as number | null) ?? null,
  finishedAt: (r.finished_at as number | null) ?? null,
});

const toRow = (r: Raw): JobRow => ({
  sheetRow: r.sheet_row as number,
  title: (r.title as string | null) ?? null,
  source: r.source as string,
  videoId: (r.video_id as string | null) ?? null,
  isShort: r.is_short === 1,
  status: r.status as RowStatus,
  duplicateOf: (r.duplicate_of as number | null) ?? null,
  vidiqJobId: (r.vidiq_job_id as string | null) ?? null,
  summary: (r.summary as string | null) ?? null,
  warning: (r.warning as string | null) ?? null,
  error: (r.error as string | null) ?? null,
  attempts: r.attempts as number,
  updatedAt: r.updated_at as number,
});

export function createJob(
  db: Db,
  input: { id: string; fileName: string; format: SheetFormat; sheetName: string; headerRow: number },
): void {
  db.prepare(
    "INSERT INTO jobs (id, created_at, file_name, format, sheet_name, header_row) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(input.id, Date.now(), input.fileName, input.format, input.sheetName, input.headerRow);
}

export function getJob(db: Db, id: string): Job | null {
  const row = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as Raw | undefined;
  return row ? toJob(row) : null;
}

export function listJobs(db: Db, limit = 10): Job[] {
  return (db.prepare("SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?").all(limit) as Raw[]).map(toJob);
}

export function deleteJob(db: Db, id: string): void {
  db.prepare("DELETE FROM jobs WHERE id = ?").run(id);
}

export function updateJobSheet(db: Db, id: string, sheetName: string, headerRow: number): void {
  db.prepare("UPDATE jobs SET sheet_name = ?, header_row = ? WHERE id = ?").run(sheetName, headerRow, id);
}

/** Saves the column mapping and template, and replaces the row plan. */
export function configureJob(db: Db, id: string, config: JobConfig, plan: PlannedRow[], titles: Map<number, string>): void {
  const now = Date.now();
  db.exec("BEGIN");
  try {
    db.prepare(
      "UPDATE jobs SET video_col = ?, description_col = ?, description_header = ?, template = ?, overwrite = ? WHERE id = ?",
    ).run(config.videoCol, config.descriptionCol, config.descriptionHeader, config.template, config.overwrite ? 1 : 0, id);
    db.prepare("DELETE FROM job_rows WHERE job_id = ?").run(id);

    const firstPending = new Map<string, number>();
    for (const row of plan) {
      if (row.status === "pending" && row.videoId) firstPending.set(row.videoId, row.sheetRow);
    }
    const insert = db.prepare(
      `INSERT INTO job_rows (job_id, sheet_row, title, source, video_id, is_short, status, duplicate_of, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const row of plan) {
      const duplicateOf = row.status === "duplicate" && row.videoId ? (firstPending.get(row.videoId) ?? null) : null;
      insert.run(
        id,
        row.sheetRow,
        titles.get(row.sheetRow) ?? null,
        row.source,
        row.videoId,
        row.isShort ? 1 : 0,
        row.status,
        duplicateOf,
        now,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function setJobStatus(db: Db, id: string, status: JobStatus, pauseReason: PauseReason | null = null): void {
  const now = Date.now();
  db.prepare(
    `UPDATE jobs SET status = ?, pause_reason = ?,
       started_at = CASE WHEN ? = 'running' THEN COALESCE(started_at, ?) ELSE started_at END,
       finished_at = CASE WHEN ? = 'completed' THEN ? ELSE NULL END
     WHERE id = ?`,
  ).run(status, pauseReason, status, now, status, now, id);
}

export function listRows(db: Db, jobId: string): JobRow[] {
  return (db.prepare("SELECT * FROM job_rows WHERE job_id = ? ORDER BY sheet_row").all(jobId) as Raw[]).map(toRow);
}

export function getRow(db: Db, jobId: string, sheetRow: number): JobRow | null {
  const row = db.prepare("SELECT * FROM job_rows WHERE job_id = ? AND sheet_row = ?").get(jobId, sheetRow) as
    | Raw
    | undefined;
  return row ? toRow(row) : null;
}

const COLUMNS: Record<string, string> = {
  status: "status",
  vidiqJobId: "vidiq_job_id",
  summary: "summary",
  warning: "warning",
  error: "error",
  attempts: "attempts",
};

type RowPatch = Partial<Pick<JobRow, "status" | "vidiqJobId" | "summary" | "warning" | "error" | "attempts">>;

export function markRow(db: Db, jobId: string, sheetRow: number, patch: RowPatch): void {
  const keys = Object.keys(patch) as (keyof RowPatch)[];
  const sets = keys.map((k) => `${COLUMNS[k]} = ?`).concat("updated_at = ?");
  const values = keys.map((k) => patch[k] as string | number | null);
  db.prepare(`UPDATE job_rows SET ${sets.join(", ")} WHERE job_id = ? AND sheet_row = ?`).run(
    ...values,
    Date.now(),
    jobId,
    sheetRow,
  );
}

/** Atomically moves the next pending row to running. */
export function claimNextPending(db: Db, jobId: string): JobRow | null {
  const row = db
    .prepare(
      `UPDATE job_rows SET status = 'running', attempts = attempts + 1, error = NULL, updated_at = ?
       WHERE rowid = (SELECT rowid FROM job_rows WHERE job_id = ? AND status = 'pending' ORDER BY sheet_row LIMIT 1)
       RETURNING *`,
    )
    .get(Date.now(), jobId) as Raw | undefined;
  return row ? toRow(row) : null;
}

/** Saves a finished summary on the row and on every duplicate of it. */
export function completeRow(db: Db, jobId: string, sheetRow: number, summary: string, warning: string | null): void {
  const now = Date.now();
  db.prepare(
    `UPDATE job_rows SET status = 'done', summary = ?, warning = ?, error = NULL, updated_at = ?
     WHERE job_id = ? AND (sheet_row = ? OR (duplicate_of = ? AND status = 'duplicate'))`,
  ).run(summary, warning, now, jobId, sheetRow, sheetRow);
}

export function retryFailed(db: Db, jobId: string, sheetRow?: number): number {
  const result = db
    .prepare(
      `UPDATE job_rows SET status = 'pending', error = NULL, vidiq_job_id = NULL, attempts = 0, updated_at = ?
       WHERE job_id = ? AND status = 'failed' AND (? IS NULL OR sheet_row = ?)`,
    )
    .run(Date.now(), jobId, sheetRow ?? null, sheetRow ?? null);
  return Number(result.changes);
}

/** Rows left running by a stopped process: keep polling those with a vidIQ job, re-queue the rest. */
export function recoverInterrupted(db: Db, jobId: string): JobRow[] {
  db.prepare(
    "UPDATE job_rows SET status = 'pending', attempts = MAX(attempts - 1, 0) WHERE job_id = ? AND status = 'running' AND vidiq_job_id IS NULL",
  ).run(jobId);
  return (db.prepare("SELECT * FROM job_rows WHERE job_id = ? AND status = 'running' ORDER BY sheet_row").all(jobId) as Raw[]).map(toRow);
}

export function hasPending(db: Db, jobId: string): boolean {
  return !!db.prepare("SELECT 1 FROM job_rows WHERE job_id = ? AND status IN ('pending', 'running') LIMIT 1").get(jobId);
}
