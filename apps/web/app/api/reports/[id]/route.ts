import { reportView } from "@kalchas/core";
import { errorJson, json } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    return json(reportView(id));
  } catch (err) {
    return errorJson(err, 404);
  }
}
