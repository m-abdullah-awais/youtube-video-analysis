import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { openDb, migrate, type Db } from "../db";
import { completeRow, getJob, getRow, listRows, markRow } from "./repo";
import { JobRunner, type Gateway, type PollResult, type TranscriptResult } from "./runner";
import {
  clearAllRuns,
  configure,
  consumePreview,
  createFromUpload,
  deleteRun,
  editRow,
  getPreview,
  listRuns,
  memoryStore,
  regenerateRow,
  renameRun,
  runPreview,
  startPreview,
  summarize,
  type FileStore,
} from "./service";

const encode = (s: string) => new TextEncoder().encode(s);
const CSV = [
  "Title,Video URL,Description",
  "One,https://youtu.be/aaaaaaaaaaa,",
  "Two,https://youtu.be/bbbbbbbbbbb,",
  "Again,https://youtu.be/aaaaaaaaaaa,",
  "",
].join("\n");

let db: Db;
let store: FileStore;
let jobId: string;

beforeEach(() => {
  db = openDb(":memory:");
  store = memoryStore();
  jobId = createFromUpload(db, store, "videos.csv", encode(CSV)).jobId;
});

class FakeGateway implements Gateway {
  submits: string[] = [];
  constructor(private text = "Summary:\nGreat.\n\nKey Points:\n- a\n\nTopics:\nx\n\n=== ESPAÑOL ===\n\nResumen:\nBien.") {}
  async transcript(): Promise<TranscriptResult> {
    return { status: "unavailable" };
  }
  async submit(row: { videoId: string }) {
    this.submits.push(row.videoId);
    return `vj-${row.videoId}`;
  }
  async poll(): Promise<PollResult> {
    return { state: "done", text: this.text };
  }
}

const fast = { pollMs: 0, sleep: async () => {} };

describe("migrate", () => {
  it("adds new columns to a database created by an older version", () => {
    const old = new DatabaseSync(":memory:");
    old.exec(`CREATE TABLE jobs (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, file_name TEXT NOT NULL, format TEXT NOT NULL,
      sheet_name TEXT NOT NULL, header_row INTEGER NOT NULL, video_col INTEGER, description_col INTEGER, description_header TEXT,
      template TEXT NOT NULL DEFAULT '', overwrite INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'draft',
      pause_reason TEXT, started_at INTEGER, finished_at INTEGER);
      CREATE TABLE job_rows (job_id TEXT NOT NULL, sheet_row INTEGER NOT NULL, title TEXT, source TEXT NOT NULL, video_id TEXT,
      is_short INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, duplicate_of INTEGER, vidiq_job_id TEXT, summary TEXT,
      warning TEXT, error TEXT, attempts INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL, PRIMARY KEY (job_id, sheet_row));`);
    migrate(old);
    const jobColumns = (old.prepare("PRAGMA table_info(jobs)").all() as { name: string }[]).map((c) => c.name);
    const rowColumns = (old.prepare("PRAGMA table_info(job_rows)").all() as { name: string }[]).map((c) => c.name);
    expect(jobColumns).toEqual(expect.arrayContaining(["name", "summary_language"]));
    expect(rowColumns).toContain("edited");
  });
});

describe("run history", () => {
  it("lists runs newest first with counts and a default name", () => {
    const second = createFromUpload(db, store, "later.csv", encode(CSV)).jobId;
    const runs = listRuns(db);
    expect(runs.map((r) => r.id)).toEqual([second, jobId]);
    expect(runs[1]).toMatchObject({ name: "videos.csv", counts: { total: 3, pending: 2, duplicate: 1 } });
  });

  it("renames a run and rejects empty names", () => {
    renameRun(db, jobId, "  October uploads  ");
    expect(getJob(db, jobId)!.name).toBe("October uploads");
    expect(() => renameRun(db, jobId, "   ")).toThrow(/name/i);
  });

  it("deletes a run with its rows and file", () => {
    deleteRun(db, store, jobId);
    expect(getJob(db, jobId)).toBeNull();
    expect(listRows(db, jobId)).toEqual([]);
    expect(() => store.read(jobId)).toThrow();
  });

  it("clears every run", () => {
    createFromUpload(db, store, "later.csv", encode(CSV));
    expect(clearAllRuns(db, store)).toBe(2);
    expect(listRuns(db)).toEqual([]);
  });
});

describe("summarize since", () => {
  it("returns only rows that changed after the given time", async () => {
    const first = summarize(db, jobId);
    expect(first.rows).toHaveLength(3);
    await new Promise((r) => setTimeout(r, 5));
    markRow(db, jobId, 2, { status: "failed", error: "x" });
    const next = summarize(db, jobId, { since: first.serverTime });
    expect(next.rows.map((r) => r.sheetRow)).toEqual([2]);
    expect(next.partial).toBe(true);
    expect(next.counts.failed).toBe(1);
  });
});

