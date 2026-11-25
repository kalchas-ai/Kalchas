import { rerunForecast } from "@kalchas/core";
import { errorJson, json } from "@/lib/server";

/** Researches the same question with the same answers again, as a new project; the original stays as it was. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    return json(rerunForecast(id));
  } catch (err) {
    return errorJson(err);
  }
}
