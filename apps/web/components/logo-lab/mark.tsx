import { FUSE, set, type Fuse } from "./fuse";

/** The name as the mark writes it: capitals, the two As with no bar. */
export const TEXT = "KΛLCHΛS";

/**
 * The one that was chosen: a skeleton half Syne's and half Marcellus's (its S and C are where that shows: their ends
 * are cut aslant and not level), ends that open a little, capitals, both As with no bar, every letter one width as the
 * eye has it, finished.
 */
export const CHOSEN: Fuse = { ...FUSE, skel: 0.5, flare: 0.07, even: 1, eye: 1, fine: 3 };

const drawn = new Map<string, ReturnType<typeof set>>();

/** The wordmark (or a letter of it), its capitals `cap` pixels tall, in the colour of the text around it. */
export function Wordmark({ cap = 12, className = "", text = TEXT }: { cap?: number; className?: string; text?: string }) {
  let W = drawn.get(text);
  if (!W) drawn.set(text, (W = set(CHOSEN, text)));
  const pad = 12;
  const k = cap / 1000;
  const tall = W.top - W.bottom + pad * 2;
  return (
    <svg viewBox={`${W.x0} ${-W.top - pad} ${W.x1 - W.x0} ${tall}`} width={(W.x1 - W.x0) * k} height={tall * k} fill="currentColor" className={`block overflow-visible ${className}`} role="img" aria-label={text === TEXT ? "Kalchas" : undefined} aria-hidden={text !== TEXT}>
      <path d={W.d} />
    </svg>
  );
}
