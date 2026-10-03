import { db, handle } from "@/lib/api";
import { cancelAuthorization } from "@/lib/vidiq/client";

export async function POST(request: Request) {
  return handle(request, () => {
    cancelAuthorization(db());
    return Response.json({ ok: true });
  });
}
