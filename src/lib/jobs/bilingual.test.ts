import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../db";
import { parseCsv } from "../sheet/csv";
import { planRows } from "../sheet/detect";
import type { TableRow } from "../sheet/workbook";
import { VidiqError } from "../vidiq/errors";
import { completeRow, getJob, getRow, listTranscripts, markRow } from "./repo";
import { JobRunner, type Gateway, type PollResult, type TranscriptResult } from "./runner";
import {
  configure,
  createFromUpload,
  downloadResult,
  editRow,
  includeRows,
  memoryStore,
  report,
  requestTranscripts,
  summarize,
  type FileStore,
} from "./service";

const encode = (s: string) => new TextEncoder().encode(s);
const decode = (b: Uint8Array) => new TextDecoder("utf-8", { ignoreBOM: true }).decode(b);

const CSV = [
  "Title,Video URL,Description",
  "One,https://youtu.be/aaaaaaaaaaa,",
  "Two,https://youtu.be/bbbbbbbbbbb,",
  "Three,https://youtu.be/ccccccccccc,",
  "Again,https://youtu.be/aaaaaaaaaaa,",
  "",
].join("\n");

const BILINGUAL = "Summary: Good.\n\nTopics: x\n\n=== ESPAÑOL ===\n\nResumen: Bien.\n\nTemas: x";
const TEMPLATE = "Summary: one line.\nTopics: list.";

let db: Db;
let store: FileStore;
let jobId: string;

beforeEach(() => {
  db = openDb(":memory:");
  store = memoryStore();
  jobId = createFromUpload(db, store, "videos.csv", encode(CSV)).jobId;
});

const base = { videoCol: 1, descriptionCol: 2, template: TEMPLATE, overwrite: false } as const;

class FakeGateway implements Gateway {
  submits: string[] = [];
  transcripts: string[] = [];
  constructor(
    private answers: (string | Error)[] = [],
    private captions: Record<string, string | Error> = { en: "Hello there." },
  ) {}
  async submit(row: { videoId: string }) {
    this.submits.push(row.videoId);
    return `vj-${this.submits.length}`;
  }
  async poll(): Promise<PollResult> {
    const next = this.answers.length ? this.answers.shift()! : BILINGUAL;
    if (next instanceof Error) throw next;
    return { state: "done", text: next };
  }
  async transcript(videoId: string, language: "en" | "es"): Promise<TranscriptResult> {
    this.transcripts.push(`${videoId}:${language}`);
    const caption = this.captions[language];
    if (caption instanceof Error) throw caption;
    return caption ? { status: "done", text: caption } : { status: "unavailable" };
  }
}

const run = (gateway: Gateway) =>
  new JobRunner(db, jobId, gateway, { concurrency: 1, pollMs: 0, maxAttempts: 2, sleep: async () => {} }).run();

const row = (sheetRow: number, video: string): TableRow => ({ sheetRow, cells: ["t", video, ""], links: [] });

describe("selection", () => {
  it("marks rows that are not included as excluded and dedupes only among included rows", () => {
    const rows = [row(1, "aaaaaaaaaaa"), row(2, "bbbbbbbbbbb"), row(3, "aaaaaaaaaaa")];
    const plan = planRows(rows, { video: 1, description: 2 }, { overwrite: false, include: (r) => r !== 1 });
    expect(plan.map((p) => [p.sheetRow, p.status])).toEqual([
      [1, "excluded"],
      [2, "pending"],
      [3, "pending"],
    ]);
  });

  it("processes only the first N videos", () => {
    configure(db, store, jobId, { ...base, selection: { mode: "first", count: 1 } });
    const view = summarize(db, jobId);
    expect(view.rows.map((r) => [r.sheetRow, r.status])).toEqual([
      [1, "pending"],
      [2, "excluded"],
      [3, "excluded"],
      [4, "duplicate"],
    ]);
    expect(view.counts.excluded).toBe(2);
    expect(getJob(db, jobId)!.selection).toEqual({ mode: "first", count: 1 });
  });

  it("processes only the chosen rows", () => {
    configure(db, store, jobId, { ...base, selection: { mode: "rows", rows: [3] } });
    expect(summarize(db, jobId).rows.map((r) => r.status)).toEqual(["excluded", "excluded", "pending", "excluded"]);
  });

  it("adds excluded rows to the run later", () => {
    configure(db, store, jobId, { ...base, selection: { mode: "rows", rows: [3] } });
    expect(includeRows(db, jobId, [2])).toBe(1);
    expect(getRow(db, jobId, 2)!.status).toBe("pending");
    expect(() => includeRows(db, jobId, [3])).toThrow(/no videos/i);
  });

  it("estimates summaries and transcripts separately", () => {
    configure(db, store, jobId, { ...base, includeTranscripts: true });
    expect(summarize(db, jobId).estimate).toMatchObject({ videos: 3, summaryCredits: 75, transcriptCredits: 30, credits: 105 });
    configure(db, store, jobId, { ...base, includeTranscripts: false });
    expect(summarize(db, jobId).estimate).toMatchObject({ summaryCredits: 75, transcriptCredits: 0, credits: 75 });
  });
});

