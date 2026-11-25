import { stageSeconds } from "@kalchas/core";
import { errorJson, json } from "@/lib/server";

export const dynamic = "force-dynamic";

/** How long each stage of the making usually takes here, in seconds (measured from the runs this installation has done). */
export async function GET() {
  try {
    return json(stageSeconds());
  } catch (err) {
    return errorJson(err, 500);
  }
}
