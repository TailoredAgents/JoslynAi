"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useBootstrappedChild } from "../../lib/use-child";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

type KitItem = {
  id: string;
  kind: string;
  status: string;
  payload_json: any;
  citations_json: any;
};

type AppealKit = {
  id: string;
  status: string;
  metadata_json?: any;
  checklist_json?: any;
  citations_json?: any;
  deadline_date?: string | null;
  updated_at?: string | null;
  items: KitItem[];
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

function formatTime(value?: string | null) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "";
  }
}

export default function AppealKitDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { child, loading: childLoading, error: childError, refresh: refreshChild } = useBootstrappedChild();
  const childId = child?.id ?? null;
  const childReady = Boolean(childId);

  const kitId = params?.kitId as string | undefined;
  const [kit, setKit] = useState<AppealKit | null>(null);
  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  async function fetchKit(targetId: string) {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/appeals/kits/${targetId}`);
      const data = await res.json();
      setKit(data?.kit || null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function regenerate() {
    if (!kitId) return;
    setRegenerating(true);
    try {
      await fetch(`${API_BASE}/appeals/kits/${kitId}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      await fetchKit(kitId);
    } catch (err) {
      console.error(err);
    } finally {
      setRegenerating(false);
    }
  }

  useEffect(() => {
    if (!kitId) return;
    fetchKit(kitId);
  }, [kitId]);

  useEffect(() => {
    const childQuery = searchParams?.get("child");
    if (childQuery && childId && childQuery !== childId) {
      router.replace(`/appeals/${kitId}?child=${childId}`);
    }
  }, [childId, kitId, router, searchParams]);

  const coverLetter = useMemo(() => {
    return kit?.items?.find((item) => item.kind === "cover_letter");
  }, [kit]);

  const evidence = useMemo(() => {
    return kit?.items?.find((item) => item.kind === "evidence");
  }, [kit]);

  const checklistItem = useMemo(() => {
    return kit?.items?.find((item) => item.kind === "checklist");
  }, [kit]);

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

  if (!kitId) {
    return (
      <div className="mx-auto w-full max-w-6xl py-10 text-sm text-slate-500">Appeal kit not found.</div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 py-8">
      <header className="rounded-3xl bg-gradient-to-r from-brand-500 to-brand-600 px-6 py-5 text-white shadow-uplift">
        <p className="text-xs uppercase tracking-wide text-brand-100/90">Appeal packet</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-2xl font-semibold">Build the appeal kit</h1>
          <StatusPill status={kit?.status || "pending"} />
          <button
            type="button"
            className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white transition hover:bg-white/25 disabled:opacity-40"
            onClick={() => fetchKit(kitId)}
            disabled={loading}
          >
            Refresh
          </button>
          <button
            type="button"
            className="inline-flex items-center rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-600 shadow-sm transition hover:bg-brand-100 disabled:opacity-40"
            onClick={regenerate}
            disabled={regenerating}
          >
            {regenerating ? "Regenerating..." : "Regenerate"}
          </button>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-brand-50">
          Joslyn drafts the appeal letter, gathers supporting evidence, and keeps a checklist so you can finalize and submit the packet on time.
        </p>
      </header>

      {loading && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">Loading appeal kit...</div>
      )}

      {!loading && !kit ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
          We have not generated this appeal kit yet. Use the button above to start it.
        </div>
      ) : null}

      {kit ? (
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_1fr]">
          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 1</p>
                  <h2 className="text-lg font-heading text-slate-900">Review the appeal letter</h2>
                </div>
                <p className="text-xs text-slate-400">Updated {formatTime(kit.updated_at) || "just now"}</p>
              </div>
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <p>{coverLetter?.payload_json?.body || "Letter is generating."}</p>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 2</p>
              <h2 className="text-lg font-heading text-slate-900">Verify supporting evidence</h2>
              <div className="mt-4 space-y-2">
                {Array.isArray(evidence?.payload_json?.items) && evidence?.payload_json?.items.length ? (
                  <ul className="space-y-2 text-sm text-slate-600">
                    {evidence.payload_json.items.map((item: any, idx: number) => (
                      <li key={`evidence-${idx}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="font-semibold text-slate-800">{item.code ? `${item.code}: ` : ""}{item.description || "Evidence"}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">Evidence is compiling. Refresh in a moment.</p>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 3</p>
              <h2 className="text-lg font-heading text-slate-900">Finalize &amp; send</h2>
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                {Array.isArray(checklistItem?.payload_json?.items) ? (
                  <ul className="space-y-2">
                    {checklistItem?.payload_json?.items.map((item: any, idx: number) => (
                      <li key={`check-${idx}`} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="mt-1 h-2.5 w-2.5 rounded-full bg-brand-400" aria-hidden />
                        <span>{item.label || "Checklist item"}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">Checklist will appear once the kit is ready.</p>
                )}
                <button
                  type="button"
                  className="inline-flex items-center rounded-full bg-brand-500 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600 disabled:opacity-40"
                  disabled
                >
                  Download packet (coming soon)
                </button>
              </div>
            </div>
          </div>

          <aside className="space-y-5">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-heading text-slate-900">Kit overview</p>
              <div className="mt-3 space-y-2 text-xs text-slate-500">
                <div className="flex items-center justify-between">
                  <span>Status</span>
                  <StatusPill status={kit.status} />
                </div>
                <div className="flex items-center justify-between">
                  <span>Deadline</span>
                  <span>{kit.deadline_date ? formatTime(kit.deadline_date) : "Not set"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Generated</span>
                  <span>{formatTime(kit.updated_at) || "just now"}</span>
                </div>
              </div>
              <div className="mt-4 space-y-2 text-xs text-slate-500">
                <Link href="/appeals" className="inline-flex items-center rounded-full border border-brand-200 px-4 py-2 text-xs font-semibold text-brand-600 transition hover:border-brand-400 hover:text-brand-700">
                  Back to appeal kits
                </Link>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-heading text-slate-900">Citations</p>
              {Array.isArray(kit.citations_json) && kit.citations_json.length ? (
                <ul className="mt-3 space-y-2 text-xs text-slate-600">
                  {kit.citations_json.map((citation: any, idx: number) => (
                    <li key={`citation-${idx}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <div className="font-semibold text-slate-700">{citation.doc_name || "Document"}</div>
                      <div className="text-slate-500">Page {citation.page ?? "?"}</div>
                      {citation.snippet ? (
                        <p className="mt-1 text-[11px] text-slate-500">"{citation.snippet}"</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-slate-500">Citations will appear once evidence is compiled.</p>
              )}
            </div>
          </aside>
        </section>
      ) : null}
    </div>
  );
}

