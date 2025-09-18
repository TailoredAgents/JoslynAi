"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useBootstrappedChild } from "../../../lib/use-child";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "/api/joslyn";

const TAGS = [
  { value: "general", label: "General support" },
  { value: "minutes_down", label: "Minutes decreased" },
  { value: "appeal", label: "Appeal / denial" },
  { value: "tone_support", label: "Tone / collaboration" },
];

type SafetyPhrase = {
  id: string;
  tag: string;
  status: string;
  phrase_en: string;
  phrase_es: string;
  rationale?: string | null;
  contexts: string[];
  updated_at?: string | null;
};

type PhraseResponse = { phrases: SafetyPhrase[] };

function formatTimestamp(value?: string | null) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "";
  }
}

export default function SafetyPhrasesPage() {
  const router = useRouter();
  const { child, loading: childLoading, error: childError, refresh: refreshChild } = useBootstrappedChild();
  const childId = child?.id ?? null;

  const [tag, setTag] = useState<string>("general");
  const [phrases, setPhrases] = useState<SafetyPhrase[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [queueing, setQueueing] = useState(false);

  async function loadPhrases(targetChild: string, targetTag: string) {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_BASE}/children/${targetChild}/safety/phrases?tag=${encodeURIComponent(targetTag)}`);
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const data: PhraseResponse = await res.json();
      setPhrases(Array.isArray(data?.phrases) ? data.phrases : []);
    } catch (err) {
      console.error(err);
      setErrorMessage("We could not load phrase suggestions yet.");
    } finally {
      setLoading(false);
    }
  }

  async function queuePhrase() {
    if (!childId) return;
    setQueueing(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_BASE}/children/${childId}/safety/phrases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag }),
      });
      if (!res.ok) throw new Error(`Failed to queue (${res.status})`);
      await loadPhrases(childId, tag);
    } catch (err) {
      console.error(err);
      setErrorMessage("We could not queue a new phrase right now. Try again soon.");
    } finally {
      setQueueing(false);
    }
  }

  useEffect(() => {
    if (!childId) return;
    loadPhrases(childId, tag);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId, tag]);

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

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 py-8">
      <header className="rounded-3xl bg-gradient-to-r from-brand-500 to-brand-600 px-6 py-5 text-white shadow-uplift">
        <p className="text-xs uppercase tracking-wide text-brand-100/90">Safety phrases</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-2xl font-semibold">Guided phrasing for tough moments</h1>
          <button
            type="button"
            className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white transition hover:bg-white/25 disabled:opacity-40"
            onClick={() => childId && loadPhrases(childId, tag)}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-brand-50">Joslyn suggests trauma-informed language in both English and Spanish so you can respond quickly without losing your voice.</p>
      </header>

      {errorMessage ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorMessage}</div>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-heading text-slate-900">Choose a context</h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {TAGS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition ${tag === option.value ? "border-brand-300 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:border-brand-300 hover:text-brand-600"}`}
                  onClick={() => setTag(option.value)}
                >
                  {option.label}
                </button>
              ))}
              <button
                type="button"
                className="inline-flex items-center rounded-full bg-brand-500 px-5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-600 disabled:opacity-40"
                onClick={queuePhrase}
                disabled={queueing}
              >
                {queueing ? "Generating..." : "Generate fresh wording"}
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-heading text-slate-900">Suggested phrases</h2>
            {loading ? (
              <p className="mt-4 text-xs text-slate-500">Gathering supportive wording...</p>
            ) : phrases.length ? (
              <ul className="mt-4 space-y-3">
                {phrases.map((phrase) => (
                  <li key={phrase.id} className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs uppercase tracking-wide text-slate-400">{phrase.tag}</span>
                      <span className="text-[11px] text-slate-400">{formatTimestamp(phrase.updated_at) || "just now"}</span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{phrase.phrase_en || "Drafting..."}</p>
                    {phrase.phrase_es ? <p className="mt-1 text-xs text-slate-600">ES: {phrase.phrase_es}</p> : null}
                    {phrase.rationale ? <p className="mt-2 text-xs text-slate-500">Why it helps: {phrase.rationale}</p> : null}
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                      <button
                        type="button"
                        className="inline-flex items-center rounded-full border border-brand-200 px-3 py-1 text-brand-600 transition hover:border-brand-400 hover:text-brand-700"
                        onClick={() => navigator.clipboard.writeText(phrase.phrase_en)}
                      >
                        Copy English
                      </button>
                      {phrase.phrase_es ? (
                        <button
                          type="button"
                          className="inline-flex items-center rounded-full border border-brand-200 px-3 py-1 text-brand-600 transition hover:border-brand-400 hover:text-brand-700"
                          onClick={() => navigator.clipboard.writeText(`${phrase.phrase_en}
${phrase.phrase_es}`)}
                        >
                          Copy bilingual
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-xs text-slate-500">No saved phrasing yet. Generate a new suggestion above.</p>
            )}
          </div>
        </div>

        <aside className="space-y-5">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-heading text-slate-900">Tips</p>
            <ul className="mt-3 space-y-2 text-xs text-slate-600">
              <li>Copy the bilingual version when you need a ready-made message for staff or caregivers.</li>
              <li>Queue a new phrase whenever the situation shifts or you need a different tone.</li>
              <li>Add context in chat so Joslyn tailors the phrasing to your exact moment.</li>
            </ul>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-heading text-slate-900">Need more support?</p>
            <p className="mt-2 text-xs text-slate-500">Ask Joslyn to turn these phrases into emails, meeting scripts, or follow-up notes.</p>
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
