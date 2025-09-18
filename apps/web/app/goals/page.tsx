"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useBootstrappedChild } from "../../lib/use-child";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "/api/joslyn";

type RubricRow = {
  criterion: string;
  rating: string;
  notes?: string;
};

type Rewrite = {
  id: string;
  status: string;
  goal_identifier: string;
  document_id?: string | null;
  rubric: RubricRow[];
  rewrite: string;
  baseline: string;
  measurement_plan: string;
  citations: string[];
  updated_at?: string | null;
};

type RewriteResponse = {
  rewrites: Rewrite[];
};

function StatusPill({ status }: { status: string }) {
  const normalized = (status || "").toLowerCase();
  const styles: Record<string, string> = {
    draft: "bg-amber-50 text-amber-700 border border-amber-200",
    pending: "bg-amber-50 text-amber-700 border border-amber-200",
    confirmed: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  };
  const fallback = "bg-slate-100 text-slate-600 border border-slate-200";
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${styles[normalized] || fallback}`}>
      {normalized === "draft"
        ? "Draft"
        : normalized === "pending"
        ? "Queued"
        : normalized === "confirmed"
        ? "Published"
        : status || "Unknown"}
    </span>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "just now";
  try {
    return new Date(value).toLocaleString();
  } catch (err) {
    console.error("formatDate", err);
    return "just now";
  }
}

export default function SmartGoalsPage() {
  const router = useRouter();
  const { child, loading: childLoading, error: childError, refresh: refreshChild } = useBootstrappedChild();
  const childId = child?.id ?? null;
  const childReady = Boolean(childId);

  const [goalIdentifier, setGoalIdentifier] = useState("");
  const [goalText, setGoalText] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingRewrites, setLoadingRewrites] = useState(false);
  const [rewrites, setRewrites] = useState<Rewrite[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadRewrites(targetChildId: string) {
    setLoadingRewrites(true);
    setErrorMessage(null);
    try {
      const query = documentId.trim() ? `?document_id=${encodeURIComponent(documentId.trim())}` : "";
      const res = await fetch(`${API_BASE}/children/${targetChildId}/goals/smart${query}`);
      if (!res.ok) {
        throw new Error(`Failed to load rewrites: ${res.status}`);
      }
      const data: RewriteResponse = await res.json();
      setRewrites(Array.isArray(data?.rewrites) ? data.rewrites : []);
    } catch (err) {
      console.error(err);
      setErrorMessage("We could not load SMART goal rewrites just yet.");
    } finally {
      setLoadingRewrites(false);
    }
  }

  async function submitGoal() {
    if (!childId || !goalIdentifier.trim() || !goalText.trim()) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_BASE}/children/${childId}/goals/smart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal_identifier: goalIdentifier.trim(),
          goal_text: goalText.trim(),
          document_id: documentId.trim() || undefined,
        }),
      });
      if (!res.ok) {
        throw new Error(`Failed to submit goal: ${res.status}`);
      }
      setGoalIdentifier("");
      setGoalText("");
      setSubmitting(false);
      await loadRewrites(childId);
    } catch (err) {
      console.error(err);
      setSubmitting(false);
      setErrorMessage("We could not queue that goal yet. Please try again.");
    }
  }

  async function confirmRewrite(rewriteId: string) {
    if (!childId || !rewriteId) return;
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_BASE}/children/${childId}/goals/${rewriteId}/confirm`, {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error(`Failed to confirm rewrite: ${res.status}`);
      }
      await loadRewrites(childId);
    } catch (err) {
      console.error(err);
      setErrorMessage("Confirmation did not stick. Refresh and try again.");
    }
  }

  useEffect(() => {
    if (!childId) return;
    loadRewrites(childId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId]);

  const sortedRewrites = useMemo(() => {
    return [...rewrites].sort((a, b) => {
      const at = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const bt = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return bt - at;
    });
  }, [rewrites]);

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
        <p className="text-xs uppercase tracking-wide text-brand-100/90">SMART goal assistant</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-2xl font-semibold">Score and rewrite goals</h1>
          <button
            type="button"
            className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white transition hover:bg-white/25 disabled:opacity-40"
            onClick={() => loadRewrites(childId)}
            disabled={loadingRewrites}
          >
            Refresh
          </button>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-brand-50">
          Paste any IEP goal and Joslyn will score it against the SMART rubric, rewrite it with clearer baselines and measurement plans, and cite where the data came from.
        </p>
      </header>

      {errorMessage ? <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorMessage}</div> : null}

      <section className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-heading text-slate-900">Submit a goal</h2>
            <p className="mt-1 text-xs text-slate-500">Include the identifier teams will recognize and optionally the document ID you want citations tied to.</p>
            <div className="mt-4 space-y-3 text-sm">
              <input
                className="w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 focus:border-brand-400 focus:outline-none focus:ring focus:ring-brand-200/60"
                placeholder="Goal identifier (e.g., Reading-Goal-2024)"
                value={goalIdentifier}
                onChange={(event) => setGoalIdentifier(event.target.value)}
              />
              <textarea
                className="h-32 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 focus:border-brand-400 focus:outline-none focus:ring focus:ring-brand-200/60"
                placeholder="Paste the goal text"
                value={goalText}
                onChange={(event) => setGoalText(event.target.value)}
              />
              <input
                className="w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 focus:border-brand-400 focus:outline-none focus:ring focus:ring-brand-200/60"
                placeholder="Optional IEP document ID for citations"
                value={documentId}
                onChange={(event) => setDocumentId(event.target.value)}
              />
              <button
                type="button"
                className="inline-flex items-center rounded-full bg-brand-500 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600 disabled:opacity-40"
                onClick={submitGoal}
                disabled={submitting || !goalIdentifier.trim() || !goalText.trim()}
              >
                {submitting ? "Submitting..." : "Score and rewrite"}
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-heading text-slate-900">Recent rewrites</h2>
            {loadingRewrites ? (
              <p className="mt-3 text-xs text-slate-500">Loading...</p>
            ) : sortedRewrites.length ? (
              <ul className="mt-3 space-y-3">
                {sortedRewrites.map((rewrite) => (
                  <li key={rewrite.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{rewrite.goal_identifier}</p>
                        <p className="text-xs text-slate-500">Updated {formatDate(rewrite.updated_at)}</p>
                      </div>
                      <StatusPill status={rewrite.status} />
                    </div>
                    <div className="mt-3 space-y-3 text-sm text-slate-600">
                      {rewrite.rubric.length ? (
                        <div>
                          <p className="font-semibold text-slate-800">SMART rubric</p>
                          <ul className="mt-1 space-y-1 text-xs">
                            {rewrite.rubric.map((item, idx) => (
                              <li key={`${rewrite.id}-rubric-${idx}`}>
                                <span className="font-semibold text-slate-700">{item.criterion}:</span> {item.rating}
                                {item.notes ? <span className="text-slate-500"> - {item.notes}</span> : null}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {rewrite.rewrite ? (
                        <div>
                          <p className="font-semibold text-slate-800">Rewritten goal</p>
                          <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{rewrite.rewrite}</p>
                        </div>
                      ) : null}
                      {rewrite.baseline ? (
                        <div>
                          <p className="font-semibold text-slate-800">Baseline</p>
                          <p className="mt-1 text-sm text-slate-600">{rewrite.baseline}</p>
                        </div>
                      ) : null}
                      {rewrite.measurement_plan ? (
                        <div>
                          <p className="font-semibold text-slate-800">Measurement plan</p>
                          <p className="mt-1 text-sm text-slate-600">{rewrite.measurement_plan}</p>
                        </div>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center rounded-full border border-brand-200 px-3 py-1 text-xs font-semibold text-brand-600 transition hover:border-brand-400 hover:text-brand-700 disabled:opacity-40"
                          disabled={rewrite.status === "confirmed"}
                          onClick={() => confirmRewrite(rewrite.id)}
                        >
                          {rewrite.status === "confirmed" ? "Confirmed" : "Mark as confirmed"}
                        </button>
                        {rewrite.citations.length ? (
                          <span className="inline-flex items-center rounded-full border border-slate-200 px-3 py-1 text-[11px] font-medium text-slate-500">
                            {rewrite.citations.length} citation{rewrite.citations.length === 1 ? "" : "s"}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-slate-500">No goal rewrites yet. Submit a goal to see your first draft.</p>
            )}
          </div>
        </div>

        <aside className="space-y-5">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-heading text-slate-900">Tips</p>
            <ul className="mt-3 space-y-2 text-xs text-slate-600">
              <li>Include the child's identifier if you manage multiple goal banks.</li>
              <li>Add a document ID when you want citations back to the original IEP.</li>
              <li>Joslyn keeps the original goal safe-you can copy pieces or replace it entirely once confirmed.</li>
            </ul>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-heading text-slate-900">Need more context?</p>
            <p className="mt-2 text-xs text-slate-500">
              Ask Joslyn in chat to explain the rewrite, generate a bilingual version, or draft a follow-up note for the team.
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
