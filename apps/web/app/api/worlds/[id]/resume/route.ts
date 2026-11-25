import { resumeBuildInBackground, worldSummary } from "@kalchas/core";
import { errorJson, json } from "@/lib/server";
import { getT } from "@/lib/i18n/server";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const job = worldSummary(id).job;
    if (!job) throw new Error((await getT("app.api.worlds.id.resume.route"))("noBuildJob"));
    return json(resumeBuildInBackground(job.id));
  } catch (err) {
    return errorJson(err);
  }
}
