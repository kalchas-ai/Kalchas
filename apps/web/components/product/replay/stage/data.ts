import type { PlayView, StopLive, WorldView } from "@kalchas/core";
import { fmtMetric, delta, worse, type Metric } from "@/components/product/replay/metrics";
import { mentioned, type Node } from "@/components/product/replay/net";
import type { T } from "@/lib/i18n/locales";

/**
 * What the drafts of the play page read from a real timeline: the steps walked so far (each with what came of it),
 * the numbers against the start, where everyone stands now, and who a choice would reach. Read-only.
 */

/**
 * A step as the route gives it, while it is worked out and once it is: what is being done, a line each; while an
 * engine-12 stop is being written, its scene and what each side did and the rolls the protagonist can see, as far as
 * they are written (empty and null once it is done); and how it came out (whether something came back to be said
 * plainly, a question was answered instead, or the step was done).
 */
export type PlayProgress = { running: boolean; messages: string[]; scene: string; live?: StopLive | null; error: string | null; result: { clarification: string } | { asked: true } | { done: true } | null; startedAt: number };

/** (`progress`: null when no step has been taken since the server began; absent on a replay. `narrated`: the play is written by engine 12, one model writing it stop by stop; the page says a few things otherwise for it. Set by the route; absent on a replay.) */
export type Play = PlayView & { progress?: PlayProgress | null; narrated?: boolean };
export type FeedItem = PlayView["feed"][number];
export type Option = NonNullable<PlayView["situation"]>["recommendations"][number];

export type Step = {
  n: number;
  at: string;
  /** The question this step put to you. */
  q: string;
  /** What you did (null: this is the step waiting for you). */
  did: string | null;
  /** What came of it, the telling ones first. */
  events: Shown[];
};

/**
 * Who did something, when it is not someone named: you, or the kind of event it is. Each is the text `who.<role>` of
 * "product.replay.stage.data" (see whoOf).
 */
export type Role = "you" | "outside" | "chance" | "outcome" | "stage" | "situation";

/** An event as the page tells it: who (a name, or else a role), what, and the odds when it was drawn. */
export type Shown = { id: string; at: string; who: string | null; role: Role | null; what: string; mine: boolean; p: number | null; kind: string; actorId: string | null; seq: number; detail: string };

/** Who an event is by, as the page names it. `t` is the texts of "product.replay.stage.data". */
export const whoOf = (e: Shown, t: T) => e.who ?? t(`who.${e.role ?? "situation"}`);

export function shown(f: FeedItem): Shown | null {
  let what = f.title.trim();
  // the engine's Chinese prefix "\u7ed3\u679c" ("result") before a plain or full-width colon: "result: direct result"
  // ("\u76f4\u63a5\u7ed3\u679c") says nothing; "result: admitted" is worth keeping without its prefix
  if (/^\u7ed3\u679c[\uff1a:]\s*\u76f4\u63a5\u7ed3\u679c$/.test(what)) return null;
  what = what.replace(/^\u7ed3\u679c[\uff1a:]\s*/, "");
  const p = f.odds ? (f.odds.options.find((o) => o.label === f.odds!.chosen)?.probability ?? null) : null;
  // a drawn result on its own ("admitted") needs the question it answers (without what is in plain or full-width
  // brackets, and without a closing question mark or full stop, plain or full-width)
  if (f.odds && what.length < 8 && f.odds.question) what = `${f.odds.question.replace(/[\uff08(][^\uff09)]*[\uff09)]?/g, "").trim().replace(/[\uff1f?\u3002]$/, "")} → ${what}`;
  const role: Role | null = f.mine ? "you" : f.actor ? null : f.kind === "exogenous" ? "outside" : f.kind === "chance" ? "chance" : f.kind === "tick" ? "outcome" : f.kind === "stage" ? "stage" : "situation";
  return { id: f.id, at: f.simTime, who: f.mine ? null : (f.actor ?? null), role, what, mine: f.mine, p, kind: f.kind, actorId: f.actorId ?? null, seq: f.seq, detail: f.description ?? "" };
}

/** The steps walked so far, the current one last. */
export function stepsOf(play: Play): Step[] {
  const ds = [...play.decisions].sort((a, b) => a.step - b.step);
  const done = ds.filter((d) => d.restatement);
  // a step starts where you acted; what follows, until the next one, is what came of it
  const marks = play.feed.filter((f) => f.mine && f.kind === "user_action").sort((a, b) => a.seq - b.seq);
  const bySeq = marks.length === done.length;
  return ds.map((d, i) => {
    let evs: FeedItem[] = [];
    if (d.restatement) {
      if (bySeq) {
        const from = marks[i]!.seq;
        const to = marks[i + 1]?.seq ?? Infinity;
        evs = play.feed.filter((f) => f.seq > from && f.seq < to);
      } else {
        const next = ds[i + 1]?.simTime ?? "9999";
        evs = play.feed.filter((f) => !(f.mine && f.kind === "user_action") && f.simTime >= d.simTime && f.simTime < next);
      }
    }
    const events = evs
      .sort((a, b) => a.seq - b.seq)
      .map(shown)
      .filter((x): x is Shown => !!x);
    return { n: d.step, at: d.simTime, q: d.headline, did: d.restatement, events };
  });
}

/** What came of the last step you took, in the order it happened. */
export function lastEvents(play: Play): Shown[] {
  const marks = play.feed.filter((f) => f.mine && f.kind === "user_action").sort((a, b) => a.seq - b.seq);
  const from = marks.at(-1)?.seq ?? -1;
  return play.feed
    .filter((f) => f.seq > from)
    .sort((a, b) => a.seq - b.seq)
    .map(shown)
    .filter((x): x is Shown => !!x);
}

