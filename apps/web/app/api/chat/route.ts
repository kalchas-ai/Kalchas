import { adviseBranch, type ChatEvent } from "@kalchas/core";
import { errorJson, progressStore } from "@/lib/server";
import { getT } from "@/lib/i18n/server";

/**
 * The adviser of the play (`scope: "play"`, a branch id). What it looks up and the answer as it is written come back
 * as they happen, one JSON event per line; the answer is kept by the place once it is done, even if the page was closed meanwhile.
 */

type Body = { scope?: "play"; id?: string; text?: string };

const g = globalThis as unknown as { __kalchasAsking?: Set<string> };
const asking = () => (g.__kalchasAsking ??= new Set());

export async function POST(req: Request) {
  let key = "";
  try {
    const t = await getT("app.api.chat.route");
    const body = (await req.json()) as Body;
    const id = body.id?.trim();
    const text = body.text?.trim().slice(0, 2000);
    if (!id || body.scope !== "play") throw new Error(t("whereAsked"));
    if (!text) throw new Error(t("writeQuestion"));
    if (asking().has(`${body.scope}:${id}`)) throw new Error(t("stillAnswering"));
    if (progressStore().get(id)?.running) throw new Error(t("stepRunning"));
    key = `${body.scope}:${id}`;
    asking().add(key);

    const enc = new TextEncoder();
    let out: ReadableStreamDefaultController<Uint8Array> | null = null;
    const send = (e: ChatEvent) => {
      try {
        out?.enqueue(enc.encode(`${JSON.stringify(e)}\n`));
        if (e.type === "done" || e.type === "error") out?.close();
      } catch {
        out = null; // the page went away; the answer is still kept
      }
    };
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        out = c;
      },
      cancel() {
        out = null;
      },
    });
    const work = adviseBranch(id, text, send);
    const k = key;
    void work
      .catch((err: unknown) => send({ type: "error", message: err instanceof Error ? err.message : String(err) }))
      .finally(() => asking().delete(k));
    return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-cache, no-transform" } });
  } catch (err) {
    if (key) asking().delete(key);
    return errorJson(err);
  }
}
