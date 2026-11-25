import { forkBranch } from "@kalchas/core";
import { errorJson, json } from "@/lib/server";
import { getT } from "@/lib/i18n/server";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { step, mode } = await req.json();
    if (!Number.isInteger(step) || step < 1) return json({ error: (await getT("app.api.branches.id.fork.route"))("pickStep") }, 400);
    const r = await forkBranch(id, step, mode);
    return json({ branchId: r.branchId });
  } catch (err) {
    return errorJson(err);
  }
}
