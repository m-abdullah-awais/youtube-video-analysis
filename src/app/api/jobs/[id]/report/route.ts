import { db, handle, type IdParams } from "@/lib/api";
import { report } from "@/lib/jobs/service";

/** Finished videos with both summaries and transcripts, for the PDF. `?rows=2,5` limits it to those rows. */
export async function GET(request: Request, { params }: IdParams) {
  return handle(request, async () => {
    const { id } = await params;
    const rows = new URL(request.url).searchParams.get("rows");
    const sheetRows = rows ? rows.split(",").map(Number).filter(Number.isInteger) : undefined;
    return Response.json(report(db(), id, sheetRows));
  });
}
