import type { Db } from "../db";
import type { PlannedRow } from "../sheet/detect";
import type { SheetFormat } from "../sheet/workbook";
import type { DescriptionLanguage } from "../template/template";

export type { DescriptionLanguage };
export type JobStatus = "draft" | "running" | "paused" | "completed";
export type PauseReason = "user" | "credits" | "auth";
export type RowStatus = "pending" | "running" | "done" | "failed" | "filled" | "invalid" | "duplicate" | "excluded";
export type Language = "en" | "es";
export const LANGUAGES: readonly Language[] = ["en", "es"];
export type TranscriptStatus = "pending" | "running" | "done" | "unavailable" | "failed";

/** Which videos a run processes. */
export type Selection = { mode: "all" } | { mode: "first"; count: number } | { mode: "rows"; rows: number[] };

export type Job = {
  id: string;
  createdAt: number;
  /** Display name; defaults to the file name. */
  name: string;
  fileName: string;
  format: SheetFormat;
  sheetName: string;
  headerRow: number;
  videoCol: number | null;
  descriptionCol: number | null;
  /** Set when the Description column is new and needs a header cell. */
  descriptionHeader: string | null;
  template: string;
  /** Language written into the Description column; the other gets its own column. */
  descriptionLanguage: DescriptionLanguage;
  includeTranscripts: boolean;
  selection: Selection;
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
  /** English summary. */
  summary: string | null;
  summaryEs: string | null;
  warning: string | null;
  error: string | null;
  attempts: number;
  /** Changed by hand; never overwritten by a regenerate of the original. */
  edited: boolean;
  /** Transcript state per language (a repeated video shows its original's). */
  transcripts: Record<Language, TranscriptStatus | null>;
  updatedAt: number;
};

export type JobConfig = {
  videoCol: number;
  descriptionCol: number;
  descriptionHeader: string | null;
  template: string;
  descriptionLanguage: DescriptionLanguage;
  includeTranscripts: boolean;
  selection: Selection;
  overwrite: boolean;
};

export type PreviewStatus = "running" | "done" | "failed";

export type Preview = {
  sheetRow: number;
  template: string;
  status: PreviewStatus;
  vidiqJobId: string | null;
  summary: string | null;
  summaryEs: string | null;
  warning: string | null;
  error: string | null;
  updatedAt: number;
};

export type Transcript = { status: TranscriptStatus; text: string | null; error: string | null };

type Raw = Record<string, unknown>;

function parseSelection(value: unknown): Selection {
  try {
    const parsed = JSON.parse(String(value ?? ""));
    if (parsed?.mode === "first" && Number.isInteger(parsed.count)) return { mode: "first", count: parsed.count };
    if (parsed?.mode === "rows" && Array.isArray(parsed.rows)) return { mode: "rows", rows: parsed.rows.filter(Number.isInteger) };
  } catch {
    // Older runs have no selection: they process everything.
  }
  return { mode: "all" };
}

const toJob = (r: Raw): Job => ({
  id: r.id as string,
  createdAt: r.created_at as number,
  name: ((r.name as string | null) ?? r.file_name) as string,
  fileName: r.file_name as string,
  format: r.format as SheetFormat,
  sheetName: r.sheet_name as string,
  headerRow: r.header_row as number,
  videoCol: (r.video_col as number | null) ?? null,
  descriptionCol: (r.description_col as number | null) ?? null,
  descriptionHeader: (r.description_header as string | null) ?? null,
  template: r.template as string,
  descriptionLanguage: r.summary_language === "es" ? "es" : "en",
  includeTranscripts: r.include_transcripts !== 0,
  selection: parseSelection(r.selection),
  overwrite: r.overwrite === 1,
  status: r.status as JobStatus,
  pauseReason: (r.pause_reason as PauseReason | null) ?? null,
  startedAt: (r.started_at as number | null) ?? null,
  finishedAt: (r.finished_at as number | null) ?? null,
});

const NO_TRANSCRIPTS: Record<Language, TranscriptStatus | null> = { en: null, es: null };

