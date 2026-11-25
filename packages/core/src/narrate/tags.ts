/**
 * What one model writes, read back. Under engine 12 the world and every stop come back as plain text in tags
 * (`<scene>…</scene>`), not JSON: long prose needs no escaping, and it can be shown while it is written. Nothing here
 * judges what was written; it only finds the parts. A part written twice is read from its last complete writing (a
 * model that wrote, looked something up and wrote again meant the second).
 */

/** The tags of a play: those of the world's setting up and those of a stop or an answer. */
const PLAY_TAGS = new Set(["kind", "answer", "day", "headline", "happened", "scene", "messages", "options", "notes_patch", "milestone", "ended", "undercurrents", "situation", "notes", "milestones", "found"]);

/** A fragment in the shape of a tag, opening or closing, its attributes (if any) written name="value". */
const TAG_SHAPED = /<\/?([A-Za-z_][\w:.-]*)(?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*\s*\/?>/g;

/**
 * A tag's text without what a tool call left in it: a model whose call to a tool did not go through as one may write
 * its pieces into the text (`<parameter name="query">`, `</invoke>`). Any fragment in the shape of a tag that is not
 * one of the play's own is taken out; any other `<` (as in "<5%") stays. What the model wrote stays as it was in the
 * history; only what is read from it is cleaned.
 */
function clean(body: string): string {
  let cut = false;
  // (and the marks of markdown emphasis, which the page would show as they are)
  const out = body.replace(TAG_SHAPED, (whole, name: string) => (PLAY_TAGS.has(name.toLowerCase()) ? whole : ((cut = true), ""))).replace(/\*\*/g, "");
  return cut ? out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n") : out;
}

/**
 * Where another of the play's tags opens, from `from` on (-1 when none does). The play's tags never hold one another,
 * so a tag's text ends at its own closing or, where that closing was written wrong or left out, where the next part
 * begins: what comes after is never read into it (a list of what each side did never takes in the scene, the ways or
 * the hidden notes after it).
 */
function nextOpen(text: string, from: number, tag: string): number {
  const re = /<([A-Za-z_]+)>/g;
  re.lastIndex = from;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const name = m[1]!.toLowerCase();
    if (name !== tag && PLAY_TAGS.has(name)) return m.index;
  }
  return -1;
}

/** The end of the text of a tag opened at `body`: its closing, or the next part's opening if that comes first, or -1. */
function bodyEnd(text: string, body: number, tag: string): { end: number; closed: boolean } {
  const close = text.indexOf(`</${tag}>`, body);
  const next = nextOpen(text, body, tag);
  if (close >= 0 && (next < 0 || close < next)) return { end: close, closed: true };
  return { end: next, closed: false };
}

/** A closing written wrong at the very end of what ends where the next part begins ("</halppened>"), taken off. */
const strayClose = (body: string) => body.replace(/<\/[A-Za-z_][\w:.-]*>\s*$/, "");

/**
 * The text of a tag, from its last complete writing; undefined when it was never closed. Its closing written wrong or
 * left out, it ends where the next of the play's parts begins.
 */
export function tagOf(text: string, tag: string): string | undefined {
  const open = `<${tag}>`;
  const read = (start: number) => {
    const { end, closed } = bodyEnd(text, start + open.length, tag);
    if (end < 0) return undefined;
    const body = text.slice(start + open.length, end);
    return clean(closed ? body : strayClose(body.trimEnd())).trim();
  };
  // the last writing, if it was finished; else the last that was
  const later = text.lastIndexOf(open);
  if (later < 0) return undefined;
  const got = read(later);
  if (got !== undefined) return got;
  const last = text.lastIndexOf(`</${tag}>`);
  const start = last >= 0 ? text.lastIndexOf(open, last) : -1;
  return start >= 0 ? read(start) : undefined;
}

/** Every complete writing of a tag, in order (a stop may settle several main questions, each in a block of its own). */
export function tagsOf(text: string, tag: string): string[] {
  const out: string[] = [];
  const open = `<${tag}>`, close = `</${tag}>`;
  let at = 0;
  for (;;) {
    const s = text.indexOf(open, at);
    if (s < 0) break;
    const { end, closed } = bodyEnd(text, s + open.length, tag);
    if (end < 0) break;
    const body = text.slice(s + open.length, end);
    out.push(clean(closed ? body : strayClose(body.trimEnd())).trim());
    at = closed ? end + close.length : end;
  }
  return out;
}

