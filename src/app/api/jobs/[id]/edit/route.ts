import { z } from "zod";
import { db, handle, readJson, type IdParams } from "@/lib/api";
import { editRow, summarize, UserError } from "@/lib/jobs/service";

const EditBody = z.object({ sheetRow: z.number().int().min(0), summary: z.string().max(32_767) });

/** Saves a hand-edited summary for one row. */
export async function PUT(request: Request, { params }: IdParams) {
  return handle(request, async () => {
    const { id } = await params;
    const body = EditBody.safeParse(await readJson(request));
    if (!body.success) throw new UserError("rowNotFound");
    editRow(db(), id, body.data.sheetRow, body.data.summary);
    return Response.json(summarize(db(), id));
  });
}
