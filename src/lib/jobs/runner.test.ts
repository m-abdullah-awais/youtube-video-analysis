import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../db";
import type { PlannedRow } from "../sheet/detect";
import { VidiqError } from "../vidiq/errors";
import { configureJob, createJob, getJob, listRows, markRow, retryFailed, setJobStatus } from "./repo";
import { JobRunner, type Gateway, type PollResult, type TranscriptResult } from "./runner";

const TEMPLATE = "Summary: one line.\nTopics: list.";
const GOOD = "### Summary:\n**Great** video.\n\nTopics:\nmusic\n\n=== ESPAÑOL ===\n\nResumen:\nGran video.\n\nTemas:\nmúsica";

let db: Db;

beforeEach(() => {
  db = openDb(":memory:");
  createJob(db, { id: "j1", fileName: "v.csv", format: "csv", sheetName: "CSV", headerRow: 0 });
});

const planned = (sheetRow: number, videoId: string | null, status: PlannedRow["status"], isShort = false): PlannedRow => ({
  sheetRow,
  source: videoId ? `https://youtu.be/${videoId}` : "bad",
  videoId,
  isShort,
  status,
});

function setup(rows: PlannedRow[]) {
  configureJob(db, "j1", { videoCol: 1, descriptionCol: 2, descriptionHeader: null, template: TEMPLATE, descriptionLanguage: "en", includeTranscripts: false, selection: { mode: "all" }, overwrite: false }, rows, new Map());
  setJobStatus(db, "j1", "running");
}

/** Fake vidIQ: each video id maps to a scripted sequence of outcomes. */
class FakeGateway implements Gateway {
  submits: { videoId: string; isShort: boolean; prompt: string }[] = [];
  polls: string[] = [];
  inFlight = 0;
  maxInFlight = 0;
  constructor(private script: Record<string, (Error | PollResult)[]> = {}) {}

  async submit(row: { videoId: string; isShort: boolean; source: string }, prompt: string) {
    this.submits.push({ videoId: row.videoId, isShort: row.isShort, prompt });
    const next = this.script[row.videoId]?.[0];
    if (next instanceof Error) {
      this.script[row.videoId].shift();
      throw next;
    }
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    return `vj-${row.videoId}`;
  }

  async transcript(): Promise<TranscriptResult> {
    return { status: "unavailable" };
  }

  async poll(vidiqJobId: string): Promise<PollResult> {
    this.polls.push(vidiqJobId);
    const videoId = vidiqJobId.replace("vj-", "");
    const queue = this.script[videoId];
    const next: Error | PollResult = queue && queue.length ? queue.shift()! : { state: "done", text: GOOD };
    if (next instanceof Error) throw next;
    if (next.state !== "running") this.inFlight--;
    return next;
  }
}

const run = (gateway: Gateway, opts: Partial<ConstructorParameters<typeof JobRunner>[3]> = {}) =>
  new JobRunner(db, "j1", gateway, { concurrency: 2, pollMs: 0, maxAttempts: 3, sleep: async () => {}, ...opts }).run();

const byRow = () => Object.fromEntries(listRows(db, "j1").map((r) => [r.sheetRow, r]));

