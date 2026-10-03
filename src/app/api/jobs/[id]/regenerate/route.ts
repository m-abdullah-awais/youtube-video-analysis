import { z } from "zod";
import { db, handle, readJson, type IdParams } from "@/lib/api";
import { startRunner } from "@/lib/jobs/registry";
import { regenerateRow, summarize, UserError } from "@/lib/jobs/service";
import { connectionState } from "@/lib/vidiq/client";

const RegenerateBody = z.object({ sheetRow: z.number().int().min(0) });

/** Asks vidIQ for a fresh summary of one row and keeps the run going. */
export async function POST(request: Request, { params }: IdParams) {
  return handle(request, async () => {
    const { id } = await params;
    const body = RegenerateBody.safeParse(await readJson(request));
    if (!body.success) throw new UserError("rowNotFound");
    if (connectionState(db()).status !== "connected") throw new UserError("connectFirst", {}, 401);
    regenerateRow(db(), id, body.data.sheetRow);
    await startRunner(db(), id);
    return Response.json(summarize(db(), id));
  });
}
