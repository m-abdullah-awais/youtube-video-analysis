import { db, handle, type RowParams } from "@/lib/api";
import { startRunner } from "@/lib/jobs/registry";
import { regenerateRow, summarize, UserError } from "@/lib/jobs/service";
import { connectionState } from "@/lib/vidiq/client";

/** Asks vidIQ for a fresh summary of one row and keeps the run going. */
export async function POST(request: Request, { params }: RowParams) {
  return handle(request, async () => {
    const { id, row } = await params;
    if (!Number.isInteger(Number(row))) throw new UserError("rowNotFound");
    if (connectionState(db()).status !== "connected") throw new UserError("connectFirst", {}, 401);
    regenerateRow(db(), id, Number(row));
    await startRunner(db(), id);
    return Response.json(summarize(db(), id));
  });
}