export type Num = { m: Metric; now: string; start: string; d: string | null; bad: boolean; unit: string; value: string };

/** Each of the world's numbers, now and against the start; the unit split off so the number can be set large. `locale`: the interface language. */
export function numsOf(play: Play, locale: string): Num[] {
  return play.world.metrics.map((m) => {
    const v = play.branch.metrics[m.key];
    const v0 = play.branch.startMetrics[m.key];
    const now = fmtMetric(m, v, locale);
    const unit = m.unit && now.endsWith(m.unit) ? m.unit : "";
    const value = unit && now.endsWith(unit) ? now.slice(0, -unit.length).trim() : now;
    return { m, now, start: fmtMetric(m, v0, locale), d: delta(m, v0, v, locale), bad: worse(m, v0, v), unit, value };
  });
}

/** The engine's name for you as the owner of something true on a timeline ("\u4f60", "you" in Chinese). */
const YOU = "\u4f60";

/** Where the other parties stand right now: their latest stance on this timeline, matched to a person on the web. */
export function stancesOf(play: Play, seat: string): { id: string; who: string; text: string; since: string }[] {
  const byName = new Map<string, string>();
  for (const n of play.graph.nodes) for (const k of [n.name, ...n.aliases]) byName.set(k.trim().toLowerCase(), n.id);
  const out = new Map<string, { id: string; who: string; text: string; since: string }>();
  for (const l of play.ledger) {
    if (!l.active || l.mine || l.owner === YOU) continue;
    const id = byName.get(l.owner.trim().toLowerCase());
    if (!id || id === seat) continue;
    const was = out.get(id);
    if (!was || l.since > was.since) out.set(id, { id, who: l.owner, text: l.text, since: l.since });
  }
  return [...out.values()];
}

/** Things true on this timeline that concern you (what you set, and what has become of you). */
export const premisesOf = (play: Play) => play.ledger.filter((l) => l.active && (l.mine || l.owner === YOU));

/** Who an option would reach. */
export function reachOf(o: Option, nodes: Node[], seat: string): Node[] {
  const ids = mentioned(`${o.title} ${o.detail}`, nodes, seat);
  return nodes.filter((n) => ids.has(n.id));
}

export const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
export const md = (d: string) => d.slice(5).replace("-", "/");

export type Data = { world: WorldView; play: Play };

/* ---------------------------------------------------------------- what a step looks like once you have chosen */

/**
 * A step already walked on this timeline, to show what the page does after you choose: what you did, the time it
 * covered, what happened in the order it happened, and the moment it stopped at. The most recent step with enough
 * going on is used, so the playback has something to show.
 */
export type Replay = { n: number; did: string; from: string; to: string; next: string | null; events: Shown[] };

export function replayOf(play: Play): Replay | null {
  const steps = stepsOf(play);
  const done = steps.filter((s) => s.did);
  if (!done.length) return null;
  const pickd = [...done].reverse().find((s) => s.events.length >= 3) ?? done.at(-1)!;
  const i = steps.indexOf(pickd);
  const next = steps[i + 1] ?? null;
  const events = [...pickd.events].sort((a, b) => a.at.localeCompare(b.at) || a.seq - b.seq);
  const last = events.at(-1)?.at ?? pickd.at;
  const to = next && next.at > last ? next.at : last;
  return { n: pickd.n, did: pickd.did!, from: pickd.at, to, next: next?.q ?? null, events };
}

/**
 * Long text as short lines: split at full stops and semicolons, so a paragraph reads as a few points. (The
 * full-width marks: \u3002 full stop, \uff1b semicolon, \uff01 exclamation mark, \uff1f question mark.)
 */
export function lines(s: string, max = 4): string[] {
  const parts = s
    .split(/(?<=[\u3002\uff1b\uff01\uff1f;])/)
    .map((x) => x.replace(/[\u3002\uff1b;]$/, "").trim())
    .filter(Boolean);
  return parts.length <= max ? parts : [...parts.slice(0, max - 1), parts.slice(max - 1).join("\uff1b")];
}

/** A day between two days, for a clock that runs while a step plays. */
export function between(a: string, b: string, t: number): string {
  const x = Date.parse(a);
  const y = Date.parse(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return b;
  return new Date(x + (y - x) * Math.max(0, Math.min(1, t))).toISOString().slice(0, 10);
}

/**
 * A passage cut to whole sentences, at most `max` characters; a first sentence longer than that is cut at a comma and
 * marked as cut. Never stops in the middle of a word or a clause.
 */
export function excerpt(s: string, max: number): string {
  // (sentences end at a full stop, exclamation or question mark or semicolon, full-width or plain)
  const parts = s
    .split(/(?<=[\u3002\uff01\uff1f\uff1b!?;])/)
    .map((x) => x.trim())
    .filter(Boolean);
  let out = "";
  for (const p of parts) {
    if ((out + p).length > max) break;
    out += p;
  }
  if (out) return out;
  const first = (parts[0] ?? s).slice(0, max);
  // (a clause ends at a comma, full-width or plain, the enumeration comma \u3001 or a full-width colon)
  const k = Math.max(first.lastIndexOf("\uff0c"), first.lastIndexOf(","), first.lastIndexOf("\u3001"), first.lastIndexOf("\uff1a"));
  return `${k > max * 0.4 ? first.slice(0, k) : first}……`;
}
