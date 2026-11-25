import { compareBranches } from "@kalchas/core";
import { errorJson, json } from "@/lib/server";
import { getT } from "@/lib/i18n/server";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { other } = await req.json();
    if (typeof other !== "string" || !other) return json({ error: (await getT("app.api.branches.id.compare.route"))("pickOther") }, 400);
    return json(await compareBranches(id, other));
  } catch (err) {
    return errorJson(err);
  }
}
