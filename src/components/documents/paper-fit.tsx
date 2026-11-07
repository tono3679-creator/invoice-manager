"use client";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** A4 の紙の幅（96dpi の 210mm） */
export const PAPER_WIDTH = 794;

/**
 * 書類を A4 の幅で組んだまま、置き場所の幅に合わせて縮小して見せる（PDF のプレビューと同じ考え方）。
 * スマートフォンでも紙のレイアウトが崩れない。
 */
export function PaperFit({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = outer.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, el.clientWidth / PAPER_WIDTH));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={outer} className="w-full">
      <div className="mx-auto" style={{ width: PAPER_WIDTH, zoom: scale }}>{children}</div>
    </div>
  );
}
