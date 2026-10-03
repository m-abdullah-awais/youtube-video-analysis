import { db, handle } from "@/lib/api";
import { clearSession } from "@/lib/vidiq/client";

export async function POST(request: Request) {
  return handle(request, () => {
    clearSession(db());
    return Response.json({ ok: true });
  });
}
