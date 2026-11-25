import { choosePace, forecastView, paceForecast } from "@kalchas/core";
import { errorJson, json } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * How closely a project's world is to be watched. GET gives what is asked about it (written once the questions were
 * answered; null when it could not be written) and what was chosen so far. POST keeps the choice: one of the ways
 * offered by its name, the person's own words, or null when they passed it over.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const ask = await paceForecast(id);
    return json({ ask, chosen: forecastView(id).setup?.pace?.name ?? null });
  } catch (err) {
    return errorJson(err, 404);
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { answer } = (await req.json()) as { answer?: string | null };
    choosePace(id, typeof answer === "string" ? answer.slice(0, 200) : null);
    return json({ ok: true });
  } catch (err) {
    return errorJson(err, 400);
  }
}
