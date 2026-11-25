"use client";

import { useEffect, useRef, useState } from "react";
import { MONO } from "@/components/kit/palette";
import { useApp } from "@/components/product/shell";

/**
 * What is said while a world is found and made, set at the top left of the page (/design/matter): what the whole
 * thing is about, how much there is so far, how long it has taken, and what is being done now. It is one block from
 * the first source found to the world being ready, so there is one place to look; the middle of the page is the
 * picture's alone, and the record of what is done is down the right.
 *
 * Two lines. What it is about. Then how much there is, in one line: each figure large and light, what it counts
 * small beside it on the same line, and how long it has taken at the end. What is being done, step by step, is not
 * said here: the picture in the middle of the page is that. Nor is how far along it is: while a world is being made
 * no one knows how much longer it will take, so nothing here pretends to.
 */

const SWIFT = "cubic-bezier(.2,.7,.2,1)";
const CSS = `@keyframes build-in { from { opacity: 0; transform: translateY(0.5em); } to { opacity: 1; transform: none; } } @keyframes build-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(-0.5em); } }`;
/** The figures are set light, in the face that has a light weight. */
const LIGHT = `"MiSans", system-ui, sans-serif`;

/** Something that gives way to what comes after it: the old goes up and out, the new comes up from under it. */
function Turn({ id, className, children }: { id: string; className?: string; children: React.ReactNode }) {
  const last = useRef<{ id: string; node: React.ReactNode }>({ id, node: children });
  const [old, setOld] = useState<{ id: string; node: React.ReactNode } | null>(null);
  if (last.current.id !== id) {
    const was = last.current;
    last.current = { id, node: children };
    setOld(was);
  } else last.current.node = children;
  useEffect(() => {
    if (!old) return;
    const t = window.setTimeout(() => setOld(null), 420);
    return () => window.clearTimeout(t);
  }, [old]);
  return (
    <div className={`relative ${className ?? ""}`}>
      {old && old.id !== id && (
        <div key={`o${old.id}`} className="absolute top-0 left-0 whitespace-nowrap" style={{ animation: "build-out .4s cubic-bezier(.4,0,.6,1) both" }}>
          {old.node}
        </div>
      )}
      <div key={`n${id}`} className="whitespace-nowrap" style={{ animation: `build-in .55s ${SWIFT} both` }}>
        {children}
      </div>
    </div>
  );
}

export function BuildWords({ title, elapsed, timed, counts }: { title: string; elapsed: string; /** Whether there is a time to say yet. */ timed: boolean; counts: [number, string][] }) {
  const { P } = useApp();
  return (
    <div className="pointer-events-none absolute" style={{ left: 44, top: 34, width: 680 }}>
      <style>{CSS}</style>
      <div className="text-[26px] leading-[1.3] font-medium" style={{ letterSpacing: "0.01em" }}>
        {title}
      </div>
      {/* (when what is counted changes, from sources to a world, the line gives way to the next) */}
      <Turn id={counts.map((c) => c[1]).join(" ")} className="mt-[16px] h-[40px]">
        <div className="flex items-baseline gap-9">
          {counts.map(([n, label]) => (
            <span key={label} className="flex items-baseline gap-[9px]">
              <span className="text-[32px] leading-[40px]" style={{ fontFamily: LIGHT, fontWeight: 300, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>
                {n}
              </span>
              <span className="text-[12.5px]" style={{ color: P.mute }}>
                {label}
              </span>
            </span>
          ))}
          <span style={{ fontFamily: MONO, fontSize: 11.5, fontVariantNumeric: "tabular-nums", color: P.mute, opacity: timed ? 1 : 0, transition: "opacity .6s ease" }}>{elapsed}</span>
        </div>
      </Turn>
    </div>
  );
}
