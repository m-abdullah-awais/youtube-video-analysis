import { db, handle, requestLocale, store } from "@/lib/api";
import { anyRunnerActive } from "@/lib/jobs/registry";
import { clearAllRuns, createFromUpload, listRuns, UserError } from "@/lib/jobs/service";
import { DEFAULT_TEMPLATE, DEFAULT_TEMPLATE_ES } from "@/lib/template/template";

export async function GET(request: Request) {
  return handle(request, () => Response.json({ jobs: listRuns(db()) }));
}

export async function POST(request: Request) {
  return handle(request, async () => {
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new UserError("chooseFile");
    const template = requestLocale(request) === "es" ? DEFAULT_TEMPLATE_ES : DEFAULT_TEMPLATE;
    const { jobId } = createFromUpload(db(), store, file.name, new Uint8Array(await file.arrayBuffer()), { template });
    return Response.json({ jobId }, { status: 201 });
  });
}

/** Clears every run and its files. The vidIQ connection is kept. */
export async function DELETE(request: Request) {
  return handle(request, () => {
    if (anyRunnerActive()) throw new UserError("runActive", {}, 409);
    return Response.json({ deleted: clearAllRuns(db(), store) });
  });
}
