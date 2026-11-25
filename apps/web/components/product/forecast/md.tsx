"use client";

import type { ReactNode } from "react";
import type { Pal as Palette } from "@/components/kit/palette";

/**
 * The little Markdown the AI writes in its replies: paragraphs, headings, bullet and numbered lists, **bold**,
 * `code` and [links](url). Rendered as elements, never as raw HTML.
 */

/** The colours it needs, passed in by the page that shows it. */
type Pal = Pick<Palette, "ink" | "inkRgb" | "warm">;

function inline(text: string, key: string, P: Pal): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((https?:[^)\s]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${key}-${i++}`;
    if (t.startsWith("**")) out.push(<strong key={k} style={{ fontWeight: 600, color: P.ink }}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={k} className="rounded-[5px] px-1 py-[1px] text-[0.92em]" style={{ background: `rgb(${P.inkRgb} / 0.08)` }}>{t.slice(1, -1)}</code>);
    else {
      const label = t.slice(1, t.indexOf("]("));
      out.push(<a key={k} href={m[2]} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-[3px]">{label}</a>);
    }
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function Md({ text, size = 15, pal: P }: { text: string; size?: number; pal: Pal }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push(<p key={`p${blocks.length}`} className="leading-[1.75]">{inline(para.join(" "), `p${blocks.length}`, P)}</p>);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const L = list;
    blocks.push(
      L.ordered ? (
        <ol key={`l${blocks.length}`} className="grid list-decimal gap-1.5 pl-5 leading-[1.7]">
          {L.items.map((x, i) => <li key={i}>{inline(x, `l${blocks.length}-${i}`, P)}</li>)}
        </ol>
      ) : (
        <ul key={`l${blocks.length}`} className="grid gap-1.5 leading-[1.7]">
          {L.items.map((x, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="mt-[0.7em] inline-block h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: P.warm }} />
              <span className="min-w-0">{inline(x, `l${blocks.length}-${i}`, P)}</span>
            </li>
          ))}
        </ul>
      ),
    );
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trim();
    const h = line.match(/^#{1,4}\s+(.*)$/);
    const ul = line.match(/^[-*•]\s+(.*)$/);
    // a numbered item: "1." "1)" or "1\u3001" (the Chinese enumeration comma)
    const ol = line.match(/^\d+[.)\u3001]\s*(.*)$/);
    if (!line) {
      flushPara();
      flushList();
    } else if (h) {
      flushPara();
      flushList();
      blocks.push(<div key={`h${blocks.length}`} className="font-medium" style={{ fontSize: size + 1 }}>{inline(h[1]!, `h${blocks.length}`, P)}</div>);
    } else if (ul || ol) {
      flushPara();
      const ordered = !!ol;
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push((ul ?? ol)![1]!);
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return (
    <div className="grid min-w-0 gap-2.5 [overflow-wrap:anywhere]" style={{ fontSize: size }}>
      {blocks}
    </div>
  );
}
