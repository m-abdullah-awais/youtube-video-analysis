import { z } from "zod";
import { db, handle, readJson, type IdParams } from "@/lib/api";
import { startRunner } from "@/lib/jobs/registry";
import { includeRows, summarize, UserError } from "@/lib/jobs/service";
import { connectionState } from "@/lib/vidiq/client";

const Body = z.object({ sheetRows: z.array(z.number().int().min(0)).min(1).max(5_000) });

/** Adds videos that were left out of the run and keeps it going. */
export async function POST(request: Request, { params }: IdParams) {
  return handle(request, async () => {
    const { id } = await params;
    const body = Body.safeParse(await readJson(request));
    if (!body.success) throw new UserError("nothingToInclude");
    if (connectionState(db()).status !== "connected") throw new UserError("connectFirst", {}, 401);
    includeRows(db(), id, body.data.sheetRows);
    await startRunner(db(), id);
    return Response.json(summarize(db(), id));
  });
}
