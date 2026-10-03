import { z } from "zod";
import { db, handle, readJson, type RowParams } from "@/lib/api";
import { editRow, summarize, UserError } from "@/lib/jobs/service";

const EditBody = z.object({ summary: z.string().max(32_767) });

/** Saves a hand-edited summary for one row. */
export async function PUT(request: Request, { params }: RowParams) {
  return handle(request, async () => {
    const { id, row } = await params;
    const body = EditBody.safeParse(await readJson(request));
    if (!body.success || !Number.isInteger(Number(row))) throw new UserError("rowNotFound");
    editRow(db(), id, Number(row), body.data.summary);
    return Response.json(summarize(db(), id));
  });
}
