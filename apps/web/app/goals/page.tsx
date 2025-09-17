"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useBootstrappedChild } from "../lib/use-child";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

type Rewrite = {
  id: string;
  status: string;
  goal_identifier: string;
  document_id?: string | null;
  rubric: Array<{ criterion: string; rating: string; notes?: string }>;
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
  return (
    <span className={inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold }>
      {normalized === "draft" ? "Draft" : normalized === "pending" ? "Queued" : normalized === "confirmed" ? "Published" : normalized}
    </span>
  );
}

export default function SmartGoalsPage() {
  const { child, loading: childLoading, error: childError, refresh: refreshChild } = useBootstrappedChild();
  const childId = child?.id ?? null;
  const childReady = Boolean(childId);
  const router = useRouter();

  const [goalText, setGoalText] = useState("");
  const [goalId, setGoalId] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [rewrites, setRewrites] = useState<Rewrite[]>([]);
  const [loadingRewrites, setLoadingRewrites] = useState(false);

  async function loadRewrites(targetChild: string) {
    setLoadingRewrites(true);
    try {
      const res = await fetch(${API_BASE}/children//goals/smart);
      const data: RewriteResponse = await res.json();
      setRewrites(Array.isArray(data?.rewrites) ? data.rewrites : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingRewrites(false);
    }
  }

  async function submitGoal() {
    if (!childId || !goalId.trim() || !goalText.trim()) return;
    setSubmitting(true);
    try {
      await fetch(${API_BASE}/children//goals/smart, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal_identifier: goalId.trim(),
          goal_text: goalText.trim(),
          document_id: documentId.trim() || undefined,
        }),
      });
      setGoalText("");
      setGoalId("");
      setDocumentId("");
      await loadRewrites(childId);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmRewrite(rewriteId: string) {
    if (!childId || !rewriteId) return;
    try {
      await fetch(${API_BASE}/children//goals//confirm, {
        method: "POST",
      });
      await loadRewrites(childId);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    if (!childId) return;
    loadRewrites(childId);
  }, [childId]);

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
        <p className="text-xs uppercase tracking-wide text-brand-100/90">Goal assistant</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-2xl font-semibold">Make goals SMART</h1>
          <button
            type="button"
            className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white transition hover:bg-white/25 disabled:opacity-40"
            onClick={() => loadRewrites(childId)}
            disabled={loadingRewrites}
          >
            Refresh rewrites
          </button>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-brand-50">
          Paste a goal from the IEP and Joslyn will score it against SMART criteria, surface gaps, and offer a measurable rewrite with baselines and probes.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.5fr)_1fr]">
        <div className="space-y-5">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-heading text-slate-900">Submit a goal</h2>
            <p className="mt-2 text-xs text-slate-500">Provide a unique identifier so we can track this goal across drafts.</p>
            <div className="mt-4 space-y-3">
              <input
                className="w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 focus:border-brand-400 focus:outline-none focus:ring focus:ring-brand-200/60"
                placeholder="Goal identifier (e.g., IEP Goal #3)"
                value={goalId}
                onChange={(e) => setGoalId(e.target.value)}
              />
              <textarea
                className="h-32 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 focus:border-brand-400 focus:outline-none focus:ring focus:ring-brand-200/60"
                placeholder="Paste the goal text"
                value={goalText}
                onChange={(e) => setGoalText(e.target.value)}
              />
              <input
                className="w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 focus:border-brand-400 focus:outline-none focus:ring focus:ring-brand-200/60"
                placeholder="Optional IEP document ID for citations"
                value={documentId}
                onChange={(e) => setDocumentId(e.target.value)}
              />
              <button
                type="button"
                className="inline-flex items-center rounded-full bg-brand-500 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600 disabled:opacity-40"
                onClick={submitGoal}
                disabled={submitting || !goalId.trim() || !goalText.trim()}
              >
                {submitting ? "Submitting..." : "Score and rewrite"}
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-heading text-slate-900">Recent rewrites</h2>
            {loadingRewrites ? (
              <p className="mt-3 text-xs text-slate-500">Loading...</p>
            ) : rewrites.length ? (
              <ul className="mt-3 space-y-3">
                {rewrites.map((rewrite) => (
                  <li key={rewrite.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{rewrite.goal_identifier}</p>
                        <p className="text-xs text-slate-500">Updated {rewrite.updated_at ? new Date(rewrite.updated_at).toLocaleString() : "just now"}</p>
                      </div>
                      <StatusPill status={rewrite.status} />
                    </div>
                    <div className="mt-3 space-y-2 text-sm text-slate-600">
                      <div>
                        <p className="font-semibold text-slate-800">SMART rubric</p>
                        <ul className="mt-1 space-y-1 text-xs">
                          {rewrite.rubric.map((item, idx) => (
                            <li key={${rewrite.id}-rubric-}>
                              <span className="font-semibold text-slate-700">{item.criterion}:</span> {item.rating} {item.notes ? -  : ""}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800">Rewritten goal</p>
                        <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{rewrite.rewrite}</p>
                      </div>
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
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center rounded-full border border-brand-200 px-3 py-1 text-xs font-semibold text-brand-600 transition hover:border-brand-400 hover:text-brand-700"
                          disabled={rewrite.status === "confirmed"}
                          onClick={() => confirmRewrite(rewrite.id)}
                        >
                          Mark as confirmed
                        </button>
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
              <li>Include the child's name or identifier if you track goals outside the IEP.</li>
              <li>Add document IDs when you want citations tied to the original IEP.</li>
              <li>Use the rewrite verbatim or treat it as a starting point-Joslyn keeps the original safe.</li>
            </ul>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-heading text-slate-900">Need more context?</p>
            <p className="mt-2 text-xs text-slate-500">
              Ask Joslyn in chat to explain the rewrite or to draft a follow-up note for the team.
            </p>
            <button
              type="button"
              className="mt-3 inline-flex items-center rounded-full border border-brand-200 px-4 py-2 text-xs font-semibold text-brand-600 transition hover:border-brand-400 hover:text-brand-700"
              onClick={() => router.push("/copilot")}
            >
              Ask Joslyn
            </button>
          </div>
        </aside>
      </section>
    </div>
  );
}

