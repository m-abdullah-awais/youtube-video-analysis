import type { Db } from "../db";
import { buildPrompt, missingSections, toPlainText } from "../template/template";
import { VidiqError } from "../vidiq/errors";
import {
  claimNextPending,
  completeRow,
  getJob,
  hasPending,
  markRow,
  recoverInterrupted,
  setJobStatus,
  type JobRow,
  type PauseReason,
} from "./repo";

export type PollResult = { state: "running" } | { state: "done"; text: string } | { state: "failed"; message: string };

/** The two vidIQ calls the runner needs; swapped for a fake in tests. */
export interface Gateway {
  submit(row: { videoId: string; isShort: boolean; source: string }, prompt: string): Promise<string>;
  poll(vidiqJobId: string): Promise<PollResult>;
}

export type RunnerOptions = {
  concurrency: number;
  pollMs: number;
  maxAttempts: number;
  sleep?: (ms: number) => Promise<void>;
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Works through a job's pending rows with a fixed number of parallel vidIQ jobs.
 * Each finished summary is saved straight away, so a stop at any point loses nothing.
 */
export class JobRunner {
  private paused = false;
  private pauseReason: PauseReason = "user";
  private wake: () => void = () => {};
  private readonly woken = new Promise<void>((resolve) => (this.wake = resolve));
  private readonly sleepFor: (ms: number) => Promise<void>;

  constructor(
    private readonly db: Db,
    private readonly jobId: string,
    private readonly gateway: Gateway,
    private readonly options: RunnerOptions,
  ) {
    this.sleepFor = options.sleep ?? wait;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  pause(reason: PauseReason = "user"): void {
    if (this.paused) return;
    this.paused = true;
    this.pauseReason = reason;
    this.wake();
  }

  /** Waits, but wakes straight away when the job is paused. */
  private sleep(ms: number): Promise<void> {
    return Promise.race([this.sleepFor(ms), this.woken]);
  }

  async run(): Promise<void> {
    const job = getJob(this.db, this.jobId);
    if (!job) return;
    const prompt = buildPrompt(job.template);
    const resumeQueue = recoverInterrupted(this.db, this.jobId);

    const worker = async () => {
      while (!this.paused) {
        const row = resumeQueue.shift() ?? claimNextPending(this.db, this.jobId);
        if (!row) return;
        await this.process(row, prompt, job.template);
      }
    };
    await Promise.all(Array.from({ length: this.options.concurrency }, worker));

    if (this.paused) setJobStatus(this.db, this.jobId, "paused", this.pauseReason);
    else if (!hasPending(this.db, this.jobId)) setJobStatus(this.db, this.jobId, "completed");
  }

  private async process(row: JobRow, prompt: string, template: string): Promise<void> {
    let vidiqJobId = row.vidiqJobId;
    try {
      if (!vidiqJobId) {
        vidiqJobId = await this.gateway.submit(
          { videoId: row.videoId!, isShort: row.isShort, source: row.source },
          prompt,
        );
        markRow(this.db, this.jobId, row.sheetRow, { vidiqJobId });
      }
      for (;;) {
        await this.sleep(this.options.pollMs);
        if (this.paused) return;
        const result = await this.gateway.poll(vidiqJobId);
        if (result.state === "running") continue;
        if (result.state === "done") {
          const summary = toPlainText(result.text);
          completeRow(this.db, this.jobId, row.sheetRow, summary, describeMissing(missingSections(template, summary)));
        } else {
          markRow(this.db, this.jobId, row.sheetRow, { status: "failed", error: result.message });
        }
        return;
      }
    } catch (caught) {
      const error = caught instanceof VidiqError ? caught : new VidiqError("transient", errorMessage(caught));
      if (error.kind === "auth" || error.kind === "credits") {
        markRow(this.db, this.jobId, row.sheetRow, {
          status: "pending",
          vidiqJobId,
          attempts: Math.max(row.attempts - 1, 0),
        });
        this.pause(error.kind);
      } else if (error.kind === "transient" && row.attempts < this.options.maxAttempts) {
        await this.sleep(Math.min(30_000, 2_000 * 2 ** row.attempts));
        markRow(this.db, this.jobId, row.sheetRow, { status: "pending", vidiqJobId, error: error.message });
      } else {
        markRow(this.db, this.jobId, row.sheetRow, { status: "failed", error: error.message });
      }
    }
  }
}

function describeMissing(missing: string[]): string | null {
  if (missing.length === 0) return null;
  return `Missing section${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
