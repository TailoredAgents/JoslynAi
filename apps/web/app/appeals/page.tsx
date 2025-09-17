"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useBootstrappedChild } from "../lib/use-child";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

type KitSummary = {
  id: string;
  status: string;
  denial_id?: string | null;
  metadata_json?: any;
  checklist_json?: any;
  citations_json?: any;
  deadline_date?: string | null;
  updated_at?: string | null;
};

type KitsResponse = {
  kits: KitSummary[];
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

export default function AppealKitsPage() {
  const router = useRouter();
  const { child, loading: childLoading, error: childError, refresh: refreshChild } = useBootstrappedChild();
  const childId = child?.id ?? null;
  const childReady = Boolean(childId);

  const [kits, setKits] = useState<KitSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  async function loadKits(targetId: string) {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/appeals/kits?child_id=${targetId}`);
      const data: KitsResponse | any = await res.json();
      setKits(Array.isArray(data?.kits) ? data.kits : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function createKit() {
    if (!childId) return;
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/appeals/kits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ child_id: childId })
      });
      const data = await res.json();
      if (data?.id) {
        router.push(`/appeals/${data.id}?child=${childId}`);
        return;
      }
      await loadKits(childId);
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    if (!childId) return;
    loadKits(childId);
  }, [childId]);

  const sortedKits = useMemo(() => {
    return [...kits].sort((a, b) => {
      const at = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const bt = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return bt - at;
    });
  }, [kits]);

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
        <p className="text-xs uppercase tracking-wide text-brand-100/90">Appeal kit workspace</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-2xl font-semibold">Organize appeal packets</h1>
          <button
            type="button"
            className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white transition hover:bg-white/25 disabled:opacity-40"
            onClick={() => loadKits(childId)}
            disabled={loading}
          >
            Refresh
          </button>
          <button
            type="button"
            className="inline-flex items-center rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-600 shadow-sm transition hover:bg-brand-100 disabled:opacity-40"
            onClick={createKit}
            disabled={creating}
          >
            {creating ? "Starting..." : "Start appeal kit"}
          </button>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-brand-50">
          Joslyn packages your denial, supporting evidence, and next steps into a ready-to-send appeal kit. Track status, review the letter, and download the packet when everything looks good.
        </p>
      </header>

      <section className="space-y-4">
        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">Loading appeal kits...</div>
        ) : sortedKits.length ? (
          <ul className="space-y-3">
            {sortedKits.map((kit) => (
              <li key={kit.id} className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <h2 className="text-sm font-semibold text-slate-900">Appeal kit</h2>
                    <StatusPill status={kit.status} />
                  </div>
                  {kit.metadata_json?.appeal_reason ? (
                    <p className="text-xs text-slate-500">{kit.metadata_json.appeal_reason}</p>
                  ) : null}
                  <p className="text-xs text-slate-400">Updated {formatTime(kit.updated_at) || "just now"}</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    className="inline-flex items-center rounded-full border border-brand-200 px-4 py-2 text-xs font-semibold text-brand-600 transition hover:border-brand-400 hover:text-brand-700"
                    onClick={() => router.push(`/appeals/${kit.id}?child=${childId}`)}
                  >
                    Open kit
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-brand-200 bg-white p-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-500">
              <span className="text-2xl">??</span>
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-heading text-slate-900">No appeal kits yet</h2>
              <p className="text-sm text-slate-500">When a denial comes in, start an appeal kit to generate a ready-to-send packet with evidence and next steps.</p>
            </div>
            <button
              type="button"
              onClick={createKit}
              className="inline-flex items-center rounded-full bg-brand-500 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600 disabled:opacity-40"
              disabled={creating}
            >
              {creating ? "Starting..." : "Start appeal kit"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

