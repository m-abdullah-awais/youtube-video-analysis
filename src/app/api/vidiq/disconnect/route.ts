import { db, handle } from "@/lib/api";
import { clearSession } from "@/lib/vidiq/client";

export async function POST() {
  return handle(() => {
    clearSession(db());
    return Response.json({ ok: true });
  });
}
