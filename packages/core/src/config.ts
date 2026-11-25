export type Role =
  | "builder" // world construction: scoping, compiling, profiling
  | "researcher" // web research calls
  | "adjudicator" // impact assessment and outcome resolution
  | "actor" // non-protagonist characters
  | "director" // situations, recommendations, command parsing
  | "reporter" // checkpoint and post-mortem reports
  | "forecaster" // prediction: clarifying questions, research plans, intel and the strategy board
  | "planner" // what to search for: the queries, and what is still missing after each round
  | "advisor"; // the conversation on the research and play pages: looks things up, then answers

export type KalchasConfig = {
  defaultModel: string;
  /**
   * For a test only (KALCHAS_MODEL_MAIN / KALCHAS_MODEL_LIGHT, never the settings): a model for one of the two classes
   * of work (see `classOf`). None by default: one model, `defaultModel`, does all the work.
   */
  classModels: Partial<Record<ModelClass, string>>;
  /** For a test only (KALCHAS_MODEL_FOR, never the settings): a model for one kind of call, ahead of its class's. */
  purposeModels: Record<string, string>;
  /** How long each class thinks (see `Effort`); a class not set thinks as long as its model wants. The built-in ones stand until the settings (or a test) name another. */
  classEfforts: Partial<Record<ModelClass, Effort>>;
  /** Per model, the endpoints to try first (OpenRouter tags such as "google-ai-studio/flex", the half-price tier), in order. */
  providers: Record<string, string[]>;
  search: { engine: "auto" | "exa" | "parallel" | "native" | "perplexity"; maxResults: number };
  fetch: { engine: "auto" | "exa" | "openrouter" | "parallel" | "native" };
  build: {
    maxSearchesPerTask: number;
    maxFetchesPerTask: number;
  };
  /**
   * How the play is run. There is no limit on how many are played or asked in a step: who is played is said by the
   * judge (whom a move reaches), by the director (who acts of their own accord) and by the characters (whom they ask
   * for an answer), and the one rule that ends a back-and-forth is time: a character is played at most once on any
   * day, and another exchange is the next day's. What is here only bounds what is spent.
   */
  sim: {
    /** About how long one step of a play takes a person, the reading included: only for telling them how long a pace would take. */
    minutesPerStep: number;
  };
  /**
   * Engine 12, one model writing the play straight on (see narrate/). Guards, not rules of the play: `rounds` is how
   * many rounds of looking up and rolling one stop may take before it is made to write what it has (kept as a fault
   * to look into), `buildRounds` the same for building a world. A play's whole history is read at every stop; once it
   * comes near the model's context window (`foldRatio` of it), all but the last `keep` stops are folded, with what came
   * before them, into the story so far (one call of the light model). `windows`: a model's context window in tokens,
   * by its id; `defaultWindow` for a model not listed.
   */
  narrate: { rounds: number; buildRounds: number; foldRatio: number; keep: number; windows: Record<string, number>; defaultWindow: number };
};

/**
 * The models the settings page offers by name (any other can be written in), each with about what one step of a play
 * costs on it: one decision and what comes of it, up to the next. By the step, because a play's length varies too much
 * to put a price on a play. Measured on Opus on 2026-11-26 (a step read about 160K tokens, nine tenths of them from the
 * cache, and wrote about 8.5K: $0.23 to $0.26) and carried over to the others by their prices per token on OpenRouter.
 * A guide only: later steps read more of the play and cost a little more, a model that thinks at more length writes
 * more, and building the world costs about as much as two or three steps.
 */
export const MODEL_CHOICES: { id: string; name: string; maker: string; usdPerStep: number }[] = [
  { id: "anthropic/claude-opus-5.5", name: "Claude Opus 5.5", maker: "Anthropic", usdPerStep: 0.25 },
  { id: "anthropic/claude-sonnet-5.5", name: "Claude Sonnet 5.5", maker: "Anthropic", usdPerStep: 0.13 },
  { id: "anthropic/claude-haiku-5.5", name: "Claude Haiku 5.5", maker: "Anthropic", usdPerStep: 0.007 },
  { id: "openai/gpt-6.2-astra", name: "GPT-6.2 Astra", maker: "OpenAI", usdPerStep: 0.5 },
  { id: "openai/gpt-6.2-sol", name: "GPT-6.2 Sol", maker: "OpenAI", usdPerStep: 0.13 },
  { id: "openai/gpt-6-luna", name: "GPT-6 Luna", maker: "OpenAI", usdPerStep: 0.007 },
];

