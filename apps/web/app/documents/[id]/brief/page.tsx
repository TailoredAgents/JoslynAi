"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useBootstrappedChild } from "../../../../lib/use-child";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

export default function BriefPage() {
  const params = useParams<{ id: string }>();
  const docId = params?.id ? String(params.id) : "";
  const { child, loading: childLoading } = useBootstrappedChild();
  const childId = child?.id || null;
  
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!docId) return;
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/documents/${docId}/brief?child_id=${childId}&lang=en`);
        if (!cancelled) {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const d = await res.json();
          setData(d);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(String(err?.message || err));
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [docId]);

  const citationGroups = useMemo(() => {
    const groups = new Map<string, { doc_name: string; cites: { page: number; quote: string }[] }>();
    for (const c of data?.citations || []) {
      const key = c.document_id as string;
      const entry = groups.get(key) ?? { doc_name: c.doc_name || "Document", cites: [] as { page: number; quote: string }[] };
      if (!entry.cites.some((x) => x.page === Number(c.page) && x.quote === (c.quote || ""))) {
        entry.cites.push({ page: Number(c.page), quote: c.quote || "" });
      }
      groups.set(key, entry);
    }
    return [...groups.entries()];
  }, [data?.citations]);

  function buildQjson(cites: { page: number; quote: string }[]) {
    const trimmed = cites.slice(0, 12);
    try {
      const anyGlobal: any = globalThis as any;
      if (anyGlobal.Buffer) return anyGlobal.Buffer.from(JSON.stringify(trimmed), "utf-8").toString("base64");
      return btoa(unescape(encodeURIComponent(JSON.stringify(trimmed))));
    } catch {
      return "";
    }
  }

  if (!docId) return <div className="p-6 text-sm text-slate-500">Loading brief…</div>;
  if (loading) return <div className="p-6 text-sm text-slate-500">Generating brief…</div>;
  if (error) return <div className="p-6 text-sm text-red-600">Unable to load brief: {error}</div>;
  if (!data) return <div className="p-6 text-sm text-slate-500">Brief not available.</div>;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-10 py-8">
      <header className="space-y-4">
        <span className="inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-brand-600">
          Joslyn AI brief
        </span>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl space-y-2">
            <h1 className="text-3xl font-heading text-slate-900 sm:text-4xl">What Joslyn noticed in this IEP</h1>
            <p className="text-sm text-slate-600">Key services, accommodations, and citations surfaced from your upload.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="inline-flex items-center rounded-full border border-brand-200 px-4 py-2 text-sm font-semibold text-brand-600 transition hover:border-brand-400" href={`/documents/${docId}/view`}>
              Open document →
            </Link>
            <Link className="inline-flex items-center rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-uplift transition hover:bg-brand-600" href={`/letters/new?doc=${docId}`}>
              Draft a follow-up letter
            </Link>
          </div>
        </div>
      </header>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Overview</p>
          <p className="mt-3 text-sm text-slate-600 whitespace-pre-wrap">{data.overview || "No overview available."}</p>
        </div>
        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Services</p>
            {Array.isArray(data.services) && data.services.length > 0 ? (
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {data.services.map((s: string, i: number) => (
                  <li key={i} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2">{s}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-slate-500">No services were highlighted.</p>
            )}
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Accommodations</p>
            {Array.isArray(data.accommodations) && data.accommodations.length > 0 ? (
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {data.accommodations.map((s: string, i: number) => (
                  <li key={i} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2">{s}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-slate-500">No accommodations listed yet.</p>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-heading text-slate-900">Citations & highlighted snippets</h2>
            <p className="text-sm text-slate-600">Open the document with highlights or jump straight to a page.</p>
          </div>
          <span className="rounded-full border border-brand-200 bg-brand-50 px-4 py-1 text-xs font-semibold text-brand-600">{citationGroups.length} documents referenced</span>
        </div>
        <div className="mt-4 space-y-4">
          {citationGroups.length === 0 && (<div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Upload more pages or ask Joslyn AI a question to surface citations.</div>)}
          {citationGroups.map(([id, group]) => {
            const qjson = buildQjson(group.cites);
            return (
              <div key={id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm font-semibold text-slate-700">{group.doc_name}</div>
                  <div className="flex flex-wrap gap-2 text-xs font-semibold text-brand-600">
                    <Link className="rounded-full border border-brand-200 px-3 py-1 hover:border-brand-400" href={`/documents/${id}/view?qjson=${encodeURIComponent(qjson)}`} target="_blank">
                      Open all highlights
                    </Link>
                    <Link className="rounded-full border border-brand-200 px-3 py-1 hover:border-brand-400" href={`/documents/${id}/view`} target="_blank">
                      View document
                    </Link>
                  </div>
                </div>
                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                  {group.cites.slice(0, 6).map((c, idx) => (
                    <li key={`${c.page}-${idx}`} className="rounded-xl border border-slate-200 bg-white/80 px-4 py-3">
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>Page {c.page}</span>
                        <Link className="font-semibold text-brand-600" href={`/documents/${id}/view?page=${c.page}&q=${encodeURIComponent(c.quote || "")}`} target="_blank">
                          Jump to page →
                        </Link>
                      </div>
                      <p className="mt-2 text-sm text-slate-700">{c.quote?.slice(0, 160)}{c.quote?.length > 160 ? "�" : ""}</p>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        <p className="font-heading text-sm text-slate-700">What would you like to do next?</p>
        <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold text-brand-600">
          <Link className="rounded-full border border-brand-200 px-4 py-2 transition hover:border-brand-400" href={`/letters/new?doc=${docId}`}>
            Draft a parent letter
          </Link>
          <Link className="rounded-full border border-brand-200 px-4 py-2 transition hover:border-brand-400" href={`/documents/${docId}/view`}>Review highlights again</Link>
          <Link className="rounded-full border border-brand-200 px-4 py-2 transition hover:border-brand-400" href="mailto:hello@joslyn.ai">Share with a care guide</Link>
        </div>
      </section>
    </div>
  );
}
