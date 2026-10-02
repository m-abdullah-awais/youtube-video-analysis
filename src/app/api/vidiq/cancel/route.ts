import { db, handle } from "@/lib/api";
import { cancelAuthorization } from "@/lib/vidiq/client";

export async function POST() {
  return handle(() => {
    cancelAuthorization(db());
    return Response.json({ ok: true });
  });
}
