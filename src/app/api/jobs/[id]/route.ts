import { z } from "zod";
import { db, handle, readJson, store, type IdParams } from "@/lib/api";
import { isRunnerActive, resumeIfInterrupted } from "@/lib/jobs/registry";
import { deleteRun, renameRun, summarize, UserError } from "@/lib/jobs/service";

/** `?since=<serverTime>` returns only rows changed since the previous response. */
export async function GET(request: Request, { params }: IdParams) {
  return handle(request, async () => {
    const { id } = await params;
    const since = Number(new URL(request.url).searchParams.get("since"));
    const summary = summarize(db(), id, Number.isFinite(since) && since > 0 ? { since } : {});
    resumeIfInterrupted(db(), id);
    return Response.json(summary);
  });
}

const RenameBody = z.object({ name: z.string() });

export async function PATCH(request: Request, { params }: IdParams) {
  return handle(request, async () => {
    const { id } = await params;
    const body = RenameBody.safeParse(await readJson(request));
    if (!body.success) throw new UserError("nameEmpty");
    renameRun(db(), id, body.data.name);
    return Response.json(summarize(db(), id));
  });
}

export async function DELETE(request: Request, { params }: IdParams) {
  return handle(request, async () => {
    const { id } = await params;
    if (isRunnerActive(id)) throw new UserError("runActive", {}, 409);
    deleteRun(db(), store, id);
    return Response.json({ ok: true });
  });
}
