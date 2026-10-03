"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useJob, useVidiqStatus } from "@/lib/client/hooks";
import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { BrandMark } from "./brand-mark";
import { ConfigurePanel } from "./configure-panel";
import { ConnectPanel } from "./connect-panel";
import { LanguageSwitch } from "./language-switch";
import { notify } from "./notifications";
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
  const { t, n } = useI18n();
  const vidiq = useVidiqStatus();
  const [jobId, setJobId] = useJobParam();
  const job = useJob(jobId);
  const [chosen, setChosen] = useState<StepId | null>(null);

  const connected = vidiq.status?.connection.status === "connected";
  const summary = job.summary?.job.id === jobId ? job.summary : null;
  const started = !!summary && summary.job.status !== "draft";
  const s = t.steps;

  const steps: StepState[] = useMemo(
    () => [
      { id: "connect", label: s.connect, hint: connected ? s.connectHintDone : s.connectHint, done: connected, locked: false },
      { id: "upload", label: s.upload, hint: summary ? summary.job.name : s.uploadHint, done: !!summary, locked: false },
      { id: "configure", label: s.configure, hint: s.configureHint, done: started, locked: !summary || started },
      {
        id: "run",
        label: s.run,
        hint: started ? s.runHintDone : s.runHint,
        done: summary?.job.status === "completed",
        locked: !started,
      },
    ],
    [connected, summary, started, s],
  );

  const suggested: StepId = !vidiq.status ? "connect" : !connected && !summary ? "connect" : !summary ? "upload" : started ? "run" : "configure";
  const requested = chosen && !steps.find((step) => step.id === chosen)?.locked ? chosen : null;
  const active = requested ?? suggested;

  // When a sign-in completes in another tab, move on from the Connect step by itself.
  const connectionStatus = vidiq.status?.connection.status;
  const [previousStatus, setPreviousStatus] = useState(connectionStatus);
  if (connectionStatus !== previousStatus) {
    setPreviousStatus(connectionStatus);
    if (connectionStatus === "connected" && previousStatus === "pending") setChosen(null);
  }

  // Tell the user when a run they started finishes or stops, even from another tab.
  const runState = summary ? `${summary.job.id}:${summary.job.status}:${summary.job.pauseReason}` : null;
  const [previousRun, setPreviousRun] = useState(runState);
  if (runState !== previousRun) {
    setPreviousRun(runState);
    const wasRunning = previousRun?.startsWith(`${summary?.job.id}:running`);
    if (summary && wasRunning && summary.job.status === "completed") {
      notify(t.notify.doneTitle, t.notify.doneBody(summary.counts.done, summary.counts.failed));
    } else if (summary && wasRunning && summary.job.status === "paused" && summary.job.pauseReason !== "user") {
      notify(t.notify.pausedTitle, summary.job.pauseReason === "credits" ? t.notify.creditsBody : t.notify.authBody);
    }
  }

  // The browser tab shows where you are, and live progress while a run works.
  const tabTitle = (() => {
    if (active === "run" && summary) {
      const target = summary.counts.pending + summary.counts.running + summary.counts.done + summary.counts.failed + summary.counts.duplicate;
      if (summary.job.status === "running") return t.title.running(n(summary.counts.done), n(target));
      return summary.job.status === "completed" ? t.title.done : t.title.paused;
    }
    return active === "connect" ? t.title.connect : active === "upload" ? t.title.upload : t.title.configure;
  })();
  useEffect(() => {
    document.title = `${tabTitle} | ${t.appName}`;
  }, [tabTitle, t.appName]);

  const go = (id: StepId) => setChosen(id);
  const balance = vidiq.status?.balance;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <BrandMark />
            <span className="truncate text-base font-semibold tracking-tight">{t.appName}</span>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => go("connect")}
              className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span
                aria-hidden
                className={cn(
                  "size-2 rounded-full",
                  connected ? "bg-success" : connectionStatus === "pending" ? "bg-info" : "bg-muted-foreground/50",
                )}
              />
              <span className="font-medium">vidIQ</span>
              <span className={cn("text-muted-foreground", !connected && "max-sm:sr-only")}>
                {connected
                  ? balance?.unlimited
                    ? t.header.unlimited
                    : balance?.total != null
                      ? t.header.credits(n(balance.total))
                      : t.header.connected
                  : connectionStatus === "pending"
                    ? t.header.waiting
                    : t.header.notConnected}
              </span>
            </button>
            <LanguageSwitch />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl flex-1 content-start gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10 lg:py-10">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <StepRail steps={steps} active={active} onSelect={go} />
        </aside>

        <main className="min-w-0 pb-16">
          {vidiq.error && (
            <Alert variant="destructive" className="mb-6">
              <AlertTitle>{t.serverDown}</AlertTitle>
              <AlertDescription>{vidiq.error}</AlertDescription>
            </Alert>
          )}
          {job.error && jobId && (
            <Alert variant="destructive" className="mb-6">
              <AlertTitle>{t.runNotOpened}</AlertTitle>
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
              onDeleted={(id) => {
                if (id === null || id === jobId) setJobId(null);
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
            <div className="h-96 animate-pulse rounded-lg bg-muted" aria-label={t.loadingRun} />
          )}
        </main>
      </div>

      <footer className="border-t">
        <div className="mx-auto max-w-7xl px-4 py-4 text-xs text-muted-foreground sm:px-6">
          {t.builtBy}{" "}
          <a href="https://www.abdullahawais.com" target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
            Muhammad Abdullah Awais
          </a>
        </div>
      </footer>
    </div>
  );
}
