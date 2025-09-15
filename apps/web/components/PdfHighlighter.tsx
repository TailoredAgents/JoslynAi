"use client";
import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import { TextLayerBuilder } from "pdfjs-dist/web/pdf_viewer";
import "pdfjs-dist/web/pdf_viewer.css";

(pdfjs as any).GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${(pdfjs as any).version}/pdf.worker.min.js`;

type Citation = { page: number; quote: string };

export default function PdfHighlighter({ url, citations, docId }: { url: string; citations: Citation[]; docId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<any>(null);
  const [spansByPage, setSpansByPage] = useState<Record<number, any[]>>({});

  useEffect(() => {
    (async () => {
      const loading = await (pdfjs as any).getDocument(url).promise;
      setPdf(loading);
    })();
  }, [url]);

  useEffect(() => {
    if (!pdf || !containerRef.current) return;
    (async () => {
      containerRef.current!.innerHTML = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.2 });
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d")!;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        containerRef.current!.appendChild(canvas);
        await page.render({ canvasContext: ctx, viewport }).promise;

        const textLayerBuilder = new TextLayerBuilder({ pdfPage: page });
        const textLayerDiv = textLayerBuilder.div;
        textLayerDiv.style.position = "relative";
        textLayerDiv.style.width = `${viewport.width}px`;
        textLayerDiv.style.height = `${viewport.height}px`;
        containerRef.current!.appendChild(textLayerDiv);
        await textLayerBuilder.render(viewport);

        if (!spansByPage[i]) {
          try {
            const base = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";
            const res = await fetch(`${base}/documents/${docId}/spans?page=${i}`);
            const spans = await res.json();
            setSpansByPage(prev => ({ ...prev, [i]: spans || [] }));
          } catch {}
        }

        const pageCitations = citations.filter(c => c.page === i);
        if (pageCitations.length) {
          for (const c of pageCitations) {
            let drew = false;
            const spans = spansByPage[i] || [];
            const quote = (c.quote || "").toLowerCase().slice(0, 100);
            const spanMatch = spans.find((s: any) => typeof s.text === "string" && s.text.toLowerCase().includes(quote.slice(0, 30)) && Array.isArray(s.bbox) && s.bbox.length === 4);
            if (spanMatch && Array.isArray(spanMatch.bbox)) {
              const [x, y, w, h] = spanMatch.bbox as number[];
              const px = (x / (spanMatch.page_width || viewport.width)) * viewport.width;
              const py = (y / (spanMatch.page_height || viewport.height)) * viewport.height;
              const pw = (w / (spanMatch.page_width || viewport.width)) * viewport.width;
              const ph = (h / (spanMatch.page_height || viewport.height)) * viewport.height;
              const hl = document.createElement("div");
              hl.style.position = "absolute";
              hl.style.left = `${px}px`;
              hl.style.top = `${py}px`;
              hl.style.width = `${pw}px`;
              hl.style.height = `${ph}px`;
              hl.style.background = "rgba(255, 230, 0, .35)";
              textLayerDiv.appendChild(hl);
              drew = true;
            }
            if (!drew) {
              const match = Array.from(textLayerDiv.querySelectorAll("span"))
                .find(span => (span.textContent || "").toLowerCase().includes(c.quote.trim().slice(0, 80).toLowerCase()));
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
  }, [pdf, citations, spansByPage, docId]);

  return <div ref={containerRef} className="relative" />;
}
