import { resumeForecast } from "@kalchas/core";
import { errorJson, json } from "@/lib/server";

/** Picks a stopped research up where it stopped. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    return json(resumeForecast(id));
  } catch (err) {
    return errorJson(err);
  }
}
