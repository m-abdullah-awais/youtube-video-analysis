import { db, handle, type IdParams } from "@/lib/api";
import { isPreviewActive, startRunner } from "@/lib/jobs/registry";
import { consumePreview, getPreview, summarize, UserError } from "@/lib/jobs/service";
import { connectionState } from "@/lib/vidiq/client";

/** Starts a run, or resumes a paused one. */
export async function POST(request: Request, { params }: IdParams) {
  return handle(request, async () => {
    const { id } = await params;
    if (connectionState(db()).status !== "connected") throw new UserError("connectFirst", {}, 401);
    if (isPreviewActive(id) || getPreview(db(), id)?.status === "running") throw new UserError("previewBusy", {}, 409);
    const { job } = summarize(db(), id);
    if (job.videoCol === null) throw new UserError("chooseVideoColumn");
    const usedTrial = consumePreview(db(), id);
    const { counts } = summarize(db(), id);
    if (!usedTrial && counts.pending + counts.running === 0) throw new UserError("nothingToRun");
    await startRunner(db(), id);
    return Response.json(summarize(db(), id));
  });
}