describe("bilingual summaries", () => {
  it("stores the English and the Spanish version", async () => {
    configure(db, store, jobId, { ...base, includeTranscripts: false, selection: { mode: "rows", rows: [1] } });
    await run(new FakeGateway());
    expect(getRow(db, jobId, 1)).toMatchObject({ status: "done", summary: "Summary: Good.\n\nTopics: x", summaryEs: "Resumen: Bien.\n\nTemas: x" });
    expect(getRow(db, jobId, 4)).toMatchObject({ status: "done", summaryEs: "Resumen: Bien.\n\nTemas: x" });
  });

  it("asks once more when the Spanish version is missing", async () => {
    configure(db, store, jobId, { ...base, includeTranscripts: false, selection: { mode: "rows", rows: [2] } });
    const gateway = new FakeGateway(["Summary: only English.\nTopics: x"]);
    await run(gateway);
    expect(gateway.submits).toHaveLength(2);
    expect(getRow(db, jobId, 2)).toMatchObject({ status: "done", summaryEs: "Resumen: Bien.\n\nTemas: x" });
  });

  it("keeps the English text with a warning when the Spanish version never comes", async () => {
    configure(db, store, jobId, { ...base, includeTranscripts: false, selection: { mode: "rows", rows: [2] } });
    await run(new FakeGateway(["Summary: a\nTopics: x", "Summary: b\nTopics: x"]));
    expect(getRow(db, jobId, 2)).toMatchObject({ status: "done", summary: "Summary: b\nTopics: x", summaryEs: null, warning: "Spanish version missing" });
  });

  it("edits each language separately", () => {
    completeRow(db, jobId, 1, "Summary: a", "Resumen: a", null);
    editRow(db, jobId, 1, "Resumen: mejor", "es");
    expect(getRow(db, jobId, 1)).toMatchObject({ summary: "Summary: a", summaryEs: "Resumen: mejor", edited: true });
  });
});

describe("transcripts", () => {
  it("fetches English and Spanish transcripts after the summary, marking missing captions as unavailable", async () => {
    configure(db, store, jobId, { ...base, includeTranscripts: true, selection: { mode: "rows", rows: [1] } });
    const gateway = new FakeGateway();
    await run(gateway);
    expect(gateway.transcripts.sort()).toEqual(["aaaaaaaaaaa:en", "aaaaaaaaaaa:es"]);
    const transcripts = listTranscripts(db, jobId);
    expect(transcripts.get(1)).toMatchObject({ en: { status: "done", text: "Hello there." }, es: { status: "unavailable" } });
    expect(transcripts.get(4)).toMatchObject({ en: { status: "done" } });
    expect(getJob(db, jobId)!.status).toBe("completed");
    expect(getRow(db, jobId, 1)!.transcripts).toEqual({ en: "done", es: "unavailable" });
  });

  it("does not fetch transcripts when they are switched off", async () => {
    configure(db, store, jobId, { ...base, includeTranscripts: false, selection: { mode: "rows", rows: [1] } });
    const gateway = new FakeGateway();
    await run(gateway);
    expect(gateway.transcripts).toEqual([]);
  });

  it("adds transcripts to rows that are already done", async () => {
    configure(db, store, jobId, { ...base, includeTranscripts: false });
    completeRow(db, jobId, 2, "Summary: b", "Resumen: b", null);
    expect(requestTranscripts(db, jobId)).toBe(1);
    expect(() => requestTranscripts(db, jobId)).toThrow(/transcripts/i);
    markRow(db, jobId, 1, { status: "filled" });
    markRow(db, jobId, 3, { status: "filled" });
    const gateway = new FakeGateway();
    await run(gateway);
    expect(gateway.submits).toEqual([]);
    expect(listTranscripts(db, jobId).get(2)?.en?.status).toBe("done");
  });

  it("pauses the run when credits run out while fetching a transcript", async () => {
    configure(db, store, jobId, { ...base, includeTranscripts: true, selection: { mode: "rows", rows: [1] } });
    await run(new FakeGateway([], { en: new VidiqError("credits", "No credits") }));
    expect(getJob(db, jobId)).toMatchObject({ status: "paused", pauseReason: "credits" });
    expect(listTranscripts(db, jobId).get(1)?.en?.status).toBe("pending");
  });
});

