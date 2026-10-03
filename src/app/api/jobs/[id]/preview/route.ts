import { db, handle, type IdParams } from "@/lib/api";
import { startPreviewRun } from "@/lib/jobs/registry";
import { startPreview, summarize, UserError } from "@/lib/jobs/service";
import { connectionState } from "@/lib/vidiq/client";

/** Tries the current template on one video before the full run. */
export async function POST(request: Request, { params }: IdParams) {
  return handle(request, async () => {
    const { id } = await params;
    if (connectionState(db()).status !== "connected") throw new UserError("connectFirst", {}, 401);
    startPreview(db(), id);
    startPreviewRun(db(), id);
    return Response.json(summarize(db(), id));
  });
}
