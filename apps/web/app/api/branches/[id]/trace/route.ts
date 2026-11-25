import { errorJson, json } from "@/lib/server";
import { getT } from "@/lib/i18n/server";
import { traceOfStep, traceSince } from "@/lib/step-trace";
import { publicStepTrace } from "@kalchas/core";

export const dynamic = "force-dynamic";

/**
 * What the engine did in a step of this timeline, from its own records (read-only).
 * `?step=N`: a step already taken. `?since=<ms>&step=N`: the step taken at that moment, as far as it has got — the
 * page polls this while the step runs, and once more when it is done.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const u = new URL(req.url);
    const step = Number(u.searchParams.get("step") ?? "0");
    const since = u.searchParams.get("since");
    // What each party thought and what was left to odds are told on the page (so that a play can be learned from):
    // the record is given whole, and only whether the step has really been taken is read from what is committed.
    const whole = <T extends Parameters<typeof publicStepTrace>[1]>(t: T) => ({ ...t, complete: publicStepTrace(id, t).complete });
    const words = await getT("lib.step-trace");
    if (since) return json(whole(await traceSince(id, Number(since), step, words)));
    const t = await traceOfStep(id, step, words);
    return t ? json(whole(t)) : errorJson(new Error((await getT("app.api.branches.id.trace.route"))("noRecord")), 404);
  } catch (err) {
    return errorJson(err, 500);
  }
}
