import { startSession } from "@kalchas/core";
import { errorJson, json } from "@/lib/server";

export async function POST(req: Request) {
  try {
    const { worldId, start } = (await req.json()) as { worldId: string; start?: number };
    const r = await startSession(worldId, start ?? 1);
    return json({ sessionId: r.sessionId, branchId: r.branchId });
  } catch (err) {
    return errorJson(err);
  }
}
