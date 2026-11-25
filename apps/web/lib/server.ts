import "server-only";
import type { Ask, StopLive, StepResult } from "@kalchas/core";
import type { T } from "@/lib/i18n/locales";

export type StepProgress = {
  running: boolean;
  messages: string[];
  /** The scene of the moment as written so far, while it is being written ("" when there is none). */
  scene: string;
  /** What the person now faces and the ways open, once that much of the moment is written (its record is still being set down: it can be read, and acted on when the step is done). */
  shown?: { day: string; headline: string; options: { title: string; detail: string }[] } | null;
  /** Engine 12: what each side did in the stretch and the rolls the protagonist can see, as much as is written so far. */
  live?: StopLive | null;
  error: string | null;
  result: StepResult | { clarification: string } | { question: Ask } | null;
  startedAt: number;
};

const g = globalThis as unknown as { __kalchasProgress?: Map<string, StepProgress> };

/** In-process progress of a running step, keyed by branch id (survives dev hot reloads). */
export function progressStore(): Map<string, StepProgress> {
  if (!g.__kalchasProgress) g.__kalchasProgress = new Map();
  return g.__kalchasProgress;
}

/**
 * Runs a long engine call in the background under `key` (a branch or a project), recording its progress messages,
 * so the page can poll for them. Only one task per key at a time. `t`: the texts of lib.server, from the route.
 */
export function startTask(key: string, fn: (say: (m: string) => void) => Promise<unknown>, t: T, first?: string): void {
  const store = progressStore();
  if (store.get(key)?.running) throw new Error(t("busy"));
  const p: StepProgress = { running: true, messages: first ? [first] : [], scene: "", error: null, result: null, startedAt: Date.now() };
  store.set(key, p);
  fn((m) => p.messages.push(m))
    .then(() => Object.assign(p, { running: false }))
    .catch((err: unknown) => Object.assign(p, { running: false, error: err instanceof Error ? err.message : String(err) }));
}

/** The progress of a background task as the browser may see it (no raw engine results). */
export function publicProgress(key: string) {
  const p = progressStore().get(key);
  return p ? { running: p.running, messages: p.messages, error: p.error, startedAt: p.startedAt } : null;
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

export function errorJson(err: unknown, status = 400): Response {
  return json({ error: err instanceof Error ? err.message : String(err) }, status);
}
