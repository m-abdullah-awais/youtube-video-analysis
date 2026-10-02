import { callbackUrl, db } from "@/lib/api";
import { finishAuthorization } from "@/lib/vidiq/client";

/** vidIQ sends the browser here after sign-in; we finish the exchange and show a result page. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = new URL("/vidiq/connected", request.url);
  const code = url.searchParams.get("code");
  const denied = url.searchParams.get("error_description") ?? url.searchParams.get("error");

  if (!code) {
    result.searchParams.set("error", denied ? `vidIQ said: ${denied}` : "vidIQ did not send a sign-in code.");
    return Response.redirect(result, 303);
  }
  try {
    await finishAuthorization(db(), callbackUrl(request), code, url.searchParams.get("state"));
  } catch (error) {
    result.searchParams.set("error", error instanceof Error ? error.message : "The sign-in could not be completed.");
  }
  return Response.redirect(result, 303);
}
