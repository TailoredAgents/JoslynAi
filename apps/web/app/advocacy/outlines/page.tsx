"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useBootstrappedChild } from "../../../lib/use-child";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "/api/joslyn";

type OutlineItem = {
  detail?: string;
  impact?: string | null;
  attempt?: string;
  outcome?: string | null;
  remedy?: string;
  rationale?: string | null;
  step?: string;
  timeline?: string | null;
  citations: string[];
};

interface OutlinePayload {
  summary?: string;
  facts?: OutlineItem[];
  attempts?: OutlineItem[];
  remedies?: OutlineItem[];
  next_steps?: OutlineItem[];
  closing?: string;
  document_id?: string | null;
  outline_kind?: string;
}

type CitationEntry = {
  span_id?: string;
  document_id: string;
  doc_name?: string;
  page?: number;
  snippet?: string;
};

type OutlineRecord = {
  id: string;
  status: string;
  outline_kind: string;
  child_id: string | null;
  outline: OutlinePayload;
  citations: CitationEntry[];
  updated_at?: string | null;
};

type OutlinesResponse = { outlines: OutlineRecord[] };

const STEPS = ["Review facts", "Customize requests", "Export letter"];

function StatusPill({ status }: { status: string }) {
  const normalized = (status || "").toLowerCase();
  const styles: Record<string, string> = {
    ready: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    pending: "bg-amber-50 text-amber-700 border border-amber-200",
    error: "bg-rose-50 text-rose-700 border border-rose-200",
    empty: "bg-slate-100 text-slate-600 border border-slate-200",
  };
  const labels: Record<string, string> = {
    ready: "Ready",
    pending: "Processing",
    error: "Needs attention",
    empty: "No matches",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${styles[normalized] || "bg-slate-100 text-slate-600 border border-slate-200"}`}>
      {labels[normalized] || status || "Unknown"}
    </span>
  );
}

function formatTimestamp(value?: string | null) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "";
  }
}

function buildClipboardText(outline: OutlinePayload) {
  const blocks: string[] = [];
  if (outline.summary) {
    blocks.push(`Summary: ${outline.summary}`);
  }
  (outline.facts || []).forEach((item, idx) => {
    blocks.push(`Fact ${idx + 1}: ${item.detail || ""}${item.impact ? ` (impact: ${item.impact})` : ""}`);
  });
  (outline.remedies || []).forEach((item, idx) => {
    blocks.push(`Remedy ${idx + 1}: ${item.remedy || ""}${item.rationale ? ` (why: ${item.rationale})` : ""}`);
  });
  (outline.next_steps || []).forEach((item, idx) => {
    blocks.push(`Next step ${idx + 1}: ${item.step || ""}${item.timeline ? ` (timeline: ${item.timeline})` : ""}`);
  });
  if (outline.closing) {
    blocks.push(`Closing: ${outline.closing}`);
  }
  return blocks.filter(Boolean).join("\n");
}

export default function AdvocacyOutlinesPage() {
  const router = useRouter();
  const { child, loading: childLoading, error: childError, refresh: refreshChild } = useBootstrappedChild();
  const childId = child?.id ?? null;

  const [outlines, setOutlines] = useState<OutlineRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [documentIdInput, setDocumentIdInput] = useState("");

  const selectedOutline = useMemo(() => outlines.find((outline) => outline.id === selectedId) || null, [outlines, selectedId]);
  const citationLookup = useMemo(() => {
    const map = new Map<string, number>();
    selectedOutline?.citations.forEach((entry, idx) => {
      if (entry?.span_id) {
        map.set(String(entry.span_id), idx + 1);
      }
    });
    return map;
  }, [selectedOutline]);

  async function fetchOutlines(id: string) {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_BASE}/children/${id}/advocacy/outlines`);
      if (!res.ok) {
        throw new Error(`Failed to load outlines (${res.status})`);
      }
      const data: OutlinesResponse = await res.json();
      const ordered = Array.isArray(data?.outlines) ? data.outlines : [];
      setOutlines(ordered);
      if (ordered.length) {
        setSelectedId((current) => current && ordered.some((outline) => outline.id === current) ? current : ordered[0].id);
      } else {
        setSelectedId(null);
      }
    } catch (err) {
      console.error(err);
      setErrorMessage("We could not load advocacy outlines just yet.");
    } finally {
      setLoading(false);
    }
  }

  async function createOutline(documentId?: string) {
    if (!childId) return;
    setQueueing(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_BASE}/children/${childId}/advocacy/outlines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(documentId ? { document_id: documentId } : documentIdInput ? { document_id: documentIdInput } : {}),
      });
      if (!res.ok) {
        throw new Error(`Failed to queue outline (${res.status})`);
      }
      const data = await res.json();
      await fetchOutlines(childId);
      if (data?.outline?.id) {
        setSelectedId(data.outline.id);
      }
      setDocumentIdInput("");
    } catch (err) {
      console.error(err);
      setErrorMessage("We could not queue the outline. Verify the document ID and try again.");
    } finally {
      setQueueing(false);
    }
  }

  async function regenerateOutline(outlineId: string) {
    if (!childId) return;
    setQueueing(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_BASE}/advocacy/outlines/${outlineId}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        throw new Error(`Failed to regenerate outline (${res.status})`);
      }
      await fetchOutlines(childId);
      setSelectedId(outlineId);
    } catch (err) {
      console.error(err);
      setErrorMessage("We could not regenerate that outline. Try again in a moment.");
    } finally {
      setQueueing(false);
    }
  }

  useEffect(() => {
    if (!childId) return;
    fetchOutlines(childId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId]);

  if (childLoading && !childId) {
    return <div className="mx-auto w-full max-w-6xl py-10 text-sm text-slate-500">Loading child workspace...</div>;
  }

  if (!childLoading && !childId) {
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

  const outline = selectedOutline?.outline || {};
  const facts = outline.facts || [];
  const attempts = outline.attempts || [];
  const remedies = outline.remedies || [];
  const nextSteps = outline.next_steps || [];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 py-8">
      <header className="rounded-3xl bg-gradient-to-r from-brand-500 to-brand-600 px-6 py-5 text-white shadow-uplift">
        <p className="text-xs uppercase tracking-wide text-brand-100/90">Advocacy outlines</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-2xl font-semibold">Build mediation or complaint outlines</h1>
          <button
            type="button"
            className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white transition hover:bg-white/25 disabled:opacity-40"
            onClick={() => childId && fetchOutlines(childId)}
            disabled={loading}
          >
            Refresh
          </button>
          <button
            type="button"
            className="inline-flex items-center rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-600 shadow-sm transition hover:bg-brand-100 disabled:opacity-40"
            onClick={() => createOutline()}
            disabled={queueing}
          >
            {queueing ? "Queuing..." : "Draft new outline"}
          </button>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-brand-50">
          Joslyn organizes evidence into a structured outline you can adapt into mediation or complaint letters.
        </p>
      </header>

      {errorMessage ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorMessage}</div>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-heading text-slate-900">Queue a new outline</h2>
            <p className="mt-1 text-xs text-slate-500">Add a document ID to focus on a specific evaluation, or leave blank to use the latest file.</p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                className="w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 focus:border-brand-400 focus:outline-none focus:ring focus:ring-brand-200/60"
                placeholder="Document ID (optional)"
                value={documentIdInput}
                onChange={(event) => setDocumentIdInput(event.target.value)}
              />
              <button
                type="button"
                className="inline-flex items-center rounded-full bg-brand-500 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600 disabled:opacity-40"
                onClick={() => createOutline(documentIdInput || undefined)}
                disabled={queueing}
              >
                {queueing ? "Queuing..." : "Draft outline"}
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-heading text-slate-900">Outlines</h2>
              <p className="text-xs text-slate-500">Updated {outlines[0]?.updated_at ? formatTimestamp(outlines[0].updated_at) : "just now"}</p>
            </div>
            {loading ? (
              <p className="mt-4 text-xs text-slate-500">Collecting evidence...</p>
            ) : outlines.length ? (
              <ul className="mt-4 space-y-3">
                {outlines.map((entry) => (
                  <li
                    key={entry.id}
                    className={`flex flex-col gap-2 rounded-3xl border px-5 py-4 text-sm transition hover:border-brand-200 ${selectedId === entry.id ? "border-brand-300 bg-brand-50/40" : "border-slate-200 bg-white"}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{entry.outline_kind === "complaint" ? "State complaint" : "Mediation outline"}</p>
                        <p className="text-xs text-slate-500">{formatTimestamp(entry.updated_at) || "Just now"}</p>
                      </div>
                      <StatusPill status={entry.status} />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <button
                        type="button"
                        className="inline-flex items-center rounded-full border border-brand-200 px-3 py-1 font-semibold text-brand-600 transition hover:border-brand-400 hover:text-brand-700"
                        onClick={() => setSelectedId(entry.id)}
                      >
                        {selectedId === entry.id ? "Selected" : "Review"}
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center rounded-full border border-slate-200 px-3 py-1 text-slate-600 transition hover:border-slate-400 hover:text-slate-700"
                        onClick={() => regenerateOutline(entry.id)}
                        disabled={queueing}
                      >
                        Regenerate
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-xs text-slate-500">No outlines yet. Draft one above to get started.</p>
            )}
          </div>

          {selectedOutline ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-heading text-slate-900">Outline details</h2>
                <StatusPill status={selectedOutline.status} />
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                {STEPS.map((step, idx) => (
                  <div key={step} className="flex items-center gap-2">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold ${idx === 0 ? "border-brand-300 text-brand-600" : idx === 1 ? "border-brand-200 text-brand-600" : "border-slate-300 text-slate-500"}`}>
                      {idx + 1}
                    </span>
                    <span>{step}</span>
                    {idx < STEPS.length - 1 ? <span className="text-slate-300">&gt;</span> : null}
                  </div>
                ))}
              </div>

              {outline.summary ? (
                <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">{outline.summary}</div>
              ) : null}

              <div className="mt-4 space-y-4 text-sm">
                {facts.length ? (
                  <section>
                    <h3 className="mb-2 text-sm font-semibold text-slate-900">Background facts</h3>
                    <ul className="space-y-2 text-slate-700">
                      {facts.map((item, idx) => (
                        <li key={`fact-${idx}`} className="rounded-2xl bg-slate-50 px-3 py-2">
                          <p className="font-medium">{item.detail}</p>
                          {item.impact ? <p className="text-xs text-slate-500">Impact: {item.impact}</p> : null}
                          {(item.citations || [])
                            .map((spanId) => citationLookup.get(String(spanId)))
                            .filter(Boolean)
                            .map((num) => (
                              <span key={`${idx}-fact-${num}`} className="mr-1 text-[11px] text-brand-600">[{num}]</span>
                            ))}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {attempts.length ? (
                  <section>
                    <h3 className="mb-2 text-sm font-semibold text-slate-900">Attempts to resolve</h3>
                    <ul className="space-y-2 text-slate-700">
                      {attempts.map((item, idx) => (
                        <li key={`attempt-${idx}`} className="rounded-2xl bg-slate-50 px-3 py-2">
                          <p className="font-medium">{item.attempt}</p>
                          {item.outcome ? <p className="text-xs text-slate-500">Outcome: {item.outcome}</p> : null}
                          {(item.citations || [])
                            .map((spanId) => citationLookup.get(String(spanId)))
                            .filter(Boolean)
                            .map((num) => (
                              <span key={`${idx}-attempt-${num}`} className="mr-1 text-[11px] text-brand-600">[{num}]</span>
                            ))}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {remedies.length ? (
                  <section>
                    <h3 className="mb-2 text-sm font-semibold text-slate-900">Requested remedies</h3>
                    <ul className="space-y-2 text-slate-700">
                      {remedies.map((item, idx) => (
                        <li key={`remedy-${idx}`} className="rounded-2xl bg-slate-50 px-3 py-2">
                          <p className="font-medium">{item.remedy}</p>
                          {item.rationale ? <p className="text-xs text-slate-500">Why: {item.rationale}</p> : null}
                          {(item.citations || [])
                            .map((spanId) => citationLookup.get(String(spanId)))
                            .filter(Boolean)
                            .map((num) => (
                              <span key={`${idx}-remedy-${num}`} className="mr-1 text-[11px] text-brand-600">[{num}]</span>
                            ))}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {nextSteps.length ? (
                  <section>
                    <h3 className="mb-2 text-sm font-semibold text-slate-900">Next steps</h3>
                    <ul className="space-y-2 text-slate-700">
                      {nextSteps.map((item, idx) => (
                        <li key={`step-${idx}`} className="rounded-2xl bg-slate-50 px-3 py-2">
                          <p className="font-medium">{item.step}</p>
                          {item.timeline ? <p className="text-xs text-slate-500">Timeline: {item.timeline}</p> : null}
                          {(item.citations || [])
                            .map((spanId) => citationLookup.get(String(spanId)))
                            .filter(Boolean)
                            .map((num) => (
                              <span key={`${idx}-step-${num}`} className="mr-1 text-[11px] text-brand-600">[{num}]</span>
                            ))}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {outline.closing ? (
                  <section>
                    <h3 className="mb-2 text-sm font-semibold text-slate-900">Closing</h3>
                    <p className="rounded-2xl bg-slate-50 px-3 py-2 text-slate-700">{outline.closing}</p>
                  </section>
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  className="inline-flex items-center rounded-full border border-brand-200 px-3 py-1 text-brand-600 transition hover:border-brand-400 hover:text-brand-700"
                  onClick={() => navigator.clipboard.writeText(buildClipboardText(outline))}
                >
                  Copy outline
                </button>
                <button
                  type="button"
                  className="inline-flex items-center rounded-full border border-slate-200 px-3 py-1 text-slate-600 transition hover:border-slate-400 hover:text-slate-700"
                  onClick={() => router.push(`/copilot?child=${childId}`)}
                >
                  Ask Joslyn to draft letter
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="space-y-5">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-heading text-slate-900">Tips</p>
            <ul className="mt-3 space-y-2 text-xs text-slate-600">
              <li>Use the facts section to anchor your outline in documented evidence.</li>
              <li>Update remedies before exporting to reflect the caregiver’s requested resolution.</li>
              <li>Copy the outline into your mediation or complaint letter once each section looks right.</li>
            </ul>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-heading text-slate-900">Need more help?</p>
            <p className="mt-2 text-xs text-slate-500">Ask Joslyn in chat to turn this outline into a letter or role-play the mediation conversation.</p>
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
