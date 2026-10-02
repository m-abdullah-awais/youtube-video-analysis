import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../db";
import { completeRow, getJob, listRows, markRow } from "./repo";
import { configure, createFromUpload, downloadResult, getTableInfo, memoryStore, summarize, type FileStore } from "./service";

const encode = (s: string) => new TextEncoder().encode(s);
const decode = (b: Uint8Array) => new TextDecoder("utf-8", { ignoreBOM: true }).decode(b);

const CSV = [
  "Title,Video URL,Description",
  "One,https://youtu.be/aaaaaaaaaaa,",
  "Two,https://www.youtube.com/shorts/bbbbbbbbbbb,",
  "Three,https://youtu.be/ccccccccccc,Already done",
  "Four,nope,",
  "Five,https://youtu.be/aaaaaaaaaaa,",
  "",
].join("\n");

let db: Db;
let store: FileStore;

beforeEach(() => {
  db = openDb(":memory:");
  store = memoryStore();
});

describe("createFromUpload", () => {
  it("stores the original file and pre-fills the detected columns", () => {
    const { jobId } = createFromUpload(db, store, "videos.csv", encode(CSV));
    expect(decode(store.read(jobId))).toBe(CSV);
    expect(getJob(db, jobId)).toMatchObject({ status: "draft", videoCol: 1, descriptionCol: 2, format: "csv" });
    expect(listRows(db, jobId)).toHaveLength(5);
  });

  it("rejects files with no rows under the header", () => {
    expect(() => createFromUpload(db, store, "v.csv", encode("Title,Video\n"))).toThrow(/no video rows/i);
  });

  it("rejects files without any YouTube links but explains how to continue", () => {
    const { jobId } = createFromUpload(db, store, "v.csv", encode("Title,Notes\nA,b\n"));
    expect(getJob(db, jobId)!.videoCol).toBeNull();
    expect(getTableInfo(db, store, jobId).guess.video).toBeNull();
  });
});

describe("getTableInfo", () => {
  it("returns headers, a preview and the column guess", () => {
    const { jobId } = createFromUpload(db, store, "videos.csv", encode(CSV));
    const info = getTableInfo(db, store, jobId);
    expect(info.headers).toEqual(["Title", "Video URL", "Description"]);
    expect(info.rowCount).toBe(5);
    expect(info.headerRow).toBe(0);
    expect(info.preview[0]).toEqual({ sheetRow: 1, cells: ["One", "https://youtu.be/aaaaaaaaaaa", ""] });
    expect(info.guess).toEqual({ video: 1, description: 2, title: 0 });
  });
});

describe("summarize", () => {
  it("counts rows by status and estimates credits for long videos and Shorts", () => {
    const { jobId } = createFromUpload(db, store, "videos.csv", encode(CSV));
    const view = summarize(db, jobId);
    expect(view.counts).toMatchObject({ total: 5, pending: 2, filled: 1, invalid: 1, duplicate: 1 });
    expect(view.estimate).toEqual({ videos: 2, long: 1, short: 1, credits: 35 });
    expect(view.rows[0].title).toBe("One");
  });
});

describe("configure", () => {
  it("appends a Description column when asked for a new one", () => {
    const { jobId } = createFromUpload(db, store, "v.csv", encode("Title,Video\nA,https://youtu.be/aaaaaaaaaaa\n"));
    configure(db, store, jobId, { videoCol: 1, descriptionCol: "new", template: "Summary: x", overwrite: false });
    expect(getJob(db, jobId)).toMatchObject({ descriptionCol: 2, descriptionHeader: "Description" });
  });

  it("re-plans rows when overwrite is switched on", () => {
    const { jobId } = createFromUpload(db, store, "videos.csv", encode(CSV));
    configure(db, store, jobId, { videoCol: 1, descriptionCol: 2, template: "Summary: x", overwrite: true });
    expect(summarize(db, jobId).counts.pending).toBe(3);
  });

  it("rejects an empty template and a missing video column", () => {
    const { jobId } = createFromUpload(db, store, "videos.csv", encode(CSV));
    expect(() => configure(db, store, jobId, { videoCol: 1, descriptionCol: 2, template: " ", overwrite: false })).toThrow(
      /template/i,
    );
    expect(() => configure(db, store, jobId, { videoCol: 9, descriptionCol: 2, template: "x", overwrite: false })).toThrow(
      /column/i,
    );
  });

  it("refuses to change a job that has started", () => {
    const { jobId } = createFromUpload(db, store, "videos.csv", encode(CSV));
    markRow(db, jobId, 1, { status: "done", summary: "s" });
    expect(() => configure(db, store, jobId, { videoCol: 1, descriptionCol: 2, template: "x", overwrite: false })).toThrow(
      /already/i,
    );
  });
});

describe("downloadResult", () => {
  it("writes finished summaries, including duplicates, into the original file", () => {
    const { jobId } = createFromUpload(db, store, "videos.csv", encode(CSV));
    completeRow(db, jobId, 1, "Summary:\nFirst", null);
    const file = downloadResult(db, store, jobId);
    expect(file.fileName).toBe("videos (summaries).csv");
    expect(file.contentType).toBe("text/csv; charset=utf-8");
    expect(decode(file.data)).toBe(
      [
        "Title,Video URL,Description",
        'One,https://youtu.be/aaaaaaaaaaa,"Summary:\nFirst"',
        "Two,https://www.youtube.com/shorts/bbbbbbbbbbb,",
        "Three,https://youtu.be/ccccccccccc,Already done",
        "Four,nope,",
        'Five,https://youtu.be/aaaaaaaaaaa,"Summary:\nFirst"',
        "",
      ].join("\n"),
    );
  });

  it("adds the header for a new Description column", () => {
    const { jobId } = createFromUpload(db, store, "v.csv", encode("Title,Video\nA,https://youtu.be/aaaaaaaaaaa\n"));
    configure(db, store, jobId, { videoCol: 1, descriptionCol: "new", template: "Summary: x", overwrite: false });
    completeRow(db, jobId, 1, "Done", null);
    expect(decode(downloadResult(db, store, jobId).data)).toBe("Title,Video,Description\nA,https://youtu.be/aaaaaaaaaaa,Done\n");
  });
});
