"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useBootstrappedChild } from "../../lib/use-child";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "/api/joslyn";

type RecommendationEntry = {
  id: string;
  title?: string;
  recommendation: string;
  rationale: string;
  translation?: {
    recommendation?: string;
    rationale?: string;
  };
  citations: string[];
};

type RecommendationRecord = {
  id: string;
  status: string;
  source_kind: string;
  locale: string;
  recommendations: RecommendationEntry[];
  citations: Array<{
    span_id?: string;
    document_id: string;
    doc_name?: string;
    page?: number;
    snippet?: string;
  }>;
  updated_at?: string | null;
};

type RecommendationsResponse = {
  status: string;
  record: RecommendationRecord | null;
};

const SOURCES = [
  { value: "auto", label: "Auto" },
  { value: "evaluation", label: "Evaluations" },
  { value: "iep", label: "IEP" },
];

function StatusPill({ status }: { status: string }) {
  const normalized = (status || "").toLowerCase();
  const map: Record<string, string> = {
    ready: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    pending: "bg-amber-50 text-amber-700 border border-amber-200",
    empty: "bg-slate-100 text-slate-600 border border-slate-200",
    error: "bg-rose-50 text-rose-700 border border-rose-200",
  };
  const labelMap: Record<string, string> = {
    ready: "Ready",
    pending: "Processing",
    empty: "No match",
    error: "Needs attention",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${map[normalized] || "bg-slate-100 text-slate-600 border border-slate-200"}`}>
      {labelMap[normalized] || status || "Unknown"}
    </span>
  );
}

function formatWhen(value?: string | null) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch (err) {
    console.error(err);
    return "";
  }
}

export default function RecommendationsPage() {
  const router = useRouter();
  const { child, loading: childLoading, error: childError, refresh: refreshChild } = useBootstrappedChild();
  const childId = child?.id ?? null;
  const childReady = Boolean(childId);

  const [source, setSource] = useState<string>("auto");
  const [record, setRecord] = useState<RecommendationRecord | null>(null);
  const [status, setStatus] = useState<string>("missing");
  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [showSpanish, setShowSpanish] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadRecommendations(targetChildId: string, selectedSource: string) {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_BASE}/children/${targetChildId}/recommendations?source=${selectedSource}`);
      if (!res.ok) {
        throw new Error(`Failed to load recommendations (${res.status})`);
      }
      const data: RecommendationsResponse = await res.json();
      setStatus(data?.status || "missing");
      setRecord(data?.record || null);
    } catch (err) {
      console.error(err);
      setErrorMessage("We could not load recommendations just yet.");
    } finally {
      setLoading(false);
    }
  }

  async function regenerateRecommendations() {
    if (!childId) return;
    setRegenerating(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_BASE}/children/${childId}/recommendations/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      });
      if (!res.ok) {
        throw new Error(`Failed to queue recommendations (${res.status})`);
      }
      setStatus("pending");
      await loadRecommendations(childId, source);
    } catch (err) {
      console.error(err);
      setErrorMessage("We could not queue the recommender. Try again in a moment.");
    } finally {
      setRegenerating(false);
    }
  }

  useEffect(() => {
    if (!childId) return;
    loadRecommendations(childId, source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId, source]);

  const citationsBySpan = useMemo(() => {
    const map = new Map<string, { index: number; label: string }>();
    const citations = record?.citations ?? [];
    citations.forEach((entry, idx) => {
      if (entry?.span_id) {
        map.set(String(entry.span_id), { index: idx + 1, label: `[${idx + 1}]` });
      }
    });
    return map;
  }, [record?.citations]);

  const visibleRecommendations = useMemo(() => {
    return record?.recommendations ?? [];
  }, [record?.recommendations]);

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
        <p className="text-xs uppercase tracking-wide text-brand-100/90">Recommendations workspace</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-2xl font-semibold">Accommodations and services</h1>
          <StatusPill status={status} />
          <button
            type="button"
            className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white transition hover:bg-white/25 disabled:opacity-40"
            onClick={() => loadRecommendations(childId, source)}
            disabled={loading}
          >
            Refresh
          </button>
          <button
            type="button"
            className="inline-flex items-center rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-600 shadow-sm transition hover:bg-brand-100 disabled:opacity-40"
            onClick={regenerateRecommendations}
            disabled={regenerating}
          >
            {regenerating ? "Queuing..." : "Regenerate"}
          </button>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-brand-50">
          Joslyn reviews evaluations and IEPs to surface 3-5 supports with citations you can drop into letters or meetings. Toggle Spanish output to share with caregivers.
        </p>
      </header>

      {errorMessage ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorMessage}</div>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-full border border-slate-200 bg-white p-1 text-xs font-semibold text-slate-600 shadow-sm">
              {SOURCES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={`rounded-full px-3 py-1 transition ${source === item.value ? "bg-brand-500 text-white" : "text-slate-600 hover:text-brand-600"}`}
                  onClick={() => setSource(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
              <input
                type="checkbox"
                checked={showSpanish}
                onChange={(event) => setShowSpanish(event.target.checked)}
              />
              <span>Show Spanish translations</span>
            </label>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-heading text-slate-900">Recommendations</h2>
              <p className="text-xs text-slate-500">Updated {formatWhen(record?.updated_at) || "just now"}</p>
            </div>

            {loading ? (
              <p className="mt-4 text-xs text-slate-500">Scanning documents...</p>
            ) : visibleRecommendations.length ? (
              <ul className="mt-4 space-y-4">
                {visibleRecommendations.map((entry, idx) => {
                  const english = entry.recommendation || "";
                  const rationale = entry.rationale || "";
                  const translation = entry.translation || {};
                  const spanishLine = showSpanish ? translation.recommendation || "" : "";
                  const spanishReason = showSpanish ? translation.rationale || "" : "";
                  const citationBadges = (entry.citations || [])
                    .map((span) => citationsBySpan.get(String(span)))
                    .filter((value): value is { index: number; label: string } => Boolean(value));
                  return (
                    <li key={entry.id || idx} className="rounded-3xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{entry.title || `Recommendation ${idx + 1}`}</p>
                          {citationBadges.length ? (
                            <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-brand-600">
                              {citationBadges.map((badge) => (
                                <span key={badge.index} className="inline-flex items-center rounded-full border border-brand-200 px-2 py-0.5">
                                  {badge.label}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      {english ? (
                        <div className="mt-3 space-y-2 text-sm text-slate-700">
                          <p className="font-semibold text-slate-800">What to request</p>
                          <p>{english}</p>
                          {spanishLine ? (
                            <p className="rounded-2xl bg-white px-3 py-2 text-xs text-slate-600">
                              <span className="font-semibold text-slate-700">En espanol:</span> {spanishLine}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                      {rationale ? (
                        <div className="mt-3 space-y-2 text-sm text-slate-700">
                          <p className="font-semibold text-slate-800">Why it matters</p>
                          <p>{rationale}</p>
                          {spanishReason ? (
                            <p className="rounded-2xl bg-white px-3 py-2 text-xs text-slate-600">
                              <span className="font-semibold text-slate-700">En espanol:</span> {spanishReason}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="mt-4 flex flex-wrap gap-2 text-xs">
                        <button
                          type="button"
                          className="inline-flex items-center rounded-full border border-brand-200 px-3 py-1 text-brand-600 transition hover:border-brand-400 hover:text-brand-700"
                          onClick={() => {
                            const parts = [english, rationale].filter(Boolean);
                            navigator.clipboard.writeText(parts.join("\n\n"));
                          }}
                        >
                          Copy
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
                  );
                })}
              </ul>
            ) : (
              <p className="mt-4 text-xs text-slate-500">No recommendations yet. Regenerate after uploading an evaluation or IEP.</p>
            )}
          </div>
        </div>

        <aside className="space-y-5">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-heading text-slate-900">How Joslyn decides</p>
            <p className="mt-2 text-xs text-slate-500">
              Recommendations always cite the source excerpts. If you need Joslyn to focus on a specific evaluation domain,
              switch the source filter above or upload new documents with clearer findings.
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-heading text-slate-900">Next steps</p>
            <ul className="mt-3 space-y-2 text-xs text-slate-600">
              <li>Drop the supports into letters or meeting agendas from the Copilot chat.</li>
              <li>Share the Spanish versions with caregivers to build buy-in.</li>
              <li>Ask Joslyn to tailor the rationale for a specific teacher or therapist.</li>
            </ul>
          </div>
        </aside>
      </section>
    </div>
  );
}

