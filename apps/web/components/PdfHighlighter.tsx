"use client";
import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import "pdfjs-dist/web/pdf_viewer.css";

(pdfjs as any).GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${(pdfjs as any).version}/pdf.worker.min.js`;

type Citation = { page:number; quote:string };

async function fetchSpans(docId: string, page: number) {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";
  const res = await fetch(`${base}/documents/${docId}/spans?page=${page}`);
  if (!res.ok) return [];
  return await res.json();
}

export default function PdfHighlighter({ url, citations }: { url: string; citations: Citation[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<any>(null);
  const [docId, setDocId] = useState<string | null>(null);

  useEffect(() => { (async () => {
    const loading = await (pdfjs as any).getDocument(url).promise;
    setPdf(loading);
    try {
      const u = new URL(url);
      const key = u.pathname;
      // heuristic to get docId from current path
      const m = typeof window !== 'undefined' ? window.location.pathname.match(/\/documents\/(.+?)\//) : null;
      if (m) setDocId(m[1]);
    } catch {}
  })(); }, [url]);

  useEffect(() => {
    if (!pdf || !containerRef.current) return;
    (async () => {
      containerRef.current!.innerHTML = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.2 });
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d")!;
        canvas.width = viewport.width; canvas.height = viewport.height;
        containerRef.current!.appendChild(canvas);
        await page.render({ canvasContext: ctx, viewport }).promise;

        const textLayerDiv = document.createElement("div");
        textLayerDiv.className = "textLayer";
        textLayerDiv.style.position = 'relative';
        textLayerDiv.style.width = `${viewport.width}px`;
        textLayerDiv.style.height = `${viewport.height}px`;
        containerRef.current!.appendChild(textLayerDiv);

        const textContent = await page.getTextContent();
        (pdfjs as any).renderTextLayer({ textContent, container: textLayerDiv, viewport, textDivs: [] });

        const pageCitations = citations.filter(c => c.page === i);
        if (pageCitations.length) {
          // Try bbox-based if spans available
          let spans: any[] = [];
          if (docId) {
            try { spans = await fetchSpans(docId, i); } catch {}
          }
          for (const c of pageCitations) {
            let highlighted = false;
            if (Array.isArray(spans) && spans.length) {
              const span = spans.find(s => (s.text || '').toLowerCase().includes(c.quote.trim().slice(0,80).toLowerCase()) && Array.isArray(s.bbox));
              if (span && span.bbox && span.page_width && span.page_height) {
                const [x, y, w, h] = span.bbox as number[];
                const scaleX = viewport.width / span.page_width;
                const scaleY = viewport.height / span.page_height;
                const hl = document.createElement('div');
                hl.style.position = 'absolute';
                hl.style.left = `${x * scaleX}px`;
                hl.style.top = `${y * scaleY}px`;
                hl.style.width = `${w * scaleX}px`;
                hl.style.height = `${h * scaleY}px`;
                hl.style.background = 'rgba(255, 230, 0, .35)';
                textLayerDiv.appendChild(hl);
                highlighted = true
              }
            }
            if (!highlighted) {
              const match = Array.from(textLayerDiv.querySelectorAll("span")).find(span => (span.textContent || '').toLowerCase().includes(c.quote.trim().slice(0,80).toLowerCase()));
              if (match) {
                const rect = (match as HTMLElement).getBoundingClientRect();
                const parent = textLayerDiv.getBoundingClientRect();
                const hl = document.createElement("div");
                hl.style.position = "absolute";
                hl.style.left = `${rect.left - parent.left}px`;
                hl.style.top = `${rect.top - parent.top}px`;
                hl.style.width = `${rect.width}px`;
                hl.style.height = `${rect.height}px`;
                hl.style.background = "rgba(255, 230, 0, .35)";
                textLayerDiv.appendChild(hl);
              }
            }
          }
        }
      }
    })();
  }, [pdf, citations]);

  return <div ref={containerRef} className="relative" />;
}
