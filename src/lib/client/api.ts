import type { Job } from "@/lib/jobs/repo";
import type { ConfigureInput, JobSummary, TableInfo } from "@/lib/jobs/service";
import type { ConnectionState } from "@/lib/vidiq/client";
import type { Balance } from "@/lib/vidiq/parse";

export type { JobSummary, TableInfo };

export type VidiqStatus = { connection: ConnectionState; balance: Balance | null; balanceError?: string };
export type JobListItem = Job & { counts: JobSummary["counts"] };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly kind?: string,
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", ...init });
  } catch {
    throw new ApiError("The app server is not responding. Check that it is still running.", 0);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.error ?? "Something went wrong. Try again.", response.status, body.kind);
  return body as T;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const api = {
  vidiqStatus: () => request<VidiqStatus>("/api/vidiq/status"),
  connect: () => request<{ authorizationUrl: string }>("/api/vidiq/connect", { method: "POST" }),
  cancelConnect: () => request<{ ok: true }>("/api/vidiq/cancel", { method: "POST" }),
  disconnect: () => request<{ ok: true }>("/api/vidiq/disconnect", { method: "POST" }),

  listJobs: () => request<{ jobs: JobListItem[] }>("/api/jobs"),
  upload: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ jobId: string }>("/api/jobs", { method: "POST", body: form });
  },
  job: (id: string) => request<JobSummary>(`/api/jobs/${id}`),
  table: (id: string, sheet?: string) =>
    request<TableInfo>(`/api/jobs/${id}/table${sheet ? `?sheet=${encodeURIComponent(sheet)}` : ""}`),
  configure: (id: string, input: ConfigureInput) => request<JobSummary>(`/api/jobs/${id}/config`, json("PUT", input)),
  start: (id: string) => request<JobSummary>(`/api/jobs/${id}/start`, json("POST")),
  pause: (id: string) => request<JobSummary>(`/api/jobs/${id}/pause`, json("POST")),
  retry: (id: string, sheetRow?: number) => request<JobSummary>(`/api/jobs/${id}/retry`, json("POST", { sheetRow })),
  downloadUrl: (id: string) => `/api/jobs/${id}/download`,
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}
