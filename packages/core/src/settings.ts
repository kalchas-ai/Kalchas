import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { dbPath } from "./db/client.js";
import { EFFORTS, MODEL_CLASSES, config, defaultConfig, setConfig, type Effort, type ModelClass } from "./config.js";

/**
 * The settings a person can change in the product: the one model that does all the work, kept in a small JSON file
 * next to the database so that it survives restarts. Anything not set falls back to the built-in defaults. A file
 * saved before may hold more (a model per class of work, spending limits, a language for new projects); none of it is
 * read any more: one model does everything, nothing is capped, and each project is in the language it was written in.
 */

export type SavedSettings = {
  defaultModel?: string;
  providers?: Record<string, string[]>;
};

export const settingsPath = () => join(dirname(dbPath()), "settings.json");

function read(): SavedSettings {
  try {
    const file = settingsPath();
    if (!existsSync(file)) return {};
    const raw = JSON.parse(readFileSync(file, "utf8")) as SavedSettings;
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function apply(s: SavedSettings): void {
  const patch: Parameters<typeof setConfig>[0] = {};
  if (typeof s.defaultModel === "string" && s.defaultModel.trim()) patch.defaultModel = s.defaultModel.trim();
  // one run can use another model (the exams compare models side by side, each in its own process)
  if (process.env.KALCHAS_MODEL?.trim()) patch.defaultModel = process.env.KALCHAS_MODEL.trim();
  if (s.providers && typeof s.providers === "object")
    patch.providers = Object.fromEntries(Object.entries(s.providers).map(([m, v]) => [m, Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) : []]));
  // (for a test only: either class of work on a model of its own, so that the same play can be run with another
  // model for one class)
  const classes: Partial<Record<ModelClass, string>> = {};
  if (process.env.KALCHAS_MODEL_MAIN?.trim()) classes.main = process.env.KALCHAS_MODEL_MAIN.trim();
  if (process.env.KALCHAS_MODEL_LIGHT?.trim()) classes.light = process.env.KALCHAS_MODEL_LIGHT.trim();
  patch.classModels = classes;
  // how long each class thinks: the built-in, or (for a test) KALCHAS_EFFORT_MAIN / KALCHAS_EFFORT_LIGHT
  const efforts: Partial<Record<ModelClass, Effort>> = { ...defaultConfig.classEfforts };
  const effort = (v: unknown) => (typeof v === "string" && EFFORTS.includes(v.trim() as Effort) ? (v.trim() as Effort) : undefined);
  for (const c of MODEL_CLASSES) {
    const e = effort(process.env[`KALCHAS_EFFORT_${c.toUpperCase()}`]);
    if (e) efforts[c] = e;
  }
  patch.classEfforts = efforts;
  // a test may run one kind of call on another model: KALCHAS_MODEL_FOR="moment=vendor/model,direct_settle=vendor/model"
  patch.purposeModels = Object.fromEntries(
    (process.env.KALCHAS_MODEL_FOR ?? "").split(",").flatMap((x) => {
      const [k, v] = x.split("=").map((y) => y?.trim());
      return k && v ? [[k, v]] : [];
    }),
  );
  setConfig(patch);
}

/** Reads the saved settings into the running config (called once at start-up). */
export function loadSettings(): void {
  apply(read());
}

/** Merges a change into the saved settings and applies it at once. An empty model clears it back to the built-in one. */
export function saveSettings(patch: SavedSettings): SavedSettings {
  const cur = read();
  const next: SavedSettings = {};
  const model = patch.defaultModel !== undefined ? patch.defaultModel.trim() : cur.defaultModel?.trim();
  if (model) next.defaultModel = model;
  const providers = patch.providers ?? cur.providers;
  if (providers) next.providers = providers;
  const file = settingsPath();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  // back to the built-in defaults, then what is saved, so that a model cleared really goes
  setConfig({ defaultModel: defaultConfig.defaultModel, classModels: {}, classEfforts: { ...defaultConfig.classEfforts }, providers: {} });
  apply(next);
  return next;
}

export function savedSettings(): SavedSettings {
  return read();
}

export { config };
