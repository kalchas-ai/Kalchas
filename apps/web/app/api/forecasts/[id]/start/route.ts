import { startForecast } from "@kalchas/core";
import { errorJson, json } from "@/lib/server";

/** Saves the answers to the questions (all asked at once) and starts building the world in the background. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { answers } = (await req.json().catch(() => ({}))) as { answers?: { q: string; answer: string | null }[] };
    await startForecast(id, answers ?? []);
    return json({ ok: true });
  } catch (err) {
    return errorJson(err);
  }
}
