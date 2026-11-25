import { currentDecision, ensureSituation, playView, stepRunningHere } from "@kalchas/core";
import { errorJson, json, progressStore, type StepProgress } from "@/lib/server";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/** A timeline at its present moment, plus the progress of a step that is running in this process. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const store = progressStore();
    let view = playView(id);
    const live = store.get(id)?.running;
    // A step interrupted by a server restart (running, but not in this process) is recovered in the background: the
    // step is undone whole and the moment it was waiting on is waited on again. The client keeps polling while it runs.
    // One being written in this process is not interrupted, though nothing here follows it (the opening, started by
    // the sessions route): it is left to finish, and is not taken back from under itself.
    if (!live && !stepRunningHere(id) && view.branch.status !== "ended" && !view.branch.ended && (!view.situation || view.branch.status === "running")) {
      const p: StepProgress = { running: true, messages: [(await getT("app.api.branches.id.route"))("resuming")], scene: "", error: null, result: null, startedAt: Date.now() };
      store.set(id, p);
      ensureSituation(id)
        .then(() => Object.assign(p, { running: false }))
        .catch((err: unknown) => Object.assign(p, { running: false, error: err instanceof Error ? err.message : String(err) }));
      view = playView(id);
    }
    // The step's raw result holds events the protagonist can't see; the page only needs to know whether a
    // clarifying question came back, or the decision was a question that got answered instead (it is in the view's
    // asks), and reads everything else from the view above.
    const p = store.get(id);
    const result = p?.result ? ("clarification" in p.result ? { clarification: p.result.clarification } : "question" in p.result ? { asked: true } : { done: true }) : null;
    // (an engine-12 play keeps each stop's own text on its row, which no play of the engines before it does: only
    // whether it is there goes to the page, never the text, which holds what the protagonist does not know)
    const narrated = !!currentDecision(id)?.story;
    return json({ ...view, narrated, progress: p ? { running: p.running, messages: p.messages, scene: p.running ? p.scene : "", live: p.running ? (p.live ?? null) : null, error: p.error, result, startedAt: p.startedAt } : null });
  } catch (err) {
    return errorJson(err, 404);
  }
}
