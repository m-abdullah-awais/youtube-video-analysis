import { callbackUrl, db, handle } from "@/lib/api";
import { startAuthorization } from "@/lib/vidiq/client";

/** Creates a fresh vidIQ sign-in link (also used to switch accounts). */
export async function POST(request: Request) {
  return handle(async () => {
    const authorizationUrl = await startAuthorization(db(), callbackUrl(request));
    return Response.json({ authorizationUrl });
  });
}
