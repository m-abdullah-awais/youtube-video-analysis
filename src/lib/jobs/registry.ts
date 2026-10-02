import type { Db } from "../db";
import { createGateway } from "../vidiq/client";
import { getJob, setJobStatus } from "./repo";
import { JobRunner } from "./runner";

const RUNNER_OPTIONS = { concurrency: 2, pollMs: 5_000, maxAttempts: 3 };

type Entry = { runner: JobRunner; done: Promise<void> };
const shared = globalThis as unknown as { __jobRunners?: Map<string, Entry> };
const runners = (shared.__jobRunners ??= new Map());

export function isRunnerActive(jobId: string): boolean {
  const entry = runners.get(jobId);
  return !!entry && !entry.runner.isPaused;
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

/** After a server restart, jobs that were running are picked up again on first read. */
export function resumeIfInterrupted(db: Db, jobId: string): void {
  if (getJob(db, jobId)?.status === "running" && !runners.has(jobId)) void startRunner(db, jobId);
}
