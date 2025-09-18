"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useBootstrappedChild } from "../../../lib/use-child";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

function formatTime(value?: string | null) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "";
  }
}

type DiffSummary = {
  status: string;
  summary: string | null;
  minutes_changes: Array<any>;
  goals_added: Array<any>;
  goals_removed: Array<any>;
  accommodations_changed: Array<any>;
  other_notes: Array<any>;
  risk_flags: Array<any>;
  citations: Array<any>;
  latest_document_id?: string;
  previous_document_id?: string;
  updated_at?: string | null;
};

type FullDiff = {
  id: string;
  status: string;
  diff: any;
  risk_flags: any[];
  citations: any[];
  latest_document_id?: string;
  previous_document_id?: string;
  created_at?: string;
  updated_at?: string;
};

function StatusPill({ status }: { status: string }) {
  const normalized = (status || "").toLowerCase();
  const styles: Record<string, string> = {
    ready: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    pending: "bg-amber-50 text-amber-700 border border-amber-200",
    processing: "bg-amber-50 text-amber-700 border border-amber-200",
    error: "bg-rose-50 text-rose-700 border border-rose-200",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${styles[normalized] || "bg-slate-100 text-slate-600 border border-slate-200"}`}>
      {normalized === "ready" ? "Ready" : normalized === "pending" ? "Queued" : normalized === "error" ? "Needs attention" : normalized}
    </span>
  );
}

function EmptyState({ onRegenerate, disabled }: { onRegenerate: () => void; disabled: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-brand-200 bg-white p-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-500">
        <span className="text-2xl">??</span>
      </div>
      <div className="space-y-2">
        <h2 className="text-lg font-heading text-slate-900">No comparison yet</h2>
        <p className="text-sm text-slate-500">Upload two IEPs or run the comparison to see what changed between the latest version and the previous plan.</p>
      </div>
      <button
        type="button"
        onClick={onRegenerate}
        className="inline-flex items-center rounded-full bg-brand-500 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600 disabled:opacity-40"
        disabled={disabled}
      >
        Generate comparison
      </button>
    </div>
  );
}

function RiskFlagItem({ flag }: { flag: any }) {
  const level = (flag?.level || "").toLowerCase();
  const badgeStyles: Record<string, string> = {
    high: "bg-rose-100 text-rose-700",
    medium: "bg-amber-100 text-amber-700",
    low: "bg-slate-200 text-slate-600",
  };
  return (
    <li className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeStyles[level] || "bg-slate-200 text-slate-600"}`}>
          {level ? level.toUpperCase() : "RISK"}
        </span>
        <p className="text-sm text-slate-700">{flag?.reason || "Potential concern"}</p>
      </div>
      {Array.isArray(flag?.citations) && flag.citations.length ? (
        <p className="mt-2 text-xs text-slate-500">Citations: {flag.citations.join(", ")}</p>
      ) : null}
    </li>
  );
}

function ChangeRow({ title, delta, citationIds }: { title: string; delta: string; citationIds?: string[] }) {
  return (
    <li className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
      <div className="font-semibold text-slate-900">{title}</div>
      <p className="mt-1 text-sm text-slate-600">{delta}</p>
      {citationIds && citationIds.length ? (
        <p className="mt-1 text-xs text-slate-500">Citations: {citationIds.join(", ")}</p>
      ) : null}
    </li>
  );
}

