"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";

const PdfHighlighter = dynamic(() => import("../../../../components/PdfHighlighter"), { ssr: false });

type Citation = { page: number; quote: string };

export default function DocumentViewPage() {
  const params = useParams<{ id: string }>();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [citations, setCitations] = useState<Citation[]>([]);

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";
    fetch(`${base}/documents/${params?.id}/url`)
      .then(r => r.json())
      .then(d => setPdfUrl(d.url))
      .catch(() => setPdfUrl(null));
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const singlePage = sp.get("page");
      const singleQuote = sp.get("q");
      const qjson = sp.get("qjson");
      let cites: Citation[] = [];
      if (qjson) {
        try {
          const decoded = JSON.parse(atob(qjson));
          if (Array.isArray(decoded)) cites = decoded.filter(Boolean);
        } catch {}
      } else if (singlePage && singleQuote) {
        cites = [{ page: Number(singlePage), quote: decodeURIComponent(singleQuote) }];
      }
      setCitations(cites);
    }
  }, [params?.id]);

  if (!pdfUrl) return <div className="p-6">Loading document...</div>;

  return (
    <div className="p-4">
      <div className="mb-3 text-sm text-gray-600">Document #{params?.id as any}</div>
      <PdfHighlighter url={pdfUrl} citations={citations} docId={String(params?.id)} />
    </div>
  );
}