describe("JobRunner", () => {
  it("summarizes pending rows as plain text and completes the job", async () => {
    setup([planned(1, "aaaaaaaaaaa", "pending"), planned(2, null, "invalid")]);
    const gateway = new FakeGateway();
    await run(gateway);

    expect(byRow()[1]).toMatchObject({ status: "done", summary: "Summary:\nGreat video.\n\nTopics:\nmusic", warning: null });
    expect(byRow()[2].status).toBe("invalid");
    expect(getJob(db, "j1")!.status).toBe("completed");
    expect(gateway.submits[0].prompt).toContain(TEMPLATE);
  });

  it("copies a summary to rows with the same video instead of paying twice", async () => {
    setup([planned(1, "aaaaaaaaaaa", "pending"), planned(5, "aaaaaaaaaaa", "duplicate")]);
    const gateway = new FakeGateway();
    await run(gateway);

    expect(gateway.submits).toHaveLength(1);
    expect(byRow()[5]).toMatchObject({ status: "done", duplicateOf: 1, summary: byRow()[1].summary });
  });

  it("marks a row failed when vidIQ fails it and keeps going", async () => {
    setup([planned(1, "aaaaaaaaaaa", "pending"), planned(2, "bbbbbbbbbbb", "pending")]);
    await run(new FakeGateway({ aaaaaaaaaaa: [{ state: "failed", message: "Video is private" }] }));

    expect(byRow()[1]).toMatchObject({ status: "failed", error: "Video is private" });
    expect(byRow()[2].status).toBe("done");
    expect(getJob(db, "j1")!.status).toBe("completed");
  });

  it("keeps polling while vidIQ is still working", async () => {
    setup([planned(1, "aaaaaaaaaaa", "pending")]);
    const gateway = new FakeGateway({ aaaaaaaaaaa: [{ state: "running" }, { state: "running" }] });
    await run(gateway);

    expect(gateway.polls).toHaveLength(3);
    expect(byRow()[1].status).toBe("done");
  });

  it("retries temporary vidIQ outages automatically, submitting the video again", async () => {
    setup([planned(1, "aaaaaaaaaaa", "pending")]);
    const gateway = new FakeGateway({
      aaaaaaaaaaa: [{ state: "failed", message: "Video analysis is temporarily unavailable. Please try again." }],
    });
    await run(gateway);
    expect(gateway.submits).toHaveLength(2);
    expect(byRow()[1]).toMatchObject({ status: "done", attempts: 2 });
  });

  it("strips a lead-in before the first section of the summary", async () => {
    setup([planned(1, "aaaaaaaaaaa", "pending")]);
    await run(new FakeGateway({ aaaaaaaaaaa: [{ state: "done", text: "Here is the summary.\n\nSummary:\nGood.\n\nTopics:\nx\n\n=== ESPAÑOL ===\n\nResumen:\nBien." }] }));
    expect(byRow()[1].summary).toBe("Summary:\nGood.\n\nTopics:\nx");
  });

  it("retries transient errors before giving up", async () => {
    setup([planned(1, "aaaaaaaaaaa", "pending"), planned(2, "bbbbbbbbbbb", "pending")]);
    const flaky = () => new VidiqError("transient", "Network timeout");
    await run(
      new FakeGateway({ aaaaaaaaaaa: [flaky(), flaky()], bbbbbbbbbbb: [flaky(), flaky(), flaky()] }),
    );

    expect(byRow()[1]).toMatchObject({ status: "done", attempts: 3 });
    expect(byRow()[2]).toMatchObject({ status: "failed", error: "Network timeout", attempts: 3 });
  });

  it("pauses the job when credits run out and leaves the row ready to retry", async () => {
    setup([planned(1, "aaaaaaaaaaa", "pending"), planned(2, "bbbbbbbbbbb", "pending"), planned(3, "ccccccccccc", "pending")]);
    await run(new FakeGateway({ aaaaaaaaaaa: [new VidiqError("credits", "Not enough credits")] }), { concurrency: 1 });

    expect(getJob(db, "j1")).toMatchObject({ status: "paused", pauseReason: "credits" });
    expect(byRow()[1]).toMatchObject({ status: "pending", vidiqJobId: null });
    expect(byRow()[3].status).toBe("pending");
  });

  it("pauses the job when the vidIQ sign-in expires", async () => {
    setup([planned(1, "aaaaaaaaaaa", "pending")]);
    await run(new FakeGateway({ aaaaaaaaaaa: [new VidiqError("auth", "Sign in again")] }));
    expect(getJob(db, "j1")).toMatchObject({ status: "paused", pauseReason: "auth" });
  });

  it("resumes an in-progress vidIQ job without submitting it again", async () => {
    setup([planned(1, "aaaaaaaaaaa", "pending")]);
    markRow(db, "j1", 1, { status: "running", vidiqJobId: "vj-aaaaaaaaaaa" });
    const gateway = new FakeGateway();
    await run(gateway);

    expect(gateway.submits).toHaveLength(0);
    expect(gateway.polls).toEqual(["vj-aaaaaaaaaaa"]);
    expect(byRow()[1].status).toBe("done");
  });

  it("never has more vidIQ jobs in flight than the concurrency limit", async () => {
    const ids = ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc", "ddddddddddd", "eeeeeeeeeee"];
    setup(ids.map((id, i) => planned(i + 1, id, "pending")));
    const script = Object.fromEntries(ids.map((id) => [id, [{ state: "running" } as PollResult]]));
    const gateway = new FakeGateway(script);
    await run(gateway, { concurrency: 2 });

    expect(gateway.maxInFlight).toBe(2);
    expect(listRows(db, "j1").every((r) => r.status === "done")).toBe(true);
  });

  it("sends Shorts to vidIQ as short-form content", async () => {
    setup([planned(1, "aaaaaaaaaaa", "pending", true)]);
    const gateway = new FakeGateway();
    await run(gateway);
    expect(gateway.submits[0].isShort).toBe(true);
  });

  it("flags summaries that skipped a template section", async () => {
    setup([planned(1, "aaaaaaaaaaa", "pending")]);
    await run(new FakeGateway({ aaaaaaaaaaa: [{ state: "done", text: "Summary:\nOnly this\n\n=== ESPAÑOL ===\n\nResumen:\nBien." }] }));
    expect(byRow()[1]).toMatchObject({ status: "done", warning: "Missing section: Topics" });
  });

  it("stops picking up new rows after a pause request", async () => {
    setup([planned(1, "aaaaaaaaaaa", "pending"), planned(2, "bbbbbbbbbbb", "pending")]);
    const gateway = new FakeGateway();
    const runner: JobRunner = new JobRunner(db, "j1", gateway, {
      concurrency: 1,
      pollMs: 0,
      maxAttempts: 3,
      sleep: async () => runner.pause(),
    });
    await runner.run();

    expect(getJob(db, "j1")!.status).toBe("paused");
    expect(gateway.submits).toHaveLength(1);
    expect(byRow()[1]).toMatchObject({ status: "running", vidiqJobId: "vj-aaaaaaaaaaa" });
    expect(byRow()[2].status).toBe("pending");
  });
});

