import type { Db } from "../db";
import { createGateway } from "../vidiq/client";
import { getJob, getPreview, setJobStatus } from "./repo";
import { JobRunner } from "./runner";
import { runPreview } from "./service";

const POLL_MS = 5_000;
const RUNNER_OPTIONS = { concurrency: 2, pollMs: POLL_MS, maxAttempts: 3 };

type Entry = { runner: JobRunner; done: Promise<void> };
const shared = globalThis as unknown as { __jobRunners?: Map<string, Entry>; __previewRuns?: Set<string> };
const runners = (shared.__jobRunners ??= new Map());
const previews = (shared.__previewRuns ??= new Set());

export function isRunnerActive(jobId: string): boolean {
  const entry = runners.get(jobId);
  return !!entry && !entry.runner.isPaused;
}

export function anyRunnerActive(): boolean {
  return [...runners.keys()].some(isRunnerActive);
}

/** Starts (or resumes) a job. Waits for a paused runner to wind down first so two never overlap. */
export async function startRunner(db: Db, jobId: string): Promise<void> {
  const existing = runners.get(jobId);
  if (existing) {
    if (!existing.runner.isPaused) return;
    await existing.done;
    if (runners.get(jobId) && runners.get(jobId) !== existing) return;
  }

  setJobStatus(db, jobId, "running");
  const runner = new JobRunner(db, jobId, createGateway(db), RUNNER_OPTIONS);
  const done = runner
    .run()
    .catch((error) => {
      console.error(`Job ${jobId} stopped unexpectedly`, error);
      if (getJob(db, jobId)?.status === "running") setJobStatus(db, jobId, "paused", "user");
    })
    .finally(() => {
      if (runners.get(jobId)?.runner === runner) runners.delete(jobId);
    });
  runners.set(jobId, { runner, done });
}

export function pauseRunner(db: Db, jobId: string): void {
  runners.get(jobId)?.runner.pause("user");
  setJobStatus(db, jobId, "paused", "user");
}

/** Runs the job's trial summary in the background, once. */
export function startPreviewRun(db: Db, jobId: string): void {
  if (previews.has(jobId)) return;
  previews.add(jobId);
  void runPreview(db, jobId, createGateway(db), { pollMs: POLL_MS })
    .catch((error) => console.error(`Trial summary for ${jobId} failed`, error))
    .finally(() => previews.delete(jobId));
}

export function isPreviewActive(jobId: string): boolean {
  return previews.has(jobId);
}

/** After a server restart, work that was in progress is picked up again on first read. */
export function resumeIfInterrupted(db: Db, jobId: string): void {
  if (getJob(db, jobId)?.status === "running" && !runners.has(jobId)) void startRunner(db, jobId);
  if (getPreview(db, jobId)?.status === "running" && !previews.has(jobId)) startPreviewRun(db, jobId);
}
