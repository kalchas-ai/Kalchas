import { forecastView } from "@kalchas/core";
import { errorJson, json, publicProgress } from "@/lib/server";

export const dynamic = "force-dynamic";

/** A project before its play: its questions and answers, the build, what was looked up, plus any task in progress. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    return json({ ...forecastView(id), progress: publicProgress(id) });
  } catch (err) {
    return errorJson(err, 404);
  }
}
