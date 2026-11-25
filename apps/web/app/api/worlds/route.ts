import { listWorlds } from "@kalchas/core";
import { json } from "@/lib/server";

export const dynamic = "force-dynamic";

/** The worlds built so far. New things start as projects (POST /api/projects), not as worlds. */
export async function GET() {
  return json(listWorlds());
}
