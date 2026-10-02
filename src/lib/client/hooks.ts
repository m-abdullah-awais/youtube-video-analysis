"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage, type JobSummary, type VidiqStatus } from "./api";

/** Re-runs `tick` on an interval that can change with state; pauses while the tab is hidden. */
function usePolling(tick: () => void, intervalMs: number | null) {
  const saved = useRef(tick);
  useEffect(() => {
    saved.current = tick;
  });
  useEffect(() => {
    if (intervalMs === null) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") saved.current();
    }, intervalMs);
    const onVisible = () => document.visibilityState === "visible" && saved.current();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs]);
}

export function useVidiqStatus() {
  const [status, setStatus] = useState<VidiqStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    () =>
      api.vidiqStatus().then(
        (next) => {
          setStatus(next);
          setError(null);
        },
        (e) => setError(errorMessage(e)),
      ),
    [],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const pending = status?.connection.status === "pending";
  usePolling(() => void refresh(), pending ? 2_500 : 60_000);

  return { status, error, refresh, setStatus };
}

type JobState = { jobId: string | null; summary: JobSummary | null; error: string | null };

export function useJob(jobId: string | null) {
  const [state, setState] = useState<JobState>({ jobId: null, summary: null, error: null });

  const load = useCallback(
    (id: string) =>
      api.job(id).then(
        (summary) => setState({ jobId: id, summary, error: null }),
        (e) =>
          setState((s) => ({ jobId: id, summary: s.jobId === id ? s.summary : null, error: errorMessage(e) })),
      ),
    [],
  );

  useEffect(() => {
    if (jobId) void load(jobId);
  }, [jobId, load]);

  // State from a previously opened run is ignored rather than reset.
  const current = state.jobId === jobId ? state : { summary: null, error: null };
  const running = current.summary?.job.status === "running";
  usePolling(() => jobId && void load(jobId), running ? 1_500 : null);

  const setSummary = useCallback((summary: JobSummary) => setState({ jobId: summary.job.id, summary, error: null }), []);

  return { summary: current.summary, error: current.error, setSummary };
}
