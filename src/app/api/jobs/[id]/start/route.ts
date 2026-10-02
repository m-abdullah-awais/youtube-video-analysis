import { db, handle, type IdParams } from "@/lib/api";
import { startRunner } from "@/lib/jobs/registry";
import { summarize, UserError } from "@/lib/jobs/service";
import { connectionState } from "@/lib/vidiq/client";

/** Starts a run, or resumes a paused one. */
export async function POST(_request: Request, { params }: IdParams) {
  return handle(async () => {
    const { id } = await params;
    if (connectionState(db()).status !== "connected") throw new UserError("Connect your vidIQ account first.", 401);
    const { job, counts } = summarize(db(), id);
    if (job.videoCol === null) throw new UserError("Choose the column that holds the video links.");
    if (counts.pending + counts.running === 0) throw new UserError("There are no videos waiting for a summary.");
    await startRunner(db(), id);
    return Response.json(summarize(db(), id));
  });
}
