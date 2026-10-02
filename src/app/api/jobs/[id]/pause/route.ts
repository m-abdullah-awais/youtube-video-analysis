import { db, handle, type IdParams } from "@/lib/api";
import { pauseRunner } from "@/lib/jobs/registry";
import { summarize } from "@/lib/jobs/service";

export async function POST(_request: Request, { params }: IdParams) {
  return handle(async () => {
    const { id } = await params;
    pauseRunner(db(), id);
    return Response.json(summarize(db(), id));
  });
}
