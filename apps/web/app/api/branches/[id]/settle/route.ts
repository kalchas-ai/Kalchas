import { generateReport } from "@kalchas/core";
import { errorJson, json } from "@/lib/server";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const r = await generateReport(id, "manual");
    return json({ reportId: r.id });
  } catch (err) {
    return errorJson(err);
  }
}
