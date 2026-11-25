import { join } from "node:path";
import { errorJson, json } from "@/lib/server";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/**
 * Every call a project or world made (model calls, searches, research), in the order they started: which step, which
 * provider, when it started, how long it took, what it used, how it ended, and why it failed. One request's attempts and
 * parallel sends share a `run`. What came back and the model's thinking are long: `?call=<id>` gives one call whole,
 * `?full=1` gives them for every call. Read-only.
 */
export async function GET(req: Request, ctx: { params: Promise<{ world: string }> }) {
  try {
    const { world } = await ctx.params;
    const url = new URL(req.url);
    const one = url.searchParams.get("call");
    const full = url.searchParams.get("full") === "1";
    const { DatabaseSync } = await import("node:sqlite");
    const file = process.env.KALCHAS_DB ?? join(process.cwd(), "..", "..", "data", "kalchas.db");
    const q = new DatabaseSync(file, { readOnly: true });
    try {
      if (one) {
        const row = q.prepare("select * from llm_calls where id = ? and world_id = ?").get(one, world);
        return row ? json(row) : errorJson(new Error((await getT("app.api.calls.world.route"))("noSuchCall")), 404);
      }
      const cols = `id, run, attempt, lane, job_id, branch_id, role, purpose, model, provider, started_at, created_at as ended_at, ms,
        input_tokens, output_tokens, reasoning_tokens, cost_usd, searches, ok, finish_reason, error, length(output) as output_chars${full ? ", output, thinking" : ""}`;
      const calls = q.prepare(`select ${cols} from llm_calls where world_id = ? order by coalesce(started_at, created_at), id`).all(world);
      return json({ world, calls });
    } finally {
      q.close();
    }
  } catch (err) {
    return errorJson(err, 404);
  }
}
