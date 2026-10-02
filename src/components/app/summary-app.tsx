"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useJob, useVidiqStatus } from "@/lib/client/hooks";
import { formatNumber } from "@/lib/client/format";
import { cn } from "@/lib/utils";
import { ConfigurePanel } from "./configure-panel";
import { ConnectPanel } from "./connect-panel";
import { RunPanel } from "./run-panel";
import { StepRail, type StepId, type StepState } from "./step-rail";
import { ThemeToggle } from "./theme-toggle";
import { UploadPanel } from "./upload-panel";

/** Keeps the open run in the address bar so a refresh lands in the same place. */
function useJobParam() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const update = useCallback(
    (id: string | null) => router.replace(id ? `${pathname}?job=${encodeURIComponent(id)}` : pathname, { scroll: false }),
    [router, pathname],
  );
  return [params.get("job"), update] as const;
}

export function SummaryApp() {
  const vidiq = useVidiqStatus();
  const [jobId, setJobId] = useJobParam();
  const job = useJob(jobId);
  const [chosen, setChosen] = useState<StepId | null>(null);

  const connected = vidiq.status?.connection.status === "connected";
  const summary = job.summary?.job.id === jobId ? job.summary : null;
  const started = !!summary && summary.job.status !== "draft";

  const steps: StepState[] = useMemo(
    () => [
      { id: "connect", label: "Connect", hint: connected ? "vidIQ connected" : "Sign in to vidIQ", done: connected, locked: false },
      { id: "upload", label: "Upload", hint: summary ? summary.job.fileName : "CSV or Excel file", done: !!summary, locked: false },
      { id: "configure", label: "Configure", hint: "Columns and template", done: started, locked: !summary || started },
      { id: "run", label: "Run", hint: started ? "Progress and download" : "Starts after setup", done: summary?.job.status === "completed", locked: !started },
    ],
    [connected, summary, started],
  );

  const suggested: StepId = !vidiq.status ? "connect" : !connected && !summary ? "connect" : !summary ? "upload" : started ? "run" : "configure";
  const requested = chosen && !steps.find((s) => s.id === chosen)?.locked ? chosen : null;
  const active = requested ?? suggested;

  // When a sign-in completes in another tab, move on from the Connect step by itself.
  const connectionStatus = vidiq.status?.connection.status;
  const [previousStatus, setPreviousStatus] = useState(connectionStatus);
  if (connectionStatus !== previousStatus) {
    setPreviousStatus(connectionStatus);
    if (connectionStatus === "connected" && previousStatus === "pending") setChosen(null);
  }

  const go = (id: StepId) => setChosen(id);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden className="grid size-7 shrink-0 grid-cols-2 gap-0.5 rounded-md bg-primary p-1.5">
              <span className="rounded-[2px] bg-primary-foreground/90" />
              <span className="rounded-[2px] bg-primary-foreground/45" />
              <span className="rounded-[2px] bg-primary-foreground/45" />
              <span className="rounded-[2px] bg-primary-foreground/90" />
            </span>
            <span className="truncate text-base font-semibold tracking-tight">Video Summaries</span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => go("connect")}
              className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span
                aria-hidden
                className={cn(
                  "size-2 rounded-full",
                  connected ? "bg-success" : vidiq.status?.connection.status === "pending" ? "bg-info" : "bg-muted-foreground/50",
                )}
              />
              <span className="font-medium">vidIQ</span>
              <span className={cn("text-muted-foreground", !connected && "max-sm:sr-only")}>
                {connected
                  ? vidiq.status?.balance?.unlimited
                    ? "Unlimited"
                    : vidiq.status?.balance?.total != null
                      ? `${formatNumber(vidiq.status.balance.total)} credits`
                      : "Connected"
                  : vidiq.status?.connection.status === "pending"
                    ? "Waiting for sign-in"
                    : "Not connected"}
              </span>
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl flex-1 gap-6 px-4 py-6 sm:px-6 content-start lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10 lg:py-10">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <StepRail steps={steps} active={active} onSelect={go} />
        </aside>

        <main className="min-w-0 pb-16">
          {vidiq.error && (
            <Alert variant="destructive" className="mb-6">
              <AlertTitle>The app server is not responding</AlertTitle>
              <AlertDescription>{vidiq.error}</AlertDescription>
            </Alert>
          )}
          {job.error && jobId && (
            <Alert variant="destructive" className="mb-6">
              <AlertTitle>This run could not be opened</AlertTitle>
              <AlertDescription>{job.error}</AlertDescription>
            </Alert>
          )}

          {active === "connect" && (
            <ConnectPanel
              status={vidiq.status}
              onChange={(status) => {
                vidiq.setStatus(status);
                if (status.connection.status === "disconnected") void vidiq.refresh();
              }}
              onContinue={() => go(summary ? (started ? "run" : "configure") : "upload")}
            />
          )}
          {active === "upload" && (
            <UploadPanel
              onUploaded={(id) => {
                setJobId(id);
                setChosen("configure");
              }}
              onOpenJob={(id) => {
                setJobId(id);
                setChosen(null);
              }}
            />
          )}
          {active === "configure" && summary && (
            <ConfigurePanel
              key={summary.job.id}
              summary={summary}
              vidiq={vidiq.status}
              onSummary={job.setSummary}
              onStarted={(next) => {
                job.setSummary(next);
                setChosen("run");
              }}
              onConnect={() => go("connect")}
            />
          )}
          {active === "run" && summary && (
            <RunPanel
              summary={summary}
              vidiq={vidiq.status}
              onSummary={(next) => {
                job.setSummary(next);
                void vidiq.refresh();
              }}
              onNewRun={() => {
                setJobId(null);
                setChosen("upload");
              }}
              onConnect={() => go("connect")}
            />
          )}
          {(active === "configure" || active === "run") && !summary && !job.error && (
            <div className="h-96 animate-pulse rounded-lg bg-muted" aria-label="Loading the run" />
          )}
        </main>
      </div>

      <footer className="border-t">
        <div className="mx-auto max-w-7xl px-4 py-4 text-xs text-muted-foreground sm:px-6">
          Built by{" "}
          <a href="https://www.abdullahawais.com" target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
            Muhammad Abdullah Awais
          </a>
        </div>
      </footer>
    </div>
  );
}