function StepHeader({ step, title, description, active }: { step: number; title: string; description: string; active?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <div className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold ${active ? "border-brand-500 text-brand-600" : "border-slate-300 text-slate-400"}`}>
        {step}
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
    </div>
  );
}

export default function IepDiffPage() {
  const { child, loading: childLoading, error: childError, refresh: refreshChild } = useBootstrappedChild();
  const childId = child?.id ?? null;
  const childReady = Boolean(childId);
  const params = useSearchParams();
  const autoTrigger = params?.get("child") && childId && params.get("child") === childId;

  const [summary, setSummary] = useState<DiffSummary | null>(null);
  const [fullDiff, setFullDiff] = useState<FullDiff | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingFull, setLoadingFull] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const status = summary?.status || fullDiff?.status || "missing";

  async function fetchSummary(targetId: string) {
    setLoadingSummary(true);
    try {
      const res = await fetch(`${API_BASE}/children/${targetId}/iep/diff`);
      const data = await res.json();
      setSummary(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSummary(false);
    }
  }

  async function fetchFull(targetId: string) {
    setLoadingFull(true);
    try {
      const res = await fetch(`${API_BASE}/children/${targetId}/iep/diff/view`);
      const data = await res.json();
      setFullDiff(data && data.diff ? data : null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingFull(false);
    }
  }

  async function regenerate(targetId: string) {
    setRegenerating(true);
    try {
      await fetch(`${API_BASE}/children/${targetId}/iep/diff/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      await fetchSummary(targetId);
      await fetchFull(targetId);
    } catch (err) {
      console.error(err);
    } finally {
      setRegenerating(false);
    }
  }

  useEffect(() => {
    if (!childId) return;
    fetchSummary(childId);
    fetchFull(childId);
    if (autoTrigger) {
      regenerate(childId);
    }
  }, [childId, autoTrigger]);

  const latestSummary = useMemo(() => {
    if (!summary) return null;
    return {
      ...summary,
      minutes_changes: Array.isArray(summary.minutes_changes) ? summary.minutes_changes.slice(0, 4) : [],
      goals_added: Array.isArray(summary.goals_added) ? summary.goals_added.slice(0, 3) : [],
      goals_removed: Array.isArray(summary.goals_removed) ? summary.goals_removed.slice(0, 3) : [],
      accommodations_changed: Array.isArray(summary.accommodations_changed) ? summary.accommodations_changed.slice(0, 3) : [],
      other_notes: Array.isArray(summary.other_notes) ? summary.other_notes.slice(0, 3) : [],
    };
  }, [summary]);

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

  const isLoading = loadingSummary || loadingFull;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 py-8">
      <header className="rounded-3xl bg-gradient-to-r from-brand-500 to-brand-600 px-6 py-5 text-white shadow-uplift">
        <p className="text-xs uppercase tracking-wide text-brand-100/90">IEP version comparison</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-2xl font-semibold">See what changed between IEPs</h1>
          <StatusPill status={status} />
          <button
            type="button"
            className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white transition hover:bg-white/25 disabled:opacity-40"
            onClick={() => regenerate(childId)}
            disabled={regenerating || isLoading}
          >
            {regenerating ? "Regenerating…" : "Refresh diff"}
          </button>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-brand-50">
          Joslyn scans the latest IEP alongside the previous version to highlight service minutes, goals, accommodations, and risk areas with citations to the source language.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.7fr)_1fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <StepHeader
                step={1}
                title="Review the highlights"
                description="Summary of major shifts in services, goals, and supports."
                active
              />
              <div className="text-right text-xs text-slate-500">
                {summary?.updated_at ? `Last updated ${formatTime(summary.updated_at)}` : null}
              </div>
            </div>
            <div className="mt-5 space-y-4">
              {summary?.summary ? (
                <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">Overview</p>
                  <p className="mt-1 text-sm text-slate-600 whitespace-pre-line">{summary.summary}</p>
                </div>
              ) : (
                <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No summary yet—run the comparison.</div>
              )}

              {latestSummary?.minutes_changes && latestSummary.minutes_changes.length ? (
                <section>
                  <h3 className="mb-2 text-sm font-semibold text-slate-900">Service minutes</h3>
                  <ul className="space-y-2">
                    {latestSummary.minutes_changes.map((item: any, idx: number) => (
                      <ChangeRow
                        key={`minutes-${idx}`}
                        title={item?.service || "Service"}
                        delta={item?.note || `Changed from ${item?.previous_minutes ?? "?"} to ${item?.current_minutes ?? "?"}`}
                        citationIds={item?.citations}
                      />
                    ))}
                  </ul>
                </section>
              ) : null}

              {latestSummary?.goals_added && latestSummary.goals_added.length ? (
                <section>
                  <h3 className="mb-2 text-sm font-semibold text-slate-900">Goals added</h3>
                  <ul className="space-y-2">
                    {latestSummary.goals_added.map((item: any, idx: number) => (
                      <ChangeRow key={`goal-add-${idx}`} title={item?.goal || "New goal"} delta={item?.note || "Added"} citationIds={item?.citations} />
                    ))}
                  </ul>
                </section>
              ) : null}

              {latestSummary?.goals_removed && latestSummary.goals_removed.length ? (
                <section>
                  <h3 className="mb-2 text-sm font-semibold text-slate-900">Goals removed</h3>
                  <ul className="space-y-2">
                    {latestSummary.goals_removed.map((item: any, idx: number) => (
                      <ChangeRow key={`goal-remove-${idx}`} title={item?.goal || "Removed goal"} delta={item?.note || "Removed"} citationIds={item?.citations} />
                    ))}
                  </ul>
                </section>
              ) : null}

              {latestSummary?.accommodations_changed && latestSummary.accommodations_changed.length ? (
                <section>
                  <h3 className="mb-2 text-sm font-semibold text-slate-900">Accommodations</h3>
                  <ul className="space-y-2">
                    {latestSummary.accommodations_changed.map((item: any, idx: number) => (
                      <ChangeRow key={`accom-${idx}`} title={item?.accommodation || "Support"} delta={item?.change || "Updated"} citationIds={item?.citations} />
                    ))}
                  </ul>
                </section>
              ) : null}

              {latestSummary?.other_notes && latestSummary.other_notes.length ? (
                <section>
                  <h3 className="mb-2 text-sm font-semibold text-slate-900">Other notes</h3>
                  <ul className="space-y-2">
                    {latestSummary.other_notes.map((item: any, idx: number) => (
                      <ChangeRow key={`other-${idx}`} title="Note" delta={item?.note || ""} citationIds={item?.citations} />
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <StepHeader
              step={2}
              title="Review risk flags"
              description="Risk areas that may need follow-up or documentation."
              active={Array.isArray(summary?.risk_flags) && summary.risk_flags.length > 0}
            />
            <div className="mt-4">
              {summary?.risk_flags && summary.risk_flags.length ? (
                <ul className="space-y-2">
                  {summary.risk_flags.map((flag: any, idx: number) => (
                    <RiskFlagItem flag={flag} key={`flag-${idx}`} />
                  ))}
                </ul>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  No risk flags detected yet. Joslyn will highlight reductions or missing supports when they appear.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <StepHeader
              step={3}
              title="Track next steps"
              description="Confirm youve reviewed the changes and decide what to do next."
              active={summary?.status === "ready"}
            />
            <div className="mt-4 space-y-3">
              <p className="text-sm text-slate-600">
                When youve finished reviewing, Joslyn can remember that this version is acknowledged and help draft follow-up letters or meeting requests.
              </p>
              <button
                type="button"
                className="inline-flex items-center rounded-full bg-brand-500 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600 disabled:opacity-40"
                disabled={isLoading || summary?.status !== "ready"}
              >
                Mark as reviewed
              </button>
              <div className="text-xs text-slate-500">
                Need more detail? <Link href="/letters/new" className="text-brand-600 underline">Draft a follow-up letter</Link> or <Link href="/meetings/new" className="text-brand-600 underline">schedule a meeting</Link>.
              </div>
            </div>
          </div>
        </div>

        <aside className="space-y-5">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-heading text-slate-900">Comparison status</p>
            <div className="mt-3 space-y-2 text-xs text-slate-500">
              <div className="flex items-center justify-between">
                <span>Latest IEP</span>
                <span>{summary?.latest_document_id ? summary.latest_document_id.slice(0, 8) : "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Previous IEP</span>
                <span>{summary?.previous_document_id ? summary.previous_document_id.slice(0, 8) : "None"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Status</span>
                <StatusPill status={status} />
              </div>
            </div>
            <div className="mt-4 space-y-3">
              <button
                type="button"
                className="w-full rounded-full border border-brand-200 px-4 py-2 text-xs font-semibold text-brand-600 transition hover:border-brand-400 hover:text-brand-700 disabled:opacity-40"
                disabled={isLoading}
                onClick={() => {
                  if (!childId) return;
                  fetchSummary(childId);
                  fetchFull(childId);
                }}
              >
                Refresh data
              </button>
              <button
                type="button"
                className="w-full rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-700 disabled:opacity-40"
                disabled={isLoading}
                onClick={() => regenerate(childId)}
              >
                Regenerate comparison
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-heading text-slate-900">Citations</p>
            {summary?.citations && summary.citations.length ? (
              <ul className="mt-3 space-y-2 text-xs text-slate-600">
                {summary.citations.map((citation: any, idx: number) => (
                  <li key={`citation-${idx}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="font-semibold text-slate-700">{citation.doc_name || "Document"}</div>
                    <div className="text-slate-500">Page {citation.page ?? "?"}</div>
                    {citation.snippet ? (
                      <p className="mt-1 text-[11px] text-slate-500">“{citation.snippet}”</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-slate-500">Citations will appear once a diff has been generated.</p>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-heading text-slate-900">Need to compare again?</p>
            <p className="mt-2 text-xs text-slate-500">
              Joslyn keeps a version history. Upload a new IEP and well automatically update the comparison and flag changes here.
            </p>
            <Link
              href="/documents"
              className="mt-3 inline-flex items-center rounded-full border border-brand-200 px-4 py-2 text-xs font-semibold text-brand-600 transition hover:border-brand-400 hover:text-brand-700"
            >
              View documents
            </Link>
          </div>
        </aside>
      </section>

      {(!latestSummary || summary?.status === "missing") && !isLoading ? (
        <EmptyState onRegenerate={() => regenerate(childId)} disabled={regenerating} />
      ) : null}
    </div>
  );
}
