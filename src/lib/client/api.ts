import type { Job, Language } from "@/lib/jobs/repo";
import type { ConfigureInput, JobSummary, ReportItem, RunListItem, TableInfo } from "@/lib/jobs/service";
import type { ConnectionState } from "@/lib/vidiq/client";
import type { Balance } from "@/lib/vidiq/parse";

export type { JobSummary, ReportItem, RunListItem, TableInfo };
export type Report = { job: Job; items: ReportItem[] };

export type VidiqStatus = { connection: ConnectionState; balance: Balance | null; balanceError?: string };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly kind?: string,
  ) {
    super(message);
  }
}

const isSpanish = () => typeof document !== "undefined" && document.documentElement.lang === "es";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", ...init });
  } catch {
    throw new ApiError(
      isSpanish()
        ? "El servidor de la aplicación no responde. Comprueba que siga abierto."
        : "The app server is not responding. Check that it is still running.",
      0,
    );
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const fallback = isSpanish() ? "Algo salió mal. Inténtalo de nuevo." : "Something went wrong. Try again.";
    throw new ApiError(body.error ?? fallback, response.status, body.kind);
  }
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

  listRuns: () => request<{ jobs: RunListItem[] }>("/api/jobs"),
  clearRuns: () => request<{ deleted: number }>("/api/jobs", { method: "DELETE" }),
  upload: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ jobId: string }>("/api/jobs", { method: "POST", body: form });
  },
  job: (id: string, since?: number) => request<JobSummary>(`/api/jobs/${id}${since ? `?since=${since}` : ""}`),
  rename: (id: string, name: string) => request<JobSummary>(`/api/jobs/${id}`, json("PATCH", { name })),
  remove: (id: string) => request<{ ok: true }>(`/api/jobs/${id}`, { method: "DELETE" }),
  table: (id: string, sheet?: string) =>
    request<TableInfo>(`/api/jobs/${id}/table${sheet ? `?sheet=${encodeURIComponent(sheet)}` : ""}`),
  configure: (id: string, input: ConfigureInput) => request<JobSummary>(`/api/jobs/${id}/config`, json("PUT", input)),
  preview: (id: string) => request<JobSummary>(`/api/jobs/${id}/preview`, json("POST")),
  start: (id: string) => request<JobSummary>(`/api/jobs/${id}/start`, json("POST")),
  pause: (id: string) => request<JobSummary>(`/api/jobs/${id}/pause`, json("POST")),
  retry: (id: string, sheetRow?: number) => request<JobSummary>(`/api/jobs/${id}/retry`, json("POST", { sheetRow })),
  editRow: (id: string, sheetRow: number, summary: string, language: Language) =>
    request<JobSummary>(`/api/jobs/${id}/edit`, json("PUT", { sheetRow, summary, language })),
  regenerateRow: (id: string, sheetRow: number) => request<JobSummary>(`/api/jobs/${id}/regenerate`, json("POST", { sheetRow })),
  transcripts: (id: string, sheetRows?: number[]) => request<JobSummary>(`/api/jobs/${id}/transcripts`, json("POST", { sheetRows })),
  include: (id: string, sheetRows: number[]) => request<JobSummary>(`/api/jobs/${id}/include`, json("POST", { sheetRows })),
  report: (id: string, sheetRows?: number[]) =>
    request<Report>(`/api/jobs/${id}/report${sheetRows?.length ? `?rows=${sheetRows.join(",")}` : ""}`),
  downloadUrl: (id: string, transcripts = false) => `/api/jobs/${id}/download${transcripts ? "?transcripts=1" : ""}`,
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
