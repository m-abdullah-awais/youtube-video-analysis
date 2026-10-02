import { getDb } from "./db";
import { diskStore, UserError } from "./jobs/service";
import { VidiqError } from "./vidiq/errors";

export const store = diskStore();
export const db = () => getDb();

export type IdParams = { params: Promise<{ id: string }> };

/** Runs a route body and turns known errors into JSON the UI can show. */
export async function handle(fn: () => Promise<Response> | Response): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof UserError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof VidiqError) {
      return Response.json({ error: error.message, kind: error.kind }, { status: error.kind === "auth" ? 401 : 502 });
    }
    console.error(error);
    return Response.json({ error: "Something went wrong on our side. Try again." }, { status: 500 });
  }
}

export function callbackUrl(request: Request): string {
  return new URL("/api/vidiq/callback", request.url).toString();
}
