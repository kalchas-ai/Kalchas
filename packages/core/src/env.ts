import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Repository root: packages/core/src → ../../.. */
export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

let loaded = false;

/** Loads `.env.local` from the repo root into process.env (existing values win). */
export function loadEnv(): void {
  if (loaded) return;
  loaded = true;
  const file = join(repoRoot, ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || m[1] === undefined) continue;
    const value = (m[2] ?? "").replace(/^["']|["']$/g, "");
    if (process.env[m[1]] === undefined || process.env[m[1]] === "") process.env[m[1]] = value;
  }
}

/** Reads `.env.local` again, for what was written into it after the program started (a key pasted in on the first try). */
function reloadEnv(): void {
  loaded = false;
  loadEnv();
}

export function requireEnv(name: string): string {
  loadEnv();
  if (!process.env[name]) reloadEnv();
  const v = process.env[name];
  if (!v) throw new Error(`The environment variable ${name} is missing: set it in .env.local at the root of the repository`);
  return v;
}

/** Whether the OpenRouter key is set: nothing can be asked, researched or played without it. Read again from
 * `.env.local` while it is not, so that pasting it in there is enough, with no restart. */
export function hasOpenRouterKey(): boolean {
  loadEnv();
  if (!process.env.OPENROUTER_API_KEY) reloadEnv();
  return !!process.env.OPENROUTER_API_KEY;
}
