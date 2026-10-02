import { db, handle, store } from "@/lib/api";
import { listJobs } from "@/lib/jobs/repo";
import { createFromUpload, summarize, UserError } from "@/lib/jobs/service";

export async function GET() {
  return handle(() => {
    const jobs = listJobs(db()).map((job) => {
      const { counts } = summarize(db(), job.id);
      return { ...job, counts };
    });
    return Response.json({ jobs });
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new UserError("Choose a CSV or Excel file to upload.");
    const { jobId } = createFromUpload(db(), store, file.name, new Uint8Array(await file.arrayBuffer()));
    return Response.json({ jobId }, { status: 201 });
  });
}