describe("JobRunner pause", () => {
  it("wakes a runner that is waiting between polls", async () => {
    setup([planned(1, "aaaaaaaaaaa", "pending")]);
    const runner = new JobRunner(db, "j1", new FakeGateway(), {
      concurrency: 1,
      pollMs: 60_000,
      maxAttempts: 3,
      sleep: () => new Promise(() => {}),
    });
    const done = runner.run();
    await new Promise((r) => setTimeout(r, 10));
    runner.pause();
    await done;
    expect(getJob(db, "j1")!.status).toBe("paused");
  });
});

describe("retryFailed", () => {
  it("re-queues failed rows only, or a single row when given", () => {
    setup([planned(1, "aaaaaaaaaaa", "pending"), planned(2, "bbbbbbbbbbb", "pending"), planned(3, "ccccccccccc", "pending")]);
    markRow(db, "j1", 1, { status: "failed", error: "x", vidiqJobId: "vj-a" });
    markRow(db, "j1", 2, { status: "failed", error: "y" });
    markRow(db, "j1", 3, { status: "done", summary: "s" });

    retryFailed(db, "j1", 2);
    expect(byRow()[2]).toMatchObject({ status: "pending", error: null, attempts: 0 });
    expect(byRow()[1].status).toBe("failed");

    retryFailed(db, "j1");
    expect(byRow()[1]).toMatchObject({ status: "pending", vidiqJobId: null });
    expect(byRow()[3].status).toBe("done");
  });
});
