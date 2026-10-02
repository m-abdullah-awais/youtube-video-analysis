import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "vidIQ sign-in | Video Summaries" };

export default async function VidiqConnectedPage({ searchParams }: PageProps<"/vidiq/connected">) {
  const { error } = await searchParams;
  const message = typeof error === "string" ? error : null;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border bg-card p-8 text-center shadow-sm">
        {message ? (
          <>
            <XCircle className="mx-auto size-10 text-destructive" aria-hidden />
            <h1 className="mt-4 text-xl font-semibold tracking-tight">vidIQ is not connected</h1>
            <p className="mt-2 text-sm text-muted-foreground">{message}</p>
            <p className="mt-2 text-sm text-muted-foreground">Go back to the app and get a new sign-in link.</p>
          </>
        ) : (
          <>
            <CheckCircle2 className="mx-auto size-10 text-success" aria-hidden />
            <h1 className="mt-4 text-xl font-semibold tracking-tight">vidIQ connected</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              You can close this tab. The app updates on its own within a few seconds.
            </p>
          </>
        )}
        <Button className="mt-6" variant="outline" render={<Link href="/" />} nativeButton={false}>
          Open the app
        </Button>
      </div>
    </main>
  );
}
