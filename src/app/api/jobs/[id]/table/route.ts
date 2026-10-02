import { db, handle, store, type IdParams } from "@/lib/api";
import { getTableInfo } from "@/lib/jobs/service";

export async function GET(request: Request, { params }: IdParams) {
  return handle(async () => {
    const { id } = await params;
    const sheet = new URL(request.url).searchParams.get("sheet") ?? undefined;
    return Response.json(getTableInfo(db(), store, id, sheet));
  });
}
