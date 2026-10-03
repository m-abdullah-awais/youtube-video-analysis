import { z } from "zod";
import { db, handle, readJson, store, type IdParams } from "@/lib/api";
import { configure, summarize, UserError } from "@/lib/jobs/service";

const ConfigBody = z.object({
  sheetName: z.string().optional(),
  videoCol: z.number().int().min(0),
  descriptionCol: z.union([z.number().int().min(0), z.literal("new")]),
  template: z.string(),
  summaryLanguage: z.enum(["auto", "en", "es"]).optional(),
  overwrite: z.boolean(),
});

export async function PUT(request: Request, { params }: IdParams) {
  return handle(request, async () => {
    const { id } = await params;
    const parsed = ConfigBody.safeParse(await readJson(request));
    if (!parsed.success) throw new UserError("settingsMissing");
    configure(db(), store, id, parsed.data);
    return Response.json(summarize(db(), id));
  });
}
