import { createProject, hasOpenRouterKey, monthSpend, projectList, type MomentHint } from "@kalchas/core";
import { errorJson, json } from "@/lib/server";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/** Everything you have made, and this month's spend. */
export async function GET() {
  try {
    return json({ projects: projectList(), monthUsd: monthSpend() });
  } catch (err) {
    return errorJson(err, 500);
  }
}

/**
 * Starts a project from what you wrote and answers at once with its id: understanding it (reading the moment it
 * stands at, unless `moment` says) and writing its questions go on in the background, shown on the project's page.
 */
export async function POST(req: Request) {
  try {
    const { text, moment } = (await req.json().catch(() => ({}))) as { text?: string; moment?: MomentHint };
    const t = await getT("app.api.projects.route");
    if (!text?.trim()) throw new Error(t("writeMatter"));
    // (without the key nothing can be asked or looked up: say how to set it, and make nothing yet)
    if (!hasOpenRouterKey()) throw new Error(t("noKey"));
    return json(await createProject(text.trim(), { hint: moment === "past" || moment === "today" ? moment : undefined }));
  } catch (err) {
    return errorJson(err);
  }
}
