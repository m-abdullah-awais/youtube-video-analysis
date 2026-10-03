import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LOCALE_COOKIE, toLocale } from "@/lib/i18n/locale";
import { MESSAGES } from "@/lib/i18n/messages";

async function messages() {
  return MESSAGES[toLocale((await cookies()).get(LOCALE_COOKIE)?.value)];
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await messages();
  return { title: `${t.connectedPage.okTitle} | ${t.appName}` };
}

export default async function VidiqConnectedPage({ searchParams }: PageProps<"/vidiq/connected">) {
  const { error } = await searchParams;
  const message = typeof error === "string" ? error : null;
  const t = (await messages()).connectedPage;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border bg-card p-8 text-center shadow-sm">
        {message ? (
          <>
            <XCircle className="mx-auto size-10 text-destructive" aria-hidden />
            <h1 className="mt-4 text-xl font-semibold tracking-tight">{t.failTitle}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{message}</p>
            <p className="mt-2 text-sm text-muted-foreground">{t.failBody}</p>
          </>
        ) : (
          <>
            <CheckCircle2 className="mx-auto size-10 text-success" aria-hidden />
            <h1 className="mt-4 text-xl font-semibold tracking-tight">{t.okTitle}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t.okBody}</p>
          </>
        )}
        <Button className="mt-6" variant="outline" render={<Link href="/" />} nativeButton={false}>
          {t.open}
        </Button>
      </div>
    </main>
  );
}
