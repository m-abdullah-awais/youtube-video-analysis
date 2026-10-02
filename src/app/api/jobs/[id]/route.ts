import { db, handle, type IdParams } from "@/lib/api";
import { resumeIfInterrupted } from "@/lib/jobs/registry";
import { summarize } from "@/lib/jobs/service";

export async function GET(_request: Request, { params }: IdParams) {
  return handle(async () => {
    const { id } = await params;
    const summary = summarize(db(), id);
    resumeIfInterrupted(db(), id);
    return Response.json(summary);
  });
}
