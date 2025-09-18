"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useBootstrappedChild } from "../../lib/use-child";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

type GlossaryEntry = {
  term: string;
  definition: string;
};

type CitationEntry = {
  span_id?: string;
  document_id: string;
  doc_name?: string;
  page?: number;
  snippet?: string;
};

type ResearchSummary = {
  id: string;
  status: string;
  document_id: string;
  document_name: string;
  document_type?: string | null;
  summary: string;
  teacher_voice: string;
  caregiver_voice: string;
  reading_level?: string | null;
  glossary: GlossaryEntry[];
  citations: CitationEntry[];
  updated_at?: string | null;
};

type SummariesResponse = {
  summaries: ResearchSummary[];
};

function StatusPill({ status }: { status: string }) {
  const normalized = (status || "").toLowerCase();
  const map: Record<string, string> = {
    ready: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    pending: "bg-amber-50 text-amber-700 border border-amber-200",
    error: "bg-rose-50 text-rose-700 border border-rose-200",
  };
  const labels: Record<string, string> = {
    ready: "Ready",
    pending: "Processing",
    error: "Needs attention",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${map[normalized] || "bg-slate-100 text-slate-600 border border-slate-200"}`}>
      {labels[normalized] || status || "Unknown"}
    </span>
  );
}

function formatTime(value?: string | null) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "";
  }
}

export default function ResearchSummariesPage() {
  const router = useRouter();
  const { child, loading: childLoading, error: childError, refresh: refreshChild } = useBootstrappedChild();
  const childId = child?.id ?? null;
  const childReady = Boolean(childId);

  const [summaries, setSummaries] = useState<ResearchSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [queueing, setQueueing] = useState(false);
  const [docIdInput, setDocIdInput] = useState("");

  async function loadSummaries(targetChildId: string) {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_BASE}/children/${targetChildId}/research`);
      if (!res.ok) {
        throw new Error(`Failed to load summaries (${res.status})`);
      }
      const data: SummariesResponse = await res.json();
      setSummaries(Array.isArray(data?.summaries) ? data.summaries : []);
    } catch (err) {
      console.error(err);
      setErrorMessage("We could not load research explainers yet.");
    } finally {
      setLoading(false);
    }
  }

  async function queueSummary(documentId?: string) {
    if (!childId) return;
    const targetId = (documentId ?? docIdInput).trim();
    if (!targetId) return;
    setQueueing(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_BASE}/documents/${targetId}/explain`, {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error(`Failed to queue summary (${res.status})`);
      }
      setDocIdInput("");
      await loadSummaries(childId);
    } catch (err) {
      console.error(err);
      setErrorMessage("We could not queue that summary. Verify the document ID and try again.");
    } finally {
      setQueueing(false);
    }
  }

  useEffect(() => {
    if (!childId) return;
    loadSummaries(childId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId]);

  const orderedSummaries = useMemo(() => {
    return [...summaries].sort((a, b) => {
      const at = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const bt = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return bt - at;
    });
  }, [summaries]);

  if (childLoading && !childReady) {
    return <div className="mx-auto w-full max-w-6xl py-10 text-sm text-slate-500">Loading child workspace...</div>;
  }

  if (!childLoading && !childReady) {
    return (
      <div className="mx-auto w-full max-w-6xl py-10 text-sm text-slate-500">
        <p className="mb-3 font-semibold text-rose-500">Unable to load your child workspace.</p>
        {childError ? <p className="mb-4 text-xs text-rose-400">{childError}</p> : null}
        <button
          type="button"
          className="inline-flex items-center rounded-full border border-brand-200 px-4 py-2 text-xs font-semibold text-brand-600 transition hover:border-brand-400 hover:text-brand-700"
          onClick={refreshChild}
        >
          Try again
        </button>
      </div>
    );
  }

  if (!childId) {
    return null;
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 py-8">
      <header className="rounded-3xl bg-gradient-to-r from-brand-500 to-brand-600 px-6 py-5 text-white shadow-uplift">
        <p className="text-xs uppercase tracking-wide text-brand-100/90">Research explainers</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-2xl font-semibold">Summaries for families</h1>
          <button
            type="button"
            className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white transition hover:bg-white/25 disabled:opacity-40"
            onClick={() => loadSummaries(childId)}
            disabled={loading}
          >
            Refresh
          </button>
          <button
            type="button"
            className="inline-flex items-center rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-600 shadow-sm transition hover:bg-brand-100 disabled:opacity-40"
            onClick={() => queueSummary() }
            disabled={queueing}
      >
        {queueing ? "Queuing..." : "Summarize document"}
      </button>
    </div>
    <p className="mt-2 max-w-3xl text-sm text-brand-50">
      Joslyn translates evaluations into plain-language digests with citations, caregiver/teacher voices, and a glossary you can share.
    </p>
  </header>

  {errorMessage ? (
    <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorMessage}</div>
  ) : null}

  <section className="grid gap-6 lg:grid-cols-[2fr,1fr]">
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-heading text-slate-900">Request a new explainer</h2>
        <p className="mt-1 text-xs text-slate-500">
          Paste a document ID (evaluation or report) and Joslyn will draft a plain-language summary with citations.
        </p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            className="w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 focus:border-brand-400 focus:outline-none focus:ring focus:ring-brand-200/60"
            placeholder="Document ID"
            value={docIdInput}
            onChange={(event) => setDocIdInput(event.target.value)}
          />
          <button
            type="button"
            className="inline-flex items-center rounded-full bg-brand-500 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600 disabled:opacity-40"
            onClick={() => queueSummary()}
            disabled={queueing || !docIdInput.trim()}
          >
            {queueing ? "Queuing..." : "Summarize"}
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-heading text-slate-900">Explain summaries</h2>
          <p className="text-xs text-slate-500">Updated {orderedSummaries[0]?.updated_at ? formatTime(orderedSummaries[0].updated_at) : "just now"}</p>
        </div>

        {loading ? (
          <p className="mt-4 text-xs text-slate-500">Scanning and summarizing...</p>
        ) : orderedSummaries.length ? (
          <ul className="mt-4 space-y-4">
            {orderedSummaries.map((summary) => (
              <li key={summary.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{summary.document_name}</p>
                    <p className="text-xs text-slate-500">{formatTime(summary.updated_at) || "Just now"}</p>
                  </div>
                  <StatusPill status={summary.status} />
                </div>

                {summary.reading_level ? (
                  <p className="mt-2 text-xs text-slate-500">Reading level: {summary.reading_level}</p>
                ) : null}

                <div className="mt-3 space-y-3 text-sm text-slate-700">
                  {summary.summary ? (
                    <div>
                      <p className="font-semibold text-slate-800">Family summary</p>
                      <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{summary.summary}</p>
                    </div>
                  ) : null}
                  {summary.teacher_voice ? (
                    <div>
                      <p className="font-semibold text-slate-800">Teacher version</p>
                      <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{summary.teacher_voice}</p>
                    </div>
                  ) : null}
                  {summary.caregiver_voice ? (
                    <div>
                      <p className="font-semibold text-slate-800">Caregiver version</p>
                      <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{summary.caregiver_voice}</p>
                    </div>
                  ) : null}
                  {summary.glossary.length ? (
                    <div>
                      <p className="font-semibold text-slate-800">Glossary</p>
                      <ul className="mt-2 space-y-1 text-xs text-slate-600">
                        {summary.glossary.map((item, idx) => (
                          <li key={`${summary.id}-glossary-${idx}`}>
                            <span className="font-semibold text-slate-700">{item.term}:</span> {item.definition}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>

                <div className="mt-3 space-y-2 text-xs text-slate-500">
                  {summary.citations.length ? (
                    <div className="rounded-2xl bg-white px-4 py-3">
                      <p className="font-semibold text-slate-700">Citations</p>
                      <ul className="mt-2 space-y-2">
                        {summary.citations.map((citation, idx) => (
                          <li key={`${summary.id}-citation-${idx}`}>
                            <span className="font-semibold text-brand-600">[{idx + 1}]</span>
                            <span className="font-medium text-slate-700"> {citation.doc_name || summary.document_name}</span>
                            {typeof citation.page === "number" ? <span className="text-slate-500"> (p.{citation.page})</span> : null}
                            {citation.snippet ? <p className="mt-1 text-[11px] text-slate-500">"{citation.snippet}"</p> : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    className="inline-flex items-center rounded-full border border-brand-200 px-3 py-1 text-brand-600 transition hover:border-brand-400 hover:text-brand-700"
                    onClick={() => queueSummary(summary.document_id)}
                    disabled={queueing}
                  >
                    Regenerate
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center rounded-full border border-slate-200 px-3 py-1 text-slate-600 transition hover:border-slate-400 hover:text-slate-700"
                    onClick={() => router.push(`/copilot?child=${childId}`)}
                  >
                    Ask Joslyn about this
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-xs text-slate-500">No research explainers yet. Upload a report or run the summarizer to get started.</p>
        )}
      </div>
    </div>

    <aside className="space-y-5">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-heading text-slate-900">How to use these summaries</p>
        <p className="mt-2 text-xs text-slate-500">
          Share the family version with caregivers, the teacher version with staff, and highlight glossary terms for meetings.
          Each citation links back to the evaluation page so you can reference the evidence during discussions.
        </p>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-heading text-slate-900">Need next steps?</p>
        <p className="mt-2 text-xs text-slate-500">
          Ask Joslyn to draft a plain-language follow-up note, or to translate the summary for a specific teacher or advocate.
        </p>
        <button
          type="button"
          className="mt-3 inline-flex items-center rounded-full border border-brand-200 px-4 py-2 text-xs font-semibold text-brand-600 transition hover:border-brand-400 hover:text-brand-700"
          onClick={() => router.push(`/copilot?child=${childId}`)}
        >
          Ask Joslyn
        </button>
      </div>
    </aside>
  </section>
</div>
  );
}
