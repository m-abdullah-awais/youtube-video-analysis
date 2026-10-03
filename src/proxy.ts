import { NextResponse, type NextRequest } from "next/server";
import { errorText } from "@/lib/i18n/errors";
import { localeFromCookieHeader } from "@/lib/i18n/locale";
import { rejectReason } from "@/lib/security";

export function proxy(request: NextRequest) {
  const reason = rejectReason({
    method: request.method,
    host: request.headers.get("host"),
    origin: request.headers.get("origin"),
    secFetchSite: request.headers.get("sec-fetch-site"),
  });
  if (!reason) return NextResponse.next();
  const locale = localeFromCookieHeader(request.headers.get("cookie"));
  return NextResponse.json({ error: errorText(locale, "blocked"), detail: reason }, { status: 403 });
}

export const config = {
  matcher: "/api/:path*",
};
