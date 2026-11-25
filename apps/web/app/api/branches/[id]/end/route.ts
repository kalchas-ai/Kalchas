import { endPlay } from "@kalchas/core";
import { errorJson, json } from "@/lib/server";

/** Ends the play by your choice: the review is written, and the timeline stops here. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    return json(await endPlay(id));
  } catch (err) {
    return errorJson(err);
  }
}
