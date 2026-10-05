import type { Db } from "../db";
import { buildPrompt, cleanSummary, sectionWarning, splitBilingual } from "../template/template";
import { describeFailure, TEMPORARY_REASONS } from "../vidiq/describe";
import { VidiqError } from "../vidiq/errors";
import {
  claimNextPending,
  claimNextTranscript,
  completeRow,
  getJob,
  hasPending,
  markRow,
  queueTranscripts,
  recoverInterrupted,
  saveTranscript,
  setJobStatus,
  type Job,
  type JobRow,
  type Language,
  type PauseReason,
} from "./repo";

export type PollResult = { state: "running" } | { state: "done"; text: string } | { state: "failed"; message: string };
export type TranscriptResult = { status: "done"; text: string } | { status: "unavailable" };

/** The vidIQ calls the runner needs; swapped for a fake in tests. */
export interface Gateway {
  submit(row: { videoId: string; isShort: boolean; source: string }, prompt: string): Promise<string>;
  poll(vidiqJobId: string): Promise<PollResult>;
  transcript(videoId: string, language: Language): Promise<TranscriptResult>;
}

export type RunnerOptions = {
  concurrency: number;
  pollMs: number;
  maxAttempts: number;
  sleep?: (ms: number) => Promise<void>;
};

export const SPANISH_MISSING = "Spanish version missing";

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Works through a job's pending summaries, then its transcripts, with a fixed number
 * of parallel vidIQ calls. Each result is saved straight away, so a stop at any point loses nothing.
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
        if (row) {
          await this.summarize(row, prompt, job);
          continue;
        }
        const transcript = claimNextTranscript(this.db, this.jobId);
        if (!transcript) return;
        await this.fetchTranscript(transcript);
      }
    };
    await Promise.all(Array.from({ length: this.options.concurrency }, worker));

    if (this.paused) setJobStatus(this.db, this.jobId, "paused", this.pauseReason);
    else if (!hasPending(this.db, this.jobId)) setJobStatus(this.db, this.jobId, "completed");
  }

  private backoff(attempts: number): Promise<void> {
    return this.sleep(Math.min(30_000, 2_000 * 2 ** attempts));
  }

  private async summarize(row: JobRow, prompt: string, job: Job): Promise<void> {
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
          await this.saveSummary(row, result.text, job);
        } else if (TEMPORARY_REASONS.includes(describeFailure(result.message).reason) && row.attempts < this.options.maxAttempts) {
          // vidIQ refunds these; send the video again after a short wait.
          await this.backoff(row.attempts);
          markRow(this.db, this.jobId, row.sheetRow, { status: "pending", vidiqJobId: null, error: result.message });
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
        await this.backoff(row.attempts);
        markRow(this.db, this.jobId, row.sheetRow, { status: "pending", vidiqJobId, error: error.message });
      } else {
        markRow(this.db, this.jobId, row.sheetRow, { status: "failed", error: error.message });
      }
    }
  }

  /** Splits the two-language answer; asks once more if the Spanish half is missing. */
  private async saveSummary(row: JobRow, text: string, job: Job): Promise<void> {
    const split = splitBilingual(text, job.template);
    if (!split && row.attempts < this.options.maxAttempts) {
      await this.backoff(row.attempts);
      markRow(this.db, this.jobId, row.sheetRow, { status: "pending", vidiqJobId: null, error: SPANISH_MISSING });
      return;
    }
    const en = split?.en ?? cleanSummary(text, job.template);
    const es = split?.es ?? null;
    const warning = [es ? null : SPANISH_MISSING, sectionWarning(job.template, en, es)].filter(Boolean).join(". ") || null;
    completeRow(this.db, this.jobId, row.sheetRow, en, es, warning);
    if (job.includeTranscripts) queueTranscripts(this.db, this.jobId, [row.sheetRow]);
  }

  private async fetchTranscript(task: { sheetRow: number; language: Language; videoId: string }): Promise<void> {
    try {
      const result = await this.gateway.transcript(task.videoId, task.language);
      saveTranscript(this.db, this.jobId, task.sheetRow, task.language, {
        status: result.status,
        text: result.status === "done" ? result.text : null,
      });
    } catch (caught) {
      const error = caught instanceof VidiqError ? caught : new VidiqError("transient", errorMessage(caught));
      if (error.kind === "auth" || error.kind === "credits") {
        saveTranscript(this.db, this.jobId, task.sheetRow, task.language, { status: "pending" });
        this.pause(error.kind);
      } else {
        saveTranscript(this.db, this.jobId, task.sheetRow, task.language, { status: "failed", error: error.message });
      }
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