export const defaultConfig: KalchasConfig = {
  defaultModel: "anthropic/claude-opus-5.5",
  classModels: {},
  purposeModels: {},
  classEfforts: { main: "high" },
  providers: {},
  search: { engine: "auto", maxResults: 6 },
  fetch: { engine: "auto" },
  build: { maxSearchesPerTask: 4, maxFetchesPerTask: 3 },
  sim: {
    minutesPerStep: 1.5,
  },
  narrate: {
    rounds: 40,
    buildRounds: 60,
    foldRatio: 0.7,
    keep: 5,
    windows: { "anthropic/claude-opus-5.5": 1_000_000, "anthropic/claude-opus-5": 1_000_000, "anthropic/claude-sonnet-5.5": 1_000_000, "anthropic/claude-sonnet-5": 1_000_000, "anthropic/claude-haiku-5.5": 1_000_000, "openai/gpt-6.2-astra": 1_050_000, "openai/gpt-6.2-sol": 1_050_000, "openai/gpt-6-luna": 1_050_000 },
    defaultWindow: 200_000,
  },
};

let current: KalchasConfig = defaultConfig;

export function config(): KalchasConfig {
  return current;
}

export function setConfig(patch: Partial<KalchasConfig>): void {
  current = { ...current, ...patch };
}


/**
 * The two classes of work a model is chosen for. `main`: the calls that judge and write, on which how good a play is
 * rests (the questions, the world's skeleton and opening, whoever directs, the scene, milestones, the review, the
 * conversation with the person; under engine 12 the world, each stop, each answer and the review: `narrate_world`,
 * `narrate_stop`, `narrate_answer`, `narrate_report`). `light`: the many calls that read, look up and play their part (reading what was
 * found, writing who people are, each person's own answer, reading the player's move, keeping the record; under engine
 * 12, folding a long play's earlier stops into the story so far: `narrate_compress`). Which class
 * each call is in is said here and nowhere else.
 */
export type ModelClass = "main" | "light";
export const MODEL_CLASSES: ModelClass[] = ["main", "light"];

const LIGHT = new Set([
  "search",
  "lookup_queries",
  "lookup_read",
  "setup_lookup",
  "setup_draws",
  "world_people",
  "persona",
  "world_body",
  "open_body",
  "person",
  "body_run",
  "rule",
  "record",
  "record_motion",
  "memory_digest",
  "project_title",
  "narrate_compress",
]);

/** The class a call is in, by its purpose: any purpose not listed as light is main. */
export function classOf(purpose: string): ModelClass {
  return LIGHT.has(purpose) ? "light" : "main";
}

/**
 * How long a model thinks before it answers, as the provider takes it for any model (OpenRouter's `reasoning.effort`):
 * the same words whichever model a class is on, mapped by the provider to that model's own levels.
 */
export type Effort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
export const EFFORTS: Effort[] = ["none", "minimal", "low", "medium", "high", "xhigh"];

/**
 * For a test only (KALCHAS_EFFORT_FOR="narrate_world=high,narrate_stop=medium", never the settings): how long one kind
 * of call thinks, ahead of its class's.
 */
function testEffort(purpose: string): Effort | undefined {
  const said = (process.env.KALCHAS_EFFORT_FOR ?? "").split(",").map((x) => x.split("=").map((y) => y.trim())).find(([k]) => k === purpose)?.[1];
  return said && (EFFORTS as string[]).includes(said) ? (said as Effort) : undefined;
}

/** How long a call thinks: as a test set it for its kind, else its class's setting, else nothing set (as long as the model wants). */
export function effortFor(purpose: string): Effort | undefined {
  return testEffort(purpose) ?? current.classEfforts[classOf(purpose)];
}

/** The model a call goes to: the one asked for by name, else one set for its kind in a test, else its class's, else the default. */
export function modelFor(purpose: string, override?: string | null): string {
  return override || current.purposeModels[purpose] || current.classModels[classOf(purpose)] || current.defaultModel;
}
