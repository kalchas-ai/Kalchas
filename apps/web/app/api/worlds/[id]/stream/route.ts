import { readStream } from "@/lib/stream";
import { errorJson, json } from "@/lib/server";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/**
 * A world as one stream of plain acts, as far as it has been made (see lib/stream.ts): the page that shows a world
 * being built reads it over and over while it is, and once more when it is done. Read-only.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    return json(await readStream(id, await getT("lib.stream")));
  } catch (err) {
    return errorJson(err, 404);
  }
}
