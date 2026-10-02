import { z } from "zod";
import { db, handle, type IdParams } from "@/lib/api";
import { startRunner } from "@/lib/jobs/registry";
import { retryFailed } from "@/lib/jobs/repo";
import { summarize, UserError } from "@/lib/jobs/service";
import { connectionState } from "@/lib/vidiq/client";

const RetryBody = z.object({ sheetRow: z.number().int().min(0).optional() });

/** Re-queues failed rows (all, or one) and keeps the run going. */
export async function POST(request: Request, { params }: IdParams) {
  return handle(async () => {
    const { id } = await params;
    const body = RetryBody.safeParse(await request.json().catch(() => ({})));
    if (!body.success) throw new UserError("That row could not be found.");
    if (connectionState(db()).status !== "connected") throw new UserError("Connect your vidIQ account first.", 401);
    const count = retryFailed(db(), id, body.data.sheetRow);
    if (count === 0) throw new UserError("There are no failed videos to retry.");
    await startRunner(db(), id);
    return Response.json(summarize(db(), id));
  });
}
