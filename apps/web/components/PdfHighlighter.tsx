"use client";
import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import "pdfjs-dist/web/pdf_viewer.css";

(pdfjs as any).GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${(pdfjs as any).version}/pdf.worker.min.js`;

type Citation = { page:number; quote:string };

export default function PdfHighlighter({ url, citations }: { url: string; citations: Citation[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<any>(null);

  useEffect(() => { (async () => {
    const loading = await (pdfjs as any).getDocument(url).promise;
    setPdf(loading);
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
          for (const c of pageCitations) {
            const match = Array.from(textLayerDiv.querySelectorAll("span"))
              .find(span => (span.textContent || '').toLowerCase().includes(c.quote.trim().slice(0,80).toLowerCase()));
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
    })();
  }, [pdf, citations]);

  return <div ref={containerRef} className="relative" />;
}

