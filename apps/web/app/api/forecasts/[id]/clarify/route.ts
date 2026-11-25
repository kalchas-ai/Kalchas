import { clarifyForecast } from "@kalchas/core";
import { errorJson, json } from "@/lib/server";

/** Asks the questions again: after a failure, or with your correction to how the AI understood you. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { correction } = (await req.json().catch(() => ({}))) as { correction?: string };
    await clarifyForecast(id, typeof correction === "string" ? correction.slice(0, 600) : undefined);
    return json({ ok: true });
  } catch (err) {
    return errorJson(err);
  }
}
