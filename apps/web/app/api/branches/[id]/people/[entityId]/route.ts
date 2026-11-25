import { personView } from "@kalchas/core";
import { errorJson, json } from "@/lib/server";

export const dynamic = "force-dynamic";

/** One person as the protagonist can see them at this point of the timeline. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; entityId: string }> }) {
  try {
    const { id, entityId } = await ctx.params;
    return json(personView(id, entityId));
  } catch (err) {
    return errorJson(err, 404);
  }
}
