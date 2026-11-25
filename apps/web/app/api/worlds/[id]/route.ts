import { worldView } from "@kalchas/core";
import { errorJson, json } from "@/lib/server";

export const dynamic = "force-dynamic";

/** A world: its build (while it runs), what it contains, where to start, and the timelines played in it. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    return json(worldView(id));
  } catch (err) {
    return errorJson(err, 404);
  }
}
