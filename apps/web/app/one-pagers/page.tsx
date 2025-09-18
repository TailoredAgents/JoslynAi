"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useBootstrappedChild } from "../../lib/use-child";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

type Section = {
  heading: string;
  body_en: string;
  body_es: string;
  citations: string[];
};

type Strategy = {
  label_en: string;
  label_es: string;
  citations: string[];
};

interface ContentPayload {
  title?: string;
  intro_en?: string;
  intro_es?: string;
  sections?: Section[];
  strategies?: Strategy[];
  closing_en?: string;
  closing_es?: string;
  audience?: string;
  document_id?: string | null;
  language_primary?: string;
  language_secondary?: string;
}

type CitationEntry = {
  span_id?: string;
  document_id: string;
  doc_name?: string;
  page?: number;
  snippet?: string;
};

type OnePagerRecord = {
  id: string;
  status: string;
  audience: string;
  child_id: string | null;
  language_primary?: string | null;
  language_secondary?: string | null;
  share_link_id?: string | null;
  content: ContentPayload;
  citations: CitationEntry[];
  updated_at?: string | null;
};

type ListResponse = { one_pagers: OnePagerRecord[] };

const AUDIENCE_OPTIONS = ["teacher", "support_staff", "coach", "pe_teacher"];

function StatusPill({ status }: { status: string }) {
  const normalized = (status || "").toLowerCase();
  const map: Record<string, string> = {
    ready: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    pending: "bg-amber-50 text-amber-700 border border-amber-200",
    error: "bg-rose-50 text-rose-700 border border-rose-200",
    empty: "bg-slate-100 text-slate-600 border border-slate-200",
  };
  const labels: Record<string, string> = {
    ready: "Ready",
    pending: "Processing",
    error: "Needs attention",
    empty: "No data",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${map[normalized] || "bg-slate-100 text-slate-600 border border-slate-200"}`}>
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

function joinLines(items: string | string[] | undefined): string {
  if (!items) return "";
  if (Array.isArray(items)) return items.join("; " );
  return String(items);
}

function buildClipboard(content: ContentPayload, includeSpanish: boolean) {
  const lines: string[] = [];
  if (content.title) lines.push(content.title);
  if (content.intro_en) lines.push(`English: ${content.intro_en}`);
  if (includeSpanish && content.intro_es) lines.push(`Spanish: ${content.intro_es}`);
  (content.sections || []).forEach((section, idx) => {
    lines.push(`Section ${idx + 1} (${section.heading})`);
    if (section.body_en) lines.push(`  EN: ${section.body_en}`);
    if (includeSpanish && section.body_es) lines.push(`  ES: ${section.body_es}`);
  });
  (content.strategies || []).forEach((strategy, idx) => {
    lines.push(`Strategy ${idx + 1}`);
    if (strategy.label_en) lines.push(`  EN: ${strategy.label_en}`);
    if (includeSpanish && strategy.label_es) lines.push(`  ES: ${strategy.label_es}`);
  });
  if (content.closing_en) lines.push(`Closing EN: ${content.closing_en}`);
  if (includeSpanish && content.closing_es) lines.push(`Closing ES: ${content.closing_es}`);
  return lines.filter(Boolean).join("\n");
}

export default function OnePagersPage() {
  const router = useRouter();
  const { child, loading: childLoading, error: childError, refresh: refreshChild } = useBootstrappedChild();
  const childId = child?.id ?? null;

  const [records, setRecords] = useState<OnePagerRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [audience, setAudience] = useState<string>("teacher");
  const [languageSecondary, setLanguageSecondary] = useState<string>("es");
  const [queueing, setQueueing] = useState(false);
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showSpanish, setShowSpanish] = useState(true);
  const [shareInfo, setShareInfo] = useState<Record<string, { share_url: string; qr_base64: string }>>({});

  const selected = useMemo(() => records.find((rec) => rec.id === selectedId) || null, [records, selectedId]);

  const citationLookup = useMemo(() => {
    const map = new Map<string, CitationEntry & { index: number }>();
    selected?.citations.forEach((entry, idx) => {
      const key = entry?.span_id ? String(entry.span_id) : `${idx}`;
      map.set(key, { ...entry, index: idx + 1 });
    });
    return map;
  }, [selected]);

  async function loadOnePagers(targetChild: string) {
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_BASE}/children/${targetChild}/one-pagers`);
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const data: ListResponse = await res.json();
      const ordered = Array.isArray(data?.one_pagers) ? data.one_pagers : [];
      setRecords(ordered);
      if (ordered.length) {
        setSelectedId((current) => current && ordered.some((rec) => rec.id === current) ? current : ordered[0].id);
      } else {
        setSelectedId(null);
      }
    } catch (err) {
      console.error(err);
      setErrorMessage("We could not load one-pagers just yet.");
    }
  }

  async function handleCreate() {
    if (!childId) return;
    setQueueing(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_BASE}/children/${childId}/one-pagers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audience, language_secondary: languageSecondary }),
      });
      if (!res.ok) throw new Error(`Failed to queue (${res.status})`);
      const json = await res.json();
      await loadOnePagers(childId);
      if (json?.one_pager?.id) setSelectedId(json.one_pager.id);
    } catch (err) {
      console.error(err);
      setErrorMessage("We could not queue that one-pager. Try again in a moment.");
    } finally {
      setQueueing(false);
    }
  }

  async function handleRegenerate(id: string) {
    if (!childId) return;
    setRegenerating(id);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_BASE}/one-pagers/${id}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language_secondary: languageSecondary }),
      });
      if (!res.ok) throw new Error(`Failed to regenerate (${res.status})`);
      await loadOnePagers(childId);
      setSelectedId(id);
    } catch (err) {
      console.error(err);
      setErrorMessage("We could not regenerate that one-pager yet.");
    } finally {
      setRegenerating(null);
    }
  }

  async function handlePublish(id: string) {
    setPublishing(id);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_BASE}/one-pagers/${id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`Failed to publish (${res.status})`);
      const data = await res.json();
      setShareInfo((prev) => ({ ...prev, [id]: { share_url: data.share_url, qr_base64: data.qr_base64 } }));
    } catch (err) {
      console.error(err);
      setErrorMessage("We could not publish that one-pager yet.");
    } finally {
      setPublishing(null);
    }
  }

  useEffect(() => {
    if (!childId) return;
    loadOnePagers(childId);
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

  const content = selected?.content || {};
  const sections = content.sections || [];
  const strategies = content.strategies || [];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 py-8">
      <header className="rounded-3xl bg-gradient-to-r from-brand-500 to-brand-600 px-6 py-5 text-white shadow-uplift">
        <p className="text-xs uppercase tracking-wide text-brand-100/90">One-pagers</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-2xl font-semibold">Create teacher-ready one-pagers</h1>
          <button
            type="button"
            className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white transition hover:bg-white/25 disabled:opacity-40"
            onClick={() => childId && loadOnePagers(childId)}
          >
            Refresh
          </button>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-brand-50">
          Joslyn assembles bilingual snapshots so staff can support the student without guessing.
        </p>
      </header>

      {errorMessage ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorMessage}</div>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-heading text-slate-900">Step 1 — Choose audience</h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {AUDIENCE_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition ${audience === option ? "border-brand-300 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:border-brand-300 hover:text-brand-600"}`}
                  onClick={() => setAudience(option)}
                >
                  {option.replace(/_/g, " ")}
                </button>
              ))}
              <label className="ml-auto inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600">
                <span>Secondary language</span>
                <select
                  className="bg-transparent text-slate-700 focus:outline-none"
                  value={languageSecondary}
                  onChange={(event) => setLanguageSecondary(event.target.value.toLowerCase())}
                >
                  <option value="es">Spanish</option>
                  <option value="en">English</option>
                  <option value="fr">French</option>
                </select>
              </label>
              <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600">
                <input type="checkbox" checked={showSpanish} onChange={(event) => setShowSpanish(event.target.checked)} />
                <span>Show Spanish</span>
              </label>
              <button
                type="button"
                className="inline-flex items-center rounded-full bg-brand-500 px-5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-600 disabled:opacity-40"
                onClick={handleCreate}
                disabled={queueing}
              >
                {queueing ? "Queuing..." : "Draft one-pager"}
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-heading text-slate-900">Step 2 — Review content</h2>
            {records.length ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-[220px,1fr]">
                <aside className="space-y-2">
                  {records.map((rec) => (
                    <button
                      key={rec.id}
                      type="button"
                      onClick={() => setSelectedId(rec.id)}
                      className={`w-full rounded-2xl border px-3 py-2 text-left text-xs transition hover:border-brand-200 ${selectedId === rec.id ? "border-brand-300 bg-brand-50" : "border-slate-200 bg-white"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900">{rec.audience.replace(/_/g, " ")}</span>
                        <StatusPill status={rec.status} />
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">{formatTimestamp(rec.updated_at) || "Just now"}</p>
                    </button>
                  ))}
                </aside>
                <div className="space-y-4">
                  {selected ? (
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Intro</p>
                        <p className="mt-1 text-sm text-slate-700">{content.intro_en || "Drafting now..."}</p>
                        {showSpanish && content.intro_es ? <p className="mt-1 text-xs text-slate-600">ES: {content.intro_es}</p> : null}
                      </div>
                      {sections.map((section, idx) => (
                        <div key={`${selected.id}-section-${idx}`} className="rounded-2xl bg-slate-50 px-4 py-3">
                          <p className="text-sm font-semibold text-slate-900">{section.heading}</p>
                          <p className="mt-1 text-sm text-slate-700">{section.body_en}</p>
                          {showSpanish && section.body_es ? <p className="mt-1 text-xs text-slate-600">ES: {section.body_es}</p> : null}
                          {(section.citations || [])
                            .map((spanId) => citationLookup.get(String(spanId)))
                            .filter(Boolean)
                            .map((entry) => (
                              <span key={`${selected.id}-section-${idx}-${entry!.index}`} className="mr-1 text-[11px] text-brand-600">[{entry!.index}]</span>
                            ))}
                        </div>
                      ))}
                      {strategies.length ? (
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Strategies</p>
                          <ul className="mt-2 space-y-2 text-sm text-slate-700">
                            {strategies.map((strategy, idx) => (
                              <li key={`${selected.id}-strategy-${idx}`} className="rounded-2xl bg-slate-50 px-3 py-2">
                                <p className="text-sm text-slate-700">{strategy.label_en}</p>
                                {showSpanish && strategy.label_es ? <p className="text-xs text-slate-600">ES: {strategy.label_es}</p> : null}
                                {(strategy.citations || [])
                                  .map((spanId) => citationLookup.get(String(spanId)))
                                  .filter(Boolean)
                                  .map((entry) => (
                                    <span key={`${selected.id}-strategy-${idx}-${entry!.index}`} className="mr-1 text-[11px] text-brand-600">[{entry!.index}]</span>
                                  ))}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {content.closing_en ? (
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Closing</p>
                          <p className="text-sm text-slate-700">{content.closing_en}</p>
                          {showSpanish && content.closing_es ? <p className="text-xs text-slate-600">ES: {content.closing_es}</p> : null}
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-2 text-xs">
                        <button
                          type="button"
                          className="inline-flex items-center rounded-full border border-brand-200 px-3 py-1 text-brand-600 transition hover:border-brand-400 hover:text-brand-700"
                          onClick={() => navigator.clipboard.writeText(buildClipboard(content, false))}
                        >
                          Copy English
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center rounded-full border border-brand-200 px-3 py-1 text-brand-600 transition hover:border-brand-400 hover:text-brand-700"
                          onClick={() => navigator.clipboard.writeText(buildClipboard(content, true))}
                        >
                          Copy bilingual
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center rounded-full border border-slate-200 px-3 py-1 text-slate-600 transition hover:border-slate-400 hover:text-slate-700"
                          onClick={() => handleRegenerate(selected.id)}
                          disabled={regenerating === selected.id}
                        >
                          {regenerating === selected.id ? "Regenerating..." : "Regenerate"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">Select a one-pager to review content.</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-4 text-xs text-slate-500">No one-pagers yet. Draft one above to get started.</p>
            )}
          </div>

          {selected ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-heading text-slate-900">Step 3 — Publish & share</h2>
              <p className="mt-2 text-xs text-slate-500">Generate a QR code and share link so staff can access this snapshot instantly.</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <button
                  type="button"
                  className="inline-flex items-center rounded-full bg-brand-500 px-5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-600 disabled:opacity-40"
                  onClick={() => handlePublish(selected.id)}
                  disabled={publishing === selected.id}
                >
                  {publishing === selected.id ? "Publishing..." : "Publish one-pager"}
                </button>
              </div>
              {shareInfo[selected.id] ? (
                <div className="mt-4 space-y-2 text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">Share link</p>
                  <p className="text-xs text-slate-500">{shareInfo[selected.id].share_url}</p>
                  <button
                    type="button"
                    className="inline-flex items-center rounded-full border border-brand-200 px-3 py-1 text-brand-600 transition hover:border-brand-400 hover:text-brand-700"
                    onClick={() => navigator.clipboard.writeText(shareInfo[selected.id].share_url)}
                  >
                    Copy link
                  </button>
                  {shareInfo[selected.id].qr_base64 ? (
                    <div className="mt-3">
                      <img src={shareInfo[selected.id].qr_base64} alt="One-pager QR code" className="h-32 w-32 rounded-lg border border-slate-200" />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <aside className="space-y-5">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-heading text-slate-900">Tips</p>
            <ul className="mt-3 space-y-2 text-xs text-slate-600">
              <li>Pick the audience closest to the staff member who needs the snapshot.</li>
              <li>Toggle Spanish to show bilingual content before copying.</li>
              <li>Publish once you’re satisfied so the share link and QR code stay up to date.</li>
            </ul>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-heading text-slate-900">Need follow-up?</p>
            <p className="mt-2 text-xs text-slate-500">Ask Joslyn to turn this snapshot into an email or meeting agenda in one click.</p>
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
