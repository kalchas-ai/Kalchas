import { readTape } from "@/lib/tape";
import { errorJson, json } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * What a project has waited on so far, for the pages that show the wait as it happens: the understanding, and its
 * world being built (what is looked up and found, and what is made of it). Read-only.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    return json(await readTape(id));
  } catch (err) {
    return errorJson(err, 404);
  }
}
