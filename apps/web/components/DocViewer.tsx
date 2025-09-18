"use client";
import { useEffect, useRef } from "react";
import { findApproximate } from "../lib/fuzzy";

export default function DocViewer({ pageText, citations }: { pageText: string; citations: { page: number; quote: string }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // naive: render text and highlight ranges
    if (!ref.current) return;
    const root = ref.current;
    root.innerHTML = "";
    const p = document.createElement('p');
    p.textContent = pageText;
    root.appendChild(p);
    citations.forEach((c) => {
      const m = findApproximate(pageText, c.quote || "");
      if (m) {
        const mark = document.createElement('div');
        mark.textContent = `Highlight ~ page ${c.page}`;
        mark.style.background = 'yellow';
        mark.style.padding = '2px 4px';
        root.appendChild(mark);
      }
    });
  }, [pageText, citations]);
  return <div ref={ref} className="border rounded p-2" />;
}
