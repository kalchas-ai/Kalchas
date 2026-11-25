import { saveSettings, settingsView, type SavedSettings } from "@kalchas/core";
import { errorJson, json } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return json(settingsView());
  } catch (err) {
    return errorJson(err, 500);
  }
}

/** Saves the one model that does all the work (kept in data/settings.json); an empty one goes back to the built-in. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SavedSettings;
    const patch: SavedSettings = {};
    if (typeof body.defaultModel === "string") patch.defaultModel = body.defaultModel;
    saveSettings(patch);
    return json(settingsView());
  } catch (err) {
    return errorJson(err);
  }
}
