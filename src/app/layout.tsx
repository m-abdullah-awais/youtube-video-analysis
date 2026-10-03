import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Schibsted_Grotesk } from "next/font/google";
import { cookies } from "next/headers";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LOCALE_COOKIE, toLocale } from "@/lib/i18n/locale";
import { MESSAGES } from "@/lib/i18n/messages";
import { I18nProvider } from "@/lib/i18n/provider";
import "./globals.css";

const sans = Schibsted_Grotesk({
  variable: "--font-schibsted",
  subsets: ["latin", "latin-ext"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

async function currentLocale() {
  return toLocale((await cookies()).get(LOCALE_COOKIE)?.value);
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await currentLocale();
  return {
    title: MESSAGES[locale].appName,
    description:
      locale === "es"
        ? "Completa la columna de descripción de tu hoja de videos de YouTube con resúmenes de vidIQ que siguen tu plantilla."
        : "Fill your YouTube spreadsheet's Description column with vidIQ summaries that follow your template.",
    applicationName: MESSAGES[locale].appName,
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#10151c" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await currentLocale();
  return (
    <html lang={locale} className={`${sans.variable} ${mono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
          <I18nProvider initialLocale={locale}>
            <TooltipProvider>{children}</TooltipProvider>
            <Toaster position="bottom-right" />
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
