import { getDb } from "./db";
import { errorText } from "./i18n/errors";
import { localeFromCookieHeader, type Locale } from "./i18n/locale";
import { diskStore } from "./jobs/service";
import { UserError } from "./user-error";
import { VidiqError } from "./vidiq/errors";

export const store = diskStore();
export const db = () => getDb();

export type IdParams = { params: Promise<{ id: string }> };
export type RowParams = { params: Promise<{ id: string; row: string }> };

export function requestLocale(request: Request): Locale {
  return localeFromCookieHeader(request.headers.get("cookie"));
}

/** Runs a route body and turns known errors into JSON, in the user's language. */
export async function handle(request: Request, fn: () => Promise<Response> | Response): Promise<Response> {
  const locale = requestLocale(request);
  try {
    return await fn();
  } catch (error) {
    if (error instanceof UserError) {
      return Response.json({ error: errorText(locale, error.key, error.params) }, { status: error.status });
    }
    if (error instanceof VidiqError) {
      const message = error.key ? errorText(locale, error.key) : error.message;
      return Response.json({ error: message, kind: error.kind }, { status: error.kind === "auth" ? 401 : 502 });
    }
    console.error(error);
    return Response.json({ error: errorText(locale, "serverError") }, { status: 500 });
  }
}

export function callbackUrl(request: Request): string {
  return new URL("/api/vidiq/callback", request.url).toString();
}

/** Reads a JSON body, or an empty object when there is none. */
export async function readJson(request: Request): Promise<unknown> {
  return request.json().catch(() => ({}));
}
