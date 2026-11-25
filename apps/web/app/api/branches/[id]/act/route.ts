import { submitAction, type ActionInput } from "@kalchas/core";
import { errorJson, json, progressStore, type StepProgress } from "@/lib/server";
import { getT } from "@/lib/i18n/server";

/**
 * Submits a decision and runs the step in the background; the client polls the branch for progress, which carries
 * the scene of the moment as it is written, so that it can be read while it is.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { input } = (await req.json()) as { input: ActionInput };
    const store = progressStore();
    if (store.get(id)?.running) throw new Error((await getT("app.api.branches.id.act.route"))("stepRunning"));
    const p: StepProgress = { running: true, messages: [], scene: "", error: null, result: null, startedAt: Date.now() };
    store.set(id, p);
    // (the scene comes again whole each time it grows, under the same line: the line is kept once)
    const say = (m: string, scene?: string, shown?: StepProgress["shown"], live?: StepProgress["live"]) => {
      if (p.messages[p.messages.length - 1] !== m) p.messages.push(m);
      if (scene !== undefined) p.scene = scene;
      if (shown) p.shown = shown;
      if (live) p.live = live;
    };
    submitAction(id, input, say)
      .then((result) => Object.assign(p, { running: false, result }))
      .catch((err: unknown) => Object.assign(p, { running: false, error: err instanceof Error ? err.message : String(err) }));
    return json({ started: true });
  } catch (err) {
    return errorJson(err);
  }
}
