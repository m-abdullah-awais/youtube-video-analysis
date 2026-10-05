"use client";

import { useCallback, useEffect, useId, useState, type DragEvent } from "react";
import { Download, FileSpreadsheet, FileText, Loader2, MoreHorizontal, Pencil, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errorMessage, type RunListItem } from "@/lib/client/api";
import { downloadFile } from "@/lib/client/download";
import { downloadRunPdf } from "@/lib/client/pdf";
import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { PanelHeader } from "./panel-header";

const ACCEPT = ".csv,.xlsx,.xls";
const COLLAPSED = 5;

type Props = {
  onUploaded: (jobId: string) => void;
  onOpenJob: (jobId: string) => void;
  onDeleted: (jobId: string | null) => void;
};

export function UploadPanel({ onUploaded, onOpenJob, onDeleted }: Props) {
  const { t } = useI18n();
  const u = t.upload;
  const inputId = useId();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunListItem[] | null>(null);

  const loadRuns = useCallback(
    () =>
      api.listRuns().then(
        ({ jobs }) => setRuns(jobs),
        () => setRuns([]),
      ),
    [],
  );

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

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
      <PanelHeader id="upload-title" title={u.title} description={u.description} />

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
              {u.reading(uploading)}
            </p>
          </>
        ) : (
          <>
            <span className="flex size-12 items-center justify-center rounded-full bg-accent text-primary">
              <Upload className="size-5" aria-hidden />
            </span>
            <p className="text-base font-medium">{dragging ? u.drop : u.dropOrChoose}</p>
            <p className="text-sm text-muted-foreground">{u.formats}</p>
          </>
        )}
      </label>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <a
          href="/sample-videos.csv"
          download
          className="inline-flex items-center gap-1.5 font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Download className="size-4" aria-hidden />
          {u.sample}
        </a>
        <span className="text-muted-foreground">{u.sampleHint}</span>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>{u.errorTitle}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <RunHistory runs={runs} onOpen={onOpenJob} onChanged={loadRuns} onDeleted={onDeleted} />
    </section>
  );
}

function RunHistory({
  runs,
  onOpen,
  onChanged,
  onDeleted,
}: {
  runs: RunListItem[] | null;
  onOpen: (id: string) => void;
  onChanged: () => void;
  onDeleted: (id: string | null) => void;
}) {
  const i18n = useI18n();
  const { t, n, dateTime } = i18n;
  const u = t.upload;
  const [expanded, setExpanded] = useState(false);
  const [renaming, setRenaming] = useState<RunListItem | null>(null);
  const [deleting, setDeleting] = useState<RunListItem | null>(null);
  const [clearing, setClearing] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  if (runs === null) return <div className="h-32 animate-pulse rounded-lg bg-muted" />;

  const act = async (call: () => Promise<unknown>, success: string, after?: () => void) => {
    setBusy(true);
    try {
      await call();
      toast.success(success);
      after?.();
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const shown = expanded ? runs : runs.slice(0, COLLAPSED);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{u.history}</h3>
        {runs.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setClearing(true)}>
            <Trash2 aria-hidden />
            {u.clearAll}
          </Button>
        )}
      </div>

      {runs.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{u.historyEmpty}</p>
      ) : (
        <ul className="mt-3 divide-y rounded-lg border bg-card">
          {shown.map((run) => {
            const total = run.counts.done + run.counts.pending + run.counts.running + run.counts.failed + run.counts.duplicate;
            const running = run.status === "running";
            return (
              <li key={run.id} className="flex items-center gap-1 pr-2">
                <button
                  type="button"
                  onClick={() => onOpen(run.id)}
                  className="flex min-w-0 flex-1 items-center gap-4 px-4 py-3 text-left outline-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                >
                  <FileSpreadsheet className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{run.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {run.name !== run.fileName ? `${run.fileName}, ` : ""}
                      {dateTime(run.createdAt)}
                    </span>
                  </span>
                  <span className="text-right text-xs text-muted-foreground">
                    <span className="block text-sm font-medium text-foreground">{u.doneOf(n(run.counts.done), n(total))}</span>
                    {u.jobStatus[run.status]}
                  </span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={u.actions(run.name)} />}>
                    <MoreHorizontal aria-hidden />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-40">
                    <DropdownMenuItem onClick={() => onOpen(run.id)}>
                      <FileSpreadsheet aria-hidden />
                      {u.open}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={run.counts.done === 0}
                      onClick={() =>
                        void downloadFile(api.downloadUrl(run.id, true), `${run.name}.${run.format}`).catch((e) =>
                          toast.error(errorMessage(e)),
                        )
                      }
                    >
                      <Download aria-hidden />
                      {t.run.exportSheetTranscripts}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={run.counts.done === 0}
                      onClick={() => {
                        toast(t.run.preparingPdf);
                        void api
                          .report(run.id)
                          .then((report) => downloadRunPdf(report, { t, date: i18n.date }))
                          .then(() => toast.success(t.run.pdfReady))
                          .catch((e) => toast.error(errorMessage(e)));
                      }}
                    >
                      <FileText aria-hidden />
                      {t.run.exportPdf}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setName(run.name);
                        setRenaming(run);
                      }}
                    >
                      <Pencil aria-hidden />
                      {u.rename}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={running}
                      title={running ? u.runningNoDelete : undefined}
                      onClick={() => setDeleting(run)}
                    >
                      <Trash2 aria-hidden />
                      {u.delete}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      )}
      {!expanded && runs.length > COLLAPSED && (
        <Button variant="ghost" className="mt-2" onClick={() => setExpanded(true)}>
          {u.showAll(runs.length)}
        </Button>
      )}

      <Dialog open={renaming !== null} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (renaming) void act(() => api.rename(renaming.id, name), u.renamed, () => setRenaming(null));
            }}
            className="space-y-4"
          >
            <DialogHeader>
              <DialogTitle>{u.renameTitle}</DialogTitle>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="run-name">{u.nameLabel}</Label>
              <Input id="run-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus />
            </div>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline">{u.cancel}</Button>} />
              <Button type="submit" disabled={busy || !name.trim()}>
                {u.save}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{u.deleteTitle}</DialogTitle>
            <DialogDescription>{deleting ? u.deleteBody(deleting.name) : ""}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline">{u.cancel}</Button>} />
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() =>
                deleting &&
                void act(() => api.remove(deleting.id), u.deleted, () => {
                  onDeleted(deleting.id);
                  setDeleting(null);
                })
              }
            >
              {u.delete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={clearing} onOpenChange={setClearing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{u.clearTitle}</DialogTitle>
            <DialogDescription>{u.clearBody}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline">{u.cancel}</Button>} />
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() =>
                void act(() => api.clearRuns(), u.cleared, () => {
                  onDeleted(null);
                  setClearing(false);
                })
              }
            >
              {u.clearAll}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
