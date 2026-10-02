"use client";

import { useRef, useState } from "react";
import { Check, Copy, ExternalLink, LogOut, RefreshCw, UserRoundCog } from "lucide-react";
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
import { api, errorMessage, type VidiqStatus } from "@/lib/client/api";
import { formatDate, formatNumber, plural } from "@/lib/client/format";
import { CREDIT_COST } from "@/lib/vidiq/costs";
import { PanelHeader } from "./panel-header";

type Props = {
  status: VidiqStatus | null;
  onChange: (status: VidiqStatus) => void;
  onContinue: () => void;
};

export function ConnectPanel({ status, onChange, onContinue }: Props) {
  const [busy, setBusy] = useState<"link" | "cancel" | "disconnect" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"switch" | "disconnect" | null>(null);

  const getLink = async () => {
    setBusy("link");
    setError(null);
    try {
      const { authorizationUrl } = await api.connect();
      onChange({ connection: { status: "pending", authorizationUrl }, balance: null });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  };

  const cancel = async () => {
    setBusy("cancel");
    try {
      await api.cancelConnect();
      onChange({ connection: { status: "disconnected" }, balance: null });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    setBusy("disconnect");
    try {
      await api.disconnect();
      onChange({ connection: { status: "disconnected" }, balance: null });
      toast.success("Disconnected from vidIQ");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  };

  const connection = status?.connection;

  return (
    <section aria-labelledby="connect-title" className="space-y-6">
      <PanelHeader
        id="connect-title"
        title="Connect your vidIQ account"
        description="vidIQ watches each video and writes its summary, using the credits on your vidIQ account. You sign in once and the app remembers the connection."
      />

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Could not reach vidIQ</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!connection && <div className="h-40 animate-pulse rounded-lg bg-muted" aria-label="Checking the vidIQ connection" />}

      {connection?.status === "disconnected" && (
        <div className="rounded-lg border bg-card p-6">
          <p className="max-w-prose text-sm text-muted-foreground">
            You will get a sign-in link. Open it in the browser where you are signed in to the vidIQ account you want
            to use, and approve access.
          </p>
          <dl className="mt-5 grid max-w-md grid-cols-2 gap-px overflow-hidden rounded-md border bg-border text-sm">
            <div className="bg-card px-4 py-3">
              <dt className="text-muted-foreground">Long video</dt>
              <dd className="font-semibold">{CREDIT_COST.long} credits each</dd>
            </div>
            <div className="bg-card px-4 py-3">
              <dt className="text-muted-foreground">YouTube Short</dt>
              <dd className="font-semibold">{CREDIT_COST.short} credits each</dd>
            </div>
          </dl>
          <Button className="mt-5" size="lg" onClick={getLink} disabled={busy === "link"}>
            {busy === "link" ? <RefreshCw className="animate-spin" aria-hidden /> : null}
            Get sign-in link
          </Button>
        </div>
      )}

      {connection?.status === "pending" && (
        <PendingLink
          url={connection.authorizationUrl}
          onNewLink={getLink}
          onCancel={cancel}
          busy={busy}
        />
      )}

      {connection?.status === "connected" && (
        <div className="rounded-lg border bg-card">
          <div className="flex flex-wrap items-start justify-between gap-6 p-6">
            <div>
              <p className="flex items-center gap-2 text-sm font-medium text-success">
                <Check className="size-4" aria-hidden />
                Connected to vidIQ
              </p>
              {status?.balance ? (
                <Credits balance={status.balance} />
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  {status?.balanceError ?? "Checking your credit balance."}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setConfirm("switch")}>
                <UserRoundCog aria-hidden />
                Switch account
              </Button>
              <Button variant="ghost" onClick={() => setConfirm("disconnect")}>
                <LogOut aria-hidden />
                Disconnect
              </Button>
            </div>
          </div>
          <div className="border-t px-6 py-4">
            <Button size="lg" onClick={onContinue}>
              Continue to upload
            </Button>
          </div>
        </div>
      )}

      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm === "switch" ? "Switch vidIQ account?" : "Disconnect vidIQ?"}</DialogTitle>
            <DialogDescription>
              {confirm === "switch"
                ? "This signs out the current account and gives you a new sign-in link. Sign in to the other account in your browser before opening it."
                : "Running summaries pause until you connect again. Finished summaries are kept."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline">Keep connected</Button>} />
            {confirm === "switch" ? (
              <Button onClick={getLink} disabled={busy === "link"}>
                Get new sign-in link
              </Button>
            ) : (
              <Button variant="destructive" onClick={disconnect} disabled={busy === "disconnect"}>
                Disconnect
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function PendingLink({
  url,
  onNewLink,
  onCancel,
  busy,
}: {
  url: string;
  onNewLink: () => void;
  onCancel: () => void;
  busy: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      field.current?.select();
      document.execCommand("copy");
    }
    setCopied(true);
    toast.success("Sign-in link copied");
    window.setTimeout(() => setCopied(false), 2_000);
  };

  return (
    <div className="rounded-lg border bg-card">
      <div className="space-y-4 p-6">
        <label htmlFor="vidiq-link" className="text-sm font-medium">
          Your sign-in link
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="vidiq-link"
            ref={field}
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="h-9 min-w-0 flex-1 rounded-md border bg-muted/60 px-3 font-mono text-xs text-muted-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary"
          />
          <div className="flex gap-2">
            <Button size="lg" onClick={copy} className="flex-1 sm:flex-none">
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copied ? "Copied" : "Copy link"}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="flex-1 sm:flex-none"
              render={<a href={url} target="_blank" rel="noopener noreferrer" />}
              nativeButton={false}
            >
              <ExternalLink aria-hidden />
              Open in browser
            </Button>
          </div>
        </div>

        <ol className="grid gap-3 pt-2 text-sm sm:grid-cols-3">
          {[
            "Paste the link into the browser where you are signed in to the right vidIQ account.",
            "Review the access request and approve it.",
            "Come back here. This page updates on its own.",
          ].map((text, i) => (
            <li key={text} className="flex gap-3 rounded-md bg-muted/60 p-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-background text-xs font-semibold ring-1 ring-border">
                {i + 1}
              </span>
              <span className="text-muted-foreground">{text}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-6 py-4">
        <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="relative flex size-2.5" aria-hidden>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-info opacity-60" />
            <span className="relative inline-flex size-2.5 rounded-full bg-info" />
          </span>
          Waiting for you to approve access in vidIQ
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onNewLink} disabled={busy === "link"}>
            Get a new link
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={busy === "cancel"}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

function Credits({ balance }: { balance: NonNullable<VidiqStatus["balance"]> }) {
  if (balance.unlimited) {
    return <p className="mt-3 text-3xl font-semibold tracking-tight">Unlimited credits</p>;
  }
  const total = balance.total ?? 0;
  return (
    <div className="mt-3">
      <p className="text-3xl font-semibold tracking-tight">
        {formatNumber(total)} <span className="text-base font-normal text-muted-foreground">credits</span>
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Enough for about {plural(Math.floor(total / CREDIT_COST.long), "long video")} or{" "}
        {plural(Math.floor(total / CREDIT_COST.short), "Short")}.
        {balance.resetsAt ? ` Renews ${formatDate(balance.resetsAt)}.` : ""}
      </p>
    </div>
  );
}
