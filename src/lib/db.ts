import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type Db = DatabaseSync;

export const DATA_DIR = path.join(process.cwd(), "data");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  format TEXT NOT NULL,
  sheet_name TEXT NOT NULL,
  header_row INTEGER NOT NULL,
  video_col INTEGER,
  description_col INTEGER,
  description_header TEXT,
  template TEXT NOT NULL DEFAULT '',
  overwrite INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  pause_reason TEXT,
  started_at INTEGER,
  finished_at INTEGER
);
CREATE TABLE IF NOT EXISTS job_rows (
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  sheet_row INTEGER NOT NULL,
  title TEXT,
  source TEXT NOT NULL,
  video_id TEXT,
  is_short INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  duplicate_of INTEGER,
  vidiq_job_id TEXT,
  summary TEXT,
  warning TEXT,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (job_id, sheet_row)
);
`;

export function openDb(file: string): Db {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  return db;
}

const globalDb = globalThis as unknown as { __appDb?: Db };

/** One shared connection per server process (survives dev reloads). */
export function getDb(): Db {
  globalDb.__appDb ??= openDb(path.join(DATA_DIR, "app.db"));
  return globalDb.__appDb;
}

export function getSetting<T>(db: Db, key: string): T | undefined {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row ? (JSON.parse(row.value) as T) : undefined;
}

export function setSetting(db: Db, key: string, value: unknown): void {
  if (value === undefined) {
    db.prepare("DELETE FROM settings WHERE key = ?").run(key);
    return;
  }
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    key,
    JSON.stringify(value),
  );
}