/**
 * The text of a tag as far as it has arrived, while it is still being written: from its last opening to its closing,
 * or to the end (a closing tag cut off at the end is left out until the rest arrives). Undefined until it has opened.
 */
export function partialTag(text: string, tag: string): string | undefined {
  const open = `<${tag}>`;
  const start = text.lastIndexOf(open);
  if (start < 0) return undefined;
  const { end } = bodyEnd(text, start + open.length, tag);
  let body = text.slice(start + open.length, end >= 0 ? end : undefined);
  if (end < 0) {
    // a tag of any kind starting at the very end may be this one closing: wait for it
    const lt = body.lastIndexOf("<");
    if (lt >= 0 && !body.slice(lt).includes(">") && body.length - lt <= tag.length + 3) body = body.slice(0, lt);
  }
  return clean(body).replace(/^\s*\n/, "").trimEnd();
}

/**
 * The items of a list tag as far as it has arrived, while it is still being written: only lines that have ended (the
 * one being written waits for the rest). Undefined until it has opened.
 */
export function arrivedLines(text: string, tag: string): string[] | undefined {
  const open = `<${tag}>`;
  const start = text.lastIndexOf(open);
  if (start < 0) return undefined;
  const { end } = bodyEnd(text, start + open.length, tag);
  let body = text.slice(start + open.length, end >= 0 ? end : undefined);
  if (end < 0) body = body.slice(0, body.lastIndexOf("\n") + 1);
  return listLines(clean(body));
}

const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/;

/**
 * The items of a list tag, each without its bullet: an item starts at a line with a bullet, and a line without one
 * goes on the item before it (a detail that ran onto a second line). With no bullet anywhere, each line is an item.
 * Blank lines and "(none)" are left out.
 */
export function listLines(body: string | undefined): string[] {
  const lines = (body ?? "").split("\n").filter((l) => l.trim());
  const bulleted = lines.some((l) => BULLET.test(l));
  const out: string[] = [];
  for (const l of lines) {
    if (!bulleted || BULLET.test(l) || !out.length) out.push(l.replace(BULLET, "").trim());
    else out[out.length - 1] = `${out[out.length - 1]} ${l.trim()}`;
  }
  // (a line saying there is none, in English or Chinese: the Chinese escaped)
  return out.filter((l) => l && !/^\(?(none|nothing|\u65e0|\u6ca1\u6709)\)?\.?$/i.test(l));
}

/** `key: value` lines of a block (a milestone card), by key in lower case. */
export function fieldsOf(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  let key: string | null = null;
  for (const raw of body.split("\n")) {
    // (the colon may be ASCII or full-width)
    const m = raw.match(/^\s*([A-Za-z_]+)\s*[:\uff1a]\s*(.*)$/);
    if (m) {
      key = m[1]!.toLowerCase();
      out[key] = m[2]!.trim();
    } else if (key && raw.trim()) out[key] = `${out[key]}\n${raw.trim()}`.trim();
  }
  return out;
}

/** A day written by the model, as YYYY-MM-DD (the first such in the text), or null. */
export function dayIn(text: string | undefined): string | null {
  const m = (text ?? "").match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

/** "- 2026-03-04 | from whom | what it says" → a message; a line that is not one keeps its words as what it says. */
export function messageLine(line: string): { from: string; day: string; gist: string } {
  const parts = line.split("|").map((x) => x.trim());
  if (parts.length >= 3) {
    const day = dayIn(parts[0]) ?? "";
    // (the colon may be ASCII or full-width)
    return { day, from: parts[1]!.replace(/^from\s*[:\uff1a]?\s*/i, ""), gist: parts.slice(2).join(" | ") };
  }
  return { day: dayIn(line) ?? "", from: "", gist: line };
}

/** "- 2026-03-04 | who | what they did" → something one side did; a line that is not one keeps its words as what was done. */
export function happenedLine(line: string): { day: string; who: string; what: string } {
  const parts = line.split("|").map((x) => x.trim());
  if (parts.length >= 3) return { day: dayIn(parts[0]) ?? "", who: parts[1]!, what: parts.slice(2).join(" | ") };
  return { day: dayIn(line) ?? "", who: "", what: line };
}

/** "- title :: what exactly to do" → an option; a line with no "::" is all title. */
export function optionLine(line: string): { title: string; detail: string } {
  const at = line.indexOf("::");
  if (at < 0) return { title: line.trim(), detail: "" };
  return { title: line.slice(0, at).trim(), detail: line.slice(at + 2).trim() };
}