describe("editRow", () => {
  it("saves an edited summary on a finished or failed row", () => {
    completeRow(db, jobId, 1, "Original", null, "Missing section: Topics");
    editRow(db, jobId, 1, "  Better text  ");
    expect(getRow(db, jobId, 1)).toMatchObject({ status: "done", summary: "Better text", warning: null, edited: true });

    markRow(db, jobId, 2, { status: "failed", error: "Video unavailable" });
    editRow(db, jobId, 2, "Written by hand");
    expect(getRow(db, jobId, 2)).toMatchObject({ status: "done", summary: "Written by hand", error: null });
  });

  it("refuses rows that are not finished or failed", () => {
    expect(() => editRow(db, jobId, 1, "x")).toThrow(/finished or failed/);
  });
});

describe("regenerateRow", () => {
  it("re-queues the row and its unedited repeats", () => {
    completeRow(db, jobId, 1, "Old", null, null);
    regenerateRow(db, jobId, 1);
    expect(getRow(db, jobId, 1)).toMatchObject({ status: "pending", summary: null, vidiqJobId: null, attempts: 0 });
    expect(getRow(db, jobId, 3)).toMatchObject({ status: "duplicate", summary: null });
  });

  it("keeps a repeat that was edited by hand", () => {
    completeRow(db, jobId, 1, "Old", null, null);
    editRow(db, jobId, 3, "Mine");
    regenerateRow(db, jobId, 1);
    expect(getRow(db, jobId, 3)).toMatchObject({ status: "done", summary: "Mine" });
  });

  it("regenerates the original when asked from a repeated video", () => {
    completeRow(db, jobId, 1, "Old", null, null);
    regenerateRow(db, jobId, 3);
    expect(getRow(db, jobId, 1)!.status).toBe("pending");
    expect(getRow(db, jobId, 3)!.status).toBe("duplicate");
  });

  it("refuses a row that is still running", () => {
    markRow(db, jobId, 1, { status: "running" });
    expect(() => regenerateRow(db, jobId, 1)).toThrow(/right now/);
  });
});

describe("description language", () => {
  it("is saved with the configuration, and vidIQ is asked for both languages", async () => {
    configure(db, store, jobId, { videoCol: 1, descriptionCol: 2, template: "Summary: x", overwrite: false, descriptionLanguage: "es" });
    expect(getJob(db, jobId)!.descriptionLanguage).toBe("es");
    const prompts: string[] = [];
    const gateway: Gateway = {
      submit: async (_row, prompt) => {
        prompts.push(prompt);
        return "vj";
      },
      poll: async () => ({ state: "done", text: "Summary:\nHi\n\n=== ESPAÑOL ===\n\nResumen:\nBien." }),
      transcript: async () => ({ status: "unavailable" }),
    };
    markRow(db, jobId, 2, { status: "filled" });
    await new JobRunner(db, jobId, gateway, { concurrency: 1, maxAttempts: 1, ...fast }).run();
    expect(prompts[0]).toContain("=== ESPAÑOL ===");
  });
});

describe("trial summary", () => {
  it("summarizes the first waiting video and stores the result", async () => {
    const preview = startPreview(db, jobId);
    expect(preview).toMatchObject({ sheetRow: 1, status: "running" });
    await runPreview(db, jobId, new FakeGateway(), fast);
    expect(getPreview(db, jobId)).toMatchObject({ sheetRow: 1, status: "done", summary: expect.stringContaining("Great."), warning: null });
  });

  it("does not start a second trial while one is running", () => {
    startPreview(db, jobId);
    expect(() => startPreview(db, jobId)).toThrow(/already/);
  });

  it("reuses the trial result when the run starts with the same settings, so it is not paid twice", async () => {
    startPreview(db, jobId);
    await runPreview(db, jobId, new FakeGateway(), fast);
    expect(consumePreview(db, jobId)).toBe(true);
    expect(getRow(db, jobId, 1)).toMatchObject({ status: "done" });
    expect(getRow(db, jobId, 3)).toMatchObject({ status: "done" });

    const gateway = new FakeGateway();
    await new JobRunner(db, jobId, gateway, { concurrency: 1, maxAttempts: 1, ...fast }).run();
    expect(gateway.submits).toEqual(["bbbbbbbbbbb"]);
  });

  it("ignores the trial when the template changed afterwards", async () => {
    startPreview(db, jobId);
    await runPreview(db, jobId, new FakeGateway(), fast);
    configure(db, store, jobId, { videoCol: 1, descriptionCol: 2, template: "Summary: different", overwrite: false });
    expect(consumePreview(db, jobId)).toBe(false);
    expect(getRow(db, jobId, 1)!.status).toBe("pending");
  });

  it("records a failed trial", async () => {
    startPreview(db, jobId);
    const failing: Gateway = {
      submit: async () => "vj",
      poll: async () => ({ state: "failed", message: "Video unavailable" }),
      transcript: async () => ({ status: "unavailable" }),
    };
    await runPreview(db, jobId, failing, fast);
    expect(getPreview(db, jobId)).toMatchObject({ status: "failed", error: "Video unavailable" });
  });
});
