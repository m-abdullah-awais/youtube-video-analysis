import { z } from "zod";
import { db, handle, store, type IdParams } from "@/lib/api";
import { configure, summarize, UserError } from "@/lib/jobs/service";

const ConfigBody = z.object({
  sheetName: z.string().optional(),
  videoCol: z.number().int().min(0),
  descriptionCol: z.union([z.number().int().min(0), z.literal("new")]),
  template: z.string(),
  overwrite: z.boolean(),
});

export async function PUT(request: Request, { params }: IdParams) {
  return handle(async () => {
    const { id } = await params;
    const parsed = ConfigBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new UserError("Some settings are missing. Check the columns and template.");
    configure(db(), store, id, parsed.data);
    return Response.json(summarize(db(), id));
  });
}
