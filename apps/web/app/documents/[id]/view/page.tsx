"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";

const PdfHighlighter = dynamic(() => import("../../../../components/PdfHighlighter"), { ssr: false });

type Citation = { page: number; quote: string };

export default function DocumentViewPage() {
  const params = useParams<{ id: string }>();
  const docId = params?.id ? String(params.id) : "";
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!docId) return;
    const base = process.env.NEXT_PUBLIC_API_BASE_URL || "/api/joslyn";

    fetch(`${base}/documents/${docId}/url`)
      .then((r) => r.json())
      .then((d) => setPdfUrl(d.url))
      .catch(() => setError("We could not load the original file just yet."));

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
        } catch {
          // ignore
        }
      } else if (singlePage && singleQuote) {
        cites = [{ page: Number(singlePage), quote: decodeURIComponent(singleQuote) }];
      }
      setCitations(cites);
    }
  }, [docId]);

  const citationSummary = useMemo(() => {
    if (citations.length === 0) return [];
    return citations.slice(0, 6).map((cite, idx) => ({ ...cite, id: `${cite.page}-${idx}` }));
  }, [citations]);

  if (!docId) {
    return <div className="p-6 text-sm text-slate-500">Loading documentâ€¦</div>;
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 py-8">
      <header className="space-y-3">
        <span className="inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-brand-600">
          Document preview
        </span>
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <h1 className="text-3xl font-heading text-slate-900">IEP document #{docId}</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Browse the original PDF and jump straight to key highlights Joslyn discovered. Keep your notes side-by-side
              during meetings.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {pdfUrl && (
              <a
                href={pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-full border border-brand-200 px-4 py-2 text-sm font-semibold text-brand-600 transition hover:border-brand-400"
              >
                Download original
              </a>
            )}
            <Link
              href={`/documents/${docId}/brief`}
              className="inline-flex items-center rounded-full bg-brand-500 px-5 py-2 text-sm font-semibold text-white shadow-uplift transition hover:bg-brand-600"
            >
              View Joslyn AI brief
            </Link>
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
          {pdfUrl ? (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              <PdfHighlighter url={pdfUrl} citations={citations} docId={docId} />
            </div>
          ) : (
            <div className="grid h-96 place-items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
              {error || "Preparing the PDF previewâ€¦"}
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <div className="rounded-3xl border border-brand-100 bg-brand-50/70 p-6 text-sm text-brand-700">
            <p className="font-heading text-sm uppercase tracking-[0.3em] text-brand-600/70">Quick summary</p>
            <p className="mt-2 text-sm">{citations.length > 0 ? `${citations.length} highlighted snippets ready to explore.` : "Upload more minutes or goals to see highlights here."}</p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-heading text-slate-700">Highlights to review</p>
            {citationSummary.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500">No highlighted snippets yet. Ask Joslyn AI a question or run a brief to generate some.</p>
            ) : (
              <ul className="mt-3 space-y-3 text-sm text-slate-600">
                {citationSummary.map((c) => (
                  <li key={c.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Page {c.page}</span>
                      <Link className="font-semibold text-brand-600" href={`/documents/${docId}/view?page=${c.page}&q=${encodeURIComponent(c.quote)}`}>
                        Jump to page â†’
                      </Link>
                    </div>
                    <p className="mt-2 text-sm text-slate-700">{c.quote.slice(0, 160)}{c.quote.length > 160 ? "ï¿½" : ""}</p>
                  </li>
                ))}
              </ul>
            )}
            {citations.length > 6 && (
              <Link className="mt-3 inline-flex items-center text-xs font-semibold text-brand-600" href={`/documents/${docId}/brief`}>
                View all citations in the brief ?
              </Link>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 text-xs text-slate-500">
            <p className="font-heading text-sm text-slate-700">Next best steps</p>
            <ul className="mt-3 space-y-2 leading-relaxed">
              <li>- Ask Joslyn &quot;What services and minutes are listed?&quot; for a quick summary.</li>
              <li>- Draft an evaluation request under Letters if you notice missing supports.</li>
              <li>- Share a bilingual snapshot via About My Child when onboarding new staff.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

