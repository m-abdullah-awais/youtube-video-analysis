"use client";

import { useEffect, useId, useState, type DragEvent } from "react";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { api, errorMessage, type JobListItem } from "@/lib/client/api";
import { formatDateTime, formatNumber } from "@/lib/client/format";
import { cn } from "@/lib/utils";
import { PanelHeader } from "./panel-header";

const ACCEPT = ".csv,.xlsx,.xls";

export function UploadPanel({ onUploaded, onOpenJob }: { onUploaded: (jobId: string) => void; onOpenJob: (jobId: string) => void }) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<JobListItem[] | null>(null);

  useEffect(() => {
    api
      .listJobs()
      .then(({ jobs }) => setRecent(jobs))
      .catch(() => setRecent([]));
  }, []);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setUploading(file.name);
    try {
      const { jobId } = await api.upload(file);
      onUploaded(jobId);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUploading(null);
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void upload(event.dataTransfer.files[0]);
  };

  return (
    <section aria-labelledby="upload-title" className="space-y-6">
      <PanelHeader
        id="upload-title"
        title="Upload your video spreadsheet"
        description="Use a CSV or Excel file with one video per row and a column of YouTube links or video IDs. Your original file stays untouched; you download a copy with the summaries."
      />

      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "group relative flex min-h-56 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed bg-card px-6 py-10 text-center transition-colors",
          "has-[input:focus-visible]:border-solid has-[input:focus-visible]:border-primary has-[input:focus-visible]:ring-4 has-[input:focus-visible]:ring-primary/15",
          dragging ? "border-solid border-primary bg-accent" : "border-input hover:border-primary/60",
          uploading && "pointer-events-none opacity-80",
        )}
      >
        <input
          id={inputId}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          disabled={!!uploading}
          onChange={(e) => {
            void upload(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {uploading ? (
          <>
            <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
            <p className="font-medium" role="status">
              Reading {uploading}
            </p>
          </>
        ) : (
          <>
            <span className="flex size-12 items-center justify-center rounded-full bg-accent text-primary">
              <Upload className="size-5" aria-hidden />
            </span>
            <p className="text-base font-medium">{dragging ? "Drop to upload" : "Drop your file here, or choose one"}</p>
            <p className="text-sm text-muted-foreground">.csv, .xlsx or .xls, up to 20 MB and 5,000 rows</p>
          </>
        )}
      </label>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>This file could not be used</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {recent && recent.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">Recent runs</h3>
          <ul className="mt-3 divide-y rounded-lg border bg-card">
            {recent.map((job) => (
              <li key={job.id}>
                <button
                  type="button"
                  onClick={() => onOpenJob(job.id)}
                  className="flex w-full items-center gap-4 px-4 py-3 text-left outline-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                >
                  <FileSpreadsheet className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{job.fileName}</span>
                    <span className="block text-xs text-muted-foreground">{formatDateTime(job.createdAt)}</span>
                  </span>
                  <span className="text-right text-xs text-muted-foreground">
                    <span className="block text-sm font-medium text-foreground">
                      {formatNumber(job.counts.done)} of {formatNumber(job.counts.done + job.counts.pending + job.counts.running + job.counts.failed)} done
                    </span>
                    {JOB_STATUS_LABEL[job.status]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

const JOB_STATUS_LABEL = {
  draft: "Not started",
  running: "Running",
  paused: "Paused",
  completed: "Finished",
} as const;