const toRow = (r: Raw, transcripts: Record<Language, TranscriptStatus | null> = NO_TRANSCRIPTS): JobRow => ({
  sheetRow: r.sheet_row as number,
  title: (r.title as string | null) ?? null,
  source: r.source as string,
  videoId: (r.video_id as string | null) ?? null,
  isShort: r.is_short === 1,
  status: r.status as RowStatus,
  duplicateOf: (r.duplicate_of as number | null) ?? null,
  vidiqJobId: (r.vidiq_job_id as string | null) ?? null,
  summary: (r.summary as string | null) ?? null,
  summaryEs: (r.summary_es as string | null) ?? null,
  warning: (r.warning as string | null) ?? null,
  error: (r.error as string | null) ?? null,
  attempts: r.attempts as number,
  edited: r.edited === 1,
  transcripts,
  updatedAt: r.updated_at as number,
});

const toPreview = (r: Raw): Preview => ({
  sheetRow: r.sheet_row as number,
  template: r.template as string,
  status: r.status as PreviewStatus,
  vidiqJobId: (r.vidiq_job_id as string | null) ?? null,
  summary: (r.summary as string | null) ?? null,
  summaryEs: (r.summary_es as string | null) ?? null,
  warning: (r.warning as string | null) ?? null,
  error: (r.error as string | null) ?? null,
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

export function listJobs(db: Db, limit = 50): Job[] {
  return (db.prepare("SELECT * FROM jobs ORDER BY created_at DESC, rowid DESC LIMIT ?").all(limit) as Raw[]).map(toJob);
}

export function listJobIds(db: Db): string[] {
  return (db.prepare("SELECT id FROM jobs").all() as { id: string }[]).map((r) => r.id);
}

export function renameJob(db: Db, id: string, name: string): void {
  db.prepare("UPDATE jobs SET name = ? WHERE id = ?").run(name, id);
}

export function deleteJob(db: Db, id: string): void {
  db.prepare("DELETE FROM row_transcripts WHERE job_id = ?").run(id);
  db.prepare("DELETE FROM job_rows WHERE job_id = ?").run(id);
  db.prepare("DELETE FROM job_previews WHERE job_id = ?").run(id);
  db.prepare("DELETE FROM jobs WHERE id = ?").run(id);
}

/** Row counts per status, without loading the rows themselves. */
export function countRows(db: Db, jobId: string): Record<RowStatus, number> {
  const counts = { pending: 0, running: 0, done: 0, failed: 0, filled: 0, invalid: 0, duplicate: 0, excluded: 0 };
  const rows = db.prepare("SELECT status, COUNT(*) AS n FROM job_rows WHERE job_id = ? GROUP BY status").all(jobId) as {
    status: RowStatus;
    n: number;
  }[];
  for (const row of rows) counts[row.status] = row.n;
  return counts;
}

export function updateJobSheet(db: Db, id: string, sheetName: string, headerRow: number): void {
  db.prepare("UPDATE jobs SET sheet_name = ?, header_row = ? WHERE id = ?").run(sheetName, headerRow, id);
}

/** Saves the column mapping, template and options, and replaces the row plan. */
export function configureJob(db: Db, id: string, config: JobConfig, plan: PlannedRow[], titles: Map<number, string>): void {
  const now = Date.now();
  db.exec("BEGIN");
  try {
    db.prepare(
      `UPDATE jobs SET video_col = ?, description_col = ?, description_header = ?, template = ?, summary_language = ?,
         include_transcripts = ?, selection = ?, overwrite = ?
       WHERE id = ?`,
    ).run(
      config.videoCol,
      config.descriptionCol,
      config.descriptionHeader,
      config.template,
      config.descriptionLanguage,
      config.includeTranscripts ? 1 : 0,
      JSON.stringify(config.selection),
      config.overwrite ? 1 : 0,
      id,
    );
    db.prepare("DELETE FROM job_rows WHERE job_id = ?").run(id);
    db.prepare("DELETE FROM row_transcripts WHERE job_id = ?").run(id);

    const firstPending = new Map<string, number>();
    for (const row of plan) {
      if (row.status === "pending" && row.videoId && !firstPending.has(row.videoId)) firstPending.set(row.videoId, row.sheetRow);
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
       started_at = CASE WHEN ? = 'running' THEN ? ELSE started_at END,
       finished_at = CASE WHEN ? = 'completed' THEN ? ELSE NULL END
     WHERE id = ?`,
  ).run(status, pauseReason, status, now, status, now, id);
}

/** Transcript state per row and language, keyed by the row that owns the transcripts. */
function transcriptStates(db: Db, jobId: string): Map<number, Record<Language, TranscriptStatus | null>> {
  const states = new Map<number, Record<Language, TranscriptStatus | null>>();
  const rows = db.prepare("SELECT sheet_row, language, status FROM row_transcripts WHERE job_id = ?").all(jobId) as {
    sheet_row: number;
    language: Language;
    status: TranscriptStatus;
  }[];
  for (const r of rows) {
    const state = states.get(r.sheet_row) ?? { en: null, es: null };
    state[r.language] = r.status;
    states.set(r.sheet_row, state);
  }
  return states;
}

function withTranscripts(db: Db, jobId: string, raws: Raw[]): JobRow[] {
  const states = transcriptStates(db, jobId);
  return raws.map((r) => {
    const owner = (r.duplicate_of as number | null) ?? (r.sheet_row as number);
    return toRow(r, states.get(owner) ?? NO_TRANSCRIPTS);
  });
}

/** All rows, or only those changed at or after `since` (ms). */
export function listRows(db: Db, jobId: string, since?: number): JobRow[] {
  const rows =
    since === undefined
      ? db.prepare("SELECT * FROM job_rows WHERE job_id = ? ORDER BY sheet_row").all(jobId)
      : db.prepare("SELECT * FROM job_rows WHERE job_id = ? AND updated_at >= ? ORDER BY sheet_row").all(jobId, since);
  return withTranscripts(db, jobId, rows as Raw[]);
}

export function getRow(db: Db, jobId: string, sheetRow: number): JobRow | null {
  const row = db.prepare("SELECT * FROM job_rows WHERE job_id = ? AND sheet_row = ?").get(jobId, sheetRow) as
    | Raw
    | undefined;
  return row ? withTranscripts(db, jobId, [row])[0] : null;
}

const COLUMNS: Record<string, string> = {
  status: "status",
  vidiqJobId: "vidiq_job_id",
  summary: "summary",
  summaryEs: "summary_es",
  warning: "warning",
  error: "error",
  attempts: "attempts",
};

type RowPatch = Partial<Pick<JobRow, "status" | "vidiqJobId" | "summary" | "summaryEs" | "warning" | "error" | "attempts">>;

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

/** Saves a finished summary (both languages) on the row and on every repeat of it. */
export function completeRow(
  db: Db,
  jobId: string,
  sheetRow: number,
  summary: string,
  summaryEs: string | null,
  warning: string | null,
): void {
  const now = Date.now();
  db.prepare(
    `UPDATE job_rows SET status = 'done', summary = ?, summary_es = ?, warning = ?, error = NULL, updated_at = ?
     WHERE job_id = ? AND (sheet_row = ? OR (duplicate_of = ? AND status = 'duplicate'))`,
  ).run(summary, summaryEs, warning, now, jobId, sheetRow, sheetRow);
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

/** Work left running by a stopped process: keep polling rows with a vidIQ job, re-queue the rest. */
export function recoverInterrupted(db: Db, jobId: string): JobRow[] {
  db.prepare(
    "UPDATE job_rows SET status = 'pending', attempts = MAX(attempts - 1, 0) WHERE job_id = ? AND status = 'running' AND vidiq_job_id IS NULL",
  ).run(jobId);
  db.prepare("UPDATE row_transcripts SET status = 'pending' WHERE job_id = ? AND status = 'running'").run(jobId);
  return (db.prepare("SELECT * FROM job_rows WHERE job_id = ? AND status = 'running' ORDER BY sheet_row").all(jobId) as Raw[]).map(
    (r) => toRow(r),
  );
}

/** A hand-written summary in one language: the row counts as done and is protected from regenerates. */
export function saveEditedSummary(db: Db, jobId: string, sheetRow: number, language: Language, text: string): void {
  const column = language === "es" ? "summary_es" : "summary";
  db.prepare(
    `UPDATE job_rows SET status = 'done', ${column} = ?, warning = NULL, error = NULL, edited = 1, updated_at = ?
     WHERE job_id = ? AND sheet_row = ?`,
  ).run(text, Date.now(), jobId, sheetRow);
}

/** Queues a row again; repeats of it that were not edited wait for the new summary. */
export function requeueRow(db: Db, jobId: string, sheetRow: number): void {
  const now = Date.now();
  db.prepare(
    `UPDATE job_rows SET status = 'pending', summary = NULL, summary_es = NULL, warning = NULL, error = NULL,
       vidiq_job_id = NULL, attempts = 0, edited = 0, updated_at = ?
     WHERE job_id = ? AND sheet_row = ?`,
  ).run(now, jobId, sheetRow);
  db.prepare(
    `UPDATE job_rows SET status = 'duplicate', summary = NULL, summary_es = NULL, warning = NULL, updated_at = ?
     WHERE job_id = ? AND duplicate_of = ? AND edited = 0`,
  ).run(now, jobId, sheetRow);
}

/** Moves chosen excluded rows into the run. Returns how many changed. */
export function setRowsPending(db: Db, jobId: string, sheetRows: number[]): number {
  let changed = 0;
  const update = db.prepare(
    "UPDATE job_rows SET status = 'pending', updated_at = ? WHERE job_id = ? AND sheet_row = ? AND status = 'excluded'",
  );
  for (const sheetRow of sheetRows) changed += Number(update.run(Date.now(), jobId, sheetRow).changes);
  return changed;
}

/** Makes a row a repeat of another row with the same video (copying its summary if it is done). */
export function linkAsDuplicate(db: Db, jobId: string, sheetRow: number, original: JobRow): void {
  db.prepare(
    `UPDATE job_rows SET status = ?, duplicate_of = ?, summary = ?, summary_es = ?, warning = ?, updated_at = ?
     WHERE job_id = ? AND sheet_row = ?`,
  ).run(
    original.status === "done" ? "done" : "duplicate",
    original.sheetRow,
    original.status === "done" ? original.summary : null,
    original.status === "done" ? original.summaryEs : null,
    original.status === "done" ? original.warning : null,
    Date.now(),
    jobId,
    sheetRow,
  );
}

export function getPreview(db: Db, jobId: string): Preview | null {
  const row = db.prepare("SELECT * FROM job_previews WHERE job_id = ?").get(jobId) as Raw | undefined;
  return row ? toPreview(row) : null;
}

export function savePreview(db: Db, jobId: string, preview: Omit<Preview, "updatedAt">): void {
  db.prepare(
    `INSERT INTO job_previews (job_id, sheet_row, template, language, status, vidiq_job_id, summary, summary_es, warning, error, updated_at)
     VALUES (?, ?, ?, 'both', ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(job_id) DO UPDATE SET sheet_row = excluded.sheet_row, template = excluded.template,
       status = excluded.status, vidiq_job_id = excluded.vidiq_job_id, summary = excluded.summary,
       summary_es = excluded.summary_es, warning = excluded.warning, error = excluded.error, updated_at = excluded.updated_at`,
  ).run(
    jobId,
    preview.sheetRow,
    preview.template,
    preview.status,
    preview.vidiqJobId,
    preview.summary,
    preview.summaryEs,
    preview.warning,
    preview.error,
    Date.now(),
  );
}

/**
 * Queues transcripts (both languages) for the given rows. Finished, unavailable or
 * already queued transcripts are left alone; failed ones are tried again.
 * Returns how many rows got new work.
 */
export function queueTranscripts(db: Db, jobId: string, sheetRows: number[]): number {
  const insert = db.prepare(
    `INSERT INTO row_transcripts (job_id, sheet_row, language, status, updated_at) VALUES (?, ?, ?, 'pending', ?)
     ON CONFLICT(job_id, sheet_row, language) DO UPDATE SET status = 'pending', error = NULL, updated_at = excluded.updated_at
     WHERE row_transcripts.status = 'failed'`,
  );
  let rows = 0;
  for (const sheetRow of sheetRows) {
    let queued = false;
    for (const language of LANGUAGES) queued = Number(insert.run(jobId, sheetRow, language, Date.now()).changes) > 0 || queued;
    if (queued) {
      touchRowAndRepeats(db, jobId, sheetRow);
      rows++;
    }
  }
  return rows;
}

/** Atomically picks the next waiting transcript. */
export function claimNextTranscript(db: Db, jobId: string): { sheetRow: number; language: Language; videoId: string } | null {
  const claimed = db
    .prepare(
      `UPDATE row_transcripts SET status = 'running', updated_at = ?
       WHERE rowid = (SELECT rowid FROM row_transcripts WHERE job_id = ? AND status = 'pending' ORDER BY sheet_row, language LIMIT 1)
       RETURNING sheet_row, language`,
    )
    .get(Date.now(), jobId) as { sheet_row: number; language: Language } | undefined;
  if (!claimed) return null;
  const row = getRow(db, jobId, claimed.sheet_row);
  if (!row?.videoId) {
    saveTranscript(db, jobId, claimed.sheet_row, claimed.language, { status: "failed", error: "No video in this row" });
    return claimNextTranscript(db, jobId);
  }
  return { sheetRow: claimed.sheet_row, language: claimed.language, videoId: row.videoId };
}

export function saveTranscript(
  db: Db,
  jobId: string,
  sheetRow: number,
  language: Language,
  result: { status: TranscriptStatus; text?: string | null; error?: string | null },
): void {
  db.prepare(
    `UPDATE row_transcripts SET status = ?, text = ?, error = ?, updated_at = ?
     WHERE job_id = ? AND sheet_row = ? AND language = ?`,
  ).run(result.status, result.text ?? null, result.error ?? null, Date.now(), jobId, sheetRow, language);
  touchRowAndRepeats(db, jobId, sheetRow);
}

/** Marks a row (and its repeats) as changed so incremental updates pick up transcript changes. */
function touchRowAndRepeats(db: Db, jobId: string, sheetRow: number): void {
  db.prepare("UPDATE job_rows SET updated_at = ? WHERE job_id = ? AND (sheet_row = ? OR duplicate_of = ?)").run(
    Date.now(),
    jobId,
    sheetRow,
    sheetRow,
  );
}

/** Full transcripts per row; repeated videos get their original's. */
export function listTranscripts(db: Db, jobId: string): Map<number, Partial<Record<Language, Transcript>>> {
  const byOwner = new Map<number, Partial<Record<Language, Transcript>>>();
  const rows = db
    .prepare("SELECT sheet_row, language, status, text, error FROM row_transcripts WHERE job_id = ?")
    .all(jobId) as { sheet_row: number; language: Language; status: TranscriptStatus; text: string | null; error: string | null }[];
  for (const r of rows) {
    const entry = byOwner.get(r.sheet_row) ?? {};
    entry[r.language] = { status: r.status, text: r.text, error: r.error };
    byOwner.set(r.sheet_row, entry);
  }
  const result = new Map(byOwner);
  const repeats = db
    .prepare("SELECT sheet_row, duplicate_of FROM job_rows WHERE job_id = ? AND duplicate_of IS NOT NULL")
    .all(jobId) as { sheet_row: number; duplicate_of: number }[];
  for (const r of repeats) {
    const owned = byOwner.get(r.duplicate_of);
    if (owned) result.set(r.sheet_row, owned);
  }
  return result;
}

export function hasPending(db: Db, jobId: string): boolean {
  const rows = db.prepare("SELECT 1 FROM job_rows WHERE job_id = ? AND status IN ('pending', 'running') LIMIT 1").get(jobId);
  const transcripts = db
    .prepare("SELECT 1 FROM row_transcripts WHERE job_id = ? AND status IN ('pending', 'running') LIMIT 1")
    .get(jobId);
  return !!rows || !!transcripts;
}
