import { db, handle, store, type IdParams } from "@/lib/api";
import { downloadResult } from "@/lib/jobs/service";

export async function GET(request: Request, { params }: IdParams) {
  return handle(request, async () => {
    const { id } = await params;
    const file = downloadResult(db(), store, id);
    return new Response(Buffer.from(file.data), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        "Cache-Control": "no-store",
      },
    });
  });
}