describe("export", () => {
  it("writes the chosen language into Description and the other into its own column", () => {
    completeRow(db, jobId, 1, "Summary: a", "Resumen: a", null);
    const csv = decode(downloadResult(db, store, jobId).data);
    expect(csv.split("\n").slice(0, 2)).toEqual([
      "Title,Video URL,Description,Description (Spanish)",
      "One,https://youtu.be/aaaaaaaaaaa,Summary: a,Resumen: a",
    ]);

    const spanishFirst = createFromUpload(db, store, "videos.csv", encode(CSV)).jobId;
    configure(db, store, spanishFirst, { ...base, descriptionLanguage: "es" });
    completeRow(db, spanishFirst, 1, "Summary: a", "Resumen: a", null);
    expect(decode(downloadResult(db, store, spanishFirst).data).split("\n").slice(0, 2)).toEqual([
      "Title,Video URL,Description,Description (English)",
      "One,https://youtu.be/aaaaaaaaaaa,Resumen: a,Summary: a",
    ]);
  });

  it("adds transcript columns when asked", async () => {
    configure(db, store, jobId, { ...base, includeTranscripts: true, selection: { mode: "rows", rows: [1] } });
    await run(new FakeGateway());
    const rows = parseCsv(decode(downloadResult(db, store, jobId, { transcripts: true }).data)).rows;
    expect(rows[0]).toEqual(["Title", "Video URL", "Description", "Description (Spanish)", "Transcript (English)", "Transcript (Spanish)"]);
    expect(rows[1]).toEqual([
      "One",
      "https://youtu.be/aaaaaaaaaaa",
      "Summary: Good.\n\nTopics: x",
      "Resumen: Bien.\n\nTemas: x",
      "Hello there.",
    ]);
    expect(rows[2]).toEqual(["Two", "https://youtu.be/bbbbbbbbbbb", ""]);
  });

  it("does not repeat (summaries) in the file name", () => {
    const again = createFromUpload(db, store, "videos (summaries).csv", encode(CSV)).jobId;
    expect(downloadResult(db, store, again).fileName).toBe("videos (summaries).csv");
  });
});

describe("report", () => {
  it("returns finished videos with both summaries and transcripts for the PDF", async () => {
    configure(db, store, jobId, { ...base, includeTranscripts: true, selection: { mode: "rows", rows: [1] } });
    await run(new FakeGateway());
    const data = report(db, jobId);
    expect(data.items.map((i) => i.sheetRow)).toEqual([1, 4]);
    expect(data.items[0]).toMatchObject({
      title: "One",
      videoId: "aaaaaaaaaaa",
      summaryEn: "Summary: Good.\n\nTopics: x",
      summaryEs: "Resumen: Bien.\n\nTemas: x",
      transcripts: { en: { status: "done", text: "Hello there." }, es: { status: "unavailable", text: null } },
    });
    expect(report(db, jobId, [4]).items.map((i) => i.sheetRow)).toEqual([4]);
  });
});
