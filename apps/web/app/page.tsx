"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { encodeQjson } from "../lib/qjson";
import en from "../i18n/messages/en.json";
import es from "../i18n/messages/es.json";
import { useBootstrappedChild } from "../lib/use-child";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "/api/joslyn";

const featureHighlights = [
  {
    title: "Upload & glow",
    body: "Drop in evaluations, IEPs, or 504 plans. We extract services, goals, and red flags automatically.",
    icon: "??"
  },
  {
    title: "Deadlines on autopilot",
    body: "Never miss a meeting or response window. Personalized timelines adapt to your jurisdiction.",
    icon: "?"
  },
  {
    title: "Parent-friendly letters",
    body: "Draft requests, follow-ups, and gratitude notes in minutes—ready to translate and send.",
    icon: "??"
  }
];

export default function HomePage() {
  const [q, setQ] = useState("How many OT minutes does my child receive each week?");
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [citations, setCitations] = useState<any[]>([]);
  const [msgs, setMsgs] = useState<any>(en as any);

  const { child, loading: childLoading, error: childError } = useBootstrappedChild();
  const childId = child?.id ?? null;
  const childReady = Boolean(childId);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const lang = (sp.get("lang") || "en").toLowerCase();
      setMsgs(lang === "es" ? (es as any) : (en as any));
    }
  }, []);

  const askLabel = useMemo(() => msgs?.["home.ask.title"] ?? "Ask Joslyn about your paperwork", [msgs]);

  async function ask() {
    if (!childReady || !childId) return;
    setLoading(true);
    setAnswer(null);
    try {
      const res = await fetch(`${API_BASE}/children/${childId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q })
      });
      const data = await res.json();
      setAnswer(data?.answer ?? "I couldn't find that yet. Try another question?");
      setCitations(data?.citations ?? []);
    } catch (e) {
      setAnswer("We hit a bump. Please try again in a moment.");
      setCitations([]);
    } finally {
      setLoading(false);
    }
  }

  if (childLoading && !childReady) {
    return <div className="space-y-20 py-20 text-center text-sm text-slate-500">Loading child workspace...</div>;
  }

  if (!childLoading && !childReady) {
    return (
      <div className="space-y-20 py-20 text-center text-sm text-slate-500">
        <p className="font-semibold text-rose-500">Unable to load your child workspace.</p>
        {childError ? <p className="text-xs text-rose-400">{childError}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-20">
      <section className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <span className="inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-700">
            Trusted by advocates, parents, and educators
          </span>
          <h1 className="text-4xl font-heading text-slate-900 sm:text-5xl">
            All the clarity, compassion, and momentum your child deserves in one workspace.
          </h1>
          <p className="max-w-2xl text-lg text-slate-600">
            Joslyn AI turns dense documents into guidance you can act on. Ask questions with citations, see deadlines surface automatically, and share warm snapshots about your child in English and Spanish.
          </p>
          <p className="max-w-2xl text-sm text-slate-600">
            She also coaches you through everyday decisions—explaining special education jargon, suggesting questions for your care team, and sharing self-care ideas for parents navigating the special-needs world.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/onboarding"
              className="inline-flex items-center rounded-full bg-brand-500 px-6 py-3 text-sm font-semibold text-white shadow-uplift transition hover:bg-brand-600"
            >
              Start a guided onboarding
            </Link>
            <Link
              href="/copilot"
              className="inline-flex items-center rounded-full border border-brand-200 px-6 py-3 text-sm font-semibold text-brand-600 transition hover:border-brand-400 hover:text-brand-700"
            >
              Open the copilot workspace
            </Link>
            <Link
              href="mailto:hello@joslyn.ai"
              className="inline-flex items-center rounded-full border border-brand-200 px-6 py-3 text-sm font-semibold text-brand-600 transition hover:border-brand-400 hover:text-brand-700"
            >
              Meet with a care guide
            </Link>
          </div>
          <dl className="grid max-w-xl gap-6 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <dt className="text-xs uppercase tracking-wide text-slate-400">Documents analyzed</dt>
              <dd className="mt-1 text-2xl font-heading text-slate-900">2,400+</dd>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <dt className="text-xs uppercase tracking-wide text-slate-400">Minutes reclaimed</dt>
              <dd className="mt-1 text-2xl font-heading text-slate-900">18 hrs / month</dd>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <dt className="text-xs uppercase tracking-wide text-slate-400">Families supported</dt>
              <dd className="mt-1 text-2xl font-heading text-slate-900">650+</dd>
            </div>
          </dl>
        </div>

        <aside className="relative rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-xl shadow-brand-500/10 ring-1 ring-slate-100">
          <div className="absolute -top-7 left-6 inline-flex items-center rounded-full border border-brand-200 bg-white px-4 py-1 text-xs font-semibold uppercase tracking-wide text-brand-600 shadow-sm">
            Live preview
          </div>
          <h2 className="text-lg font-heading text-slate-900">{askLabel}</h2>
          <p className="mt-1 text-sm text-slate-500">Not legal or medical advice?just clarity, fast.</p>
          <div className="mt-4 flex gap-2">
            <input
              className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm shadow-inner focus:border-brand-400 focus:outline-none focus:ring focus:ring-brand-200/60"
              placeholder="Try: Where are speech minutes listed?"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button
              className="inline-flex items-center rounded-2xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white shadow-uplift transition hover:bg-brand-600"
              onClick={ask}
              disabled={loading || !childReady}
            >
              {loading ? "Thinking..." : "Ask"}
            </button>
          </div>
          {answer && (
            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
                <p className="text-sm text-slate-600 whitespace-pre-wrap">{answer}</p>
              </div>
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Supporting snippets</p>
                {citations.length === 0 && (
                  <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">Upload a sample IEP to see highlights here.</p>
                )}
                {citations.length > 0 && (() => {
                  const byDoc = new Map<string, { doc_name: string; cites: { page: number; quote: string }[] }>();
                  for (const c of citations || []) {
                    const id = c.document_id as string;
                    const entry = byDoc.get(id) ?? { doc_name: c.doc_name || "Document", cites: [] as { page: number; quote: string }[] };
                    if (!entry.cites.some((x) => x.page === Number(c.page) && x.quote === (c.quote || ""))) {
                      entry.cites.push({ page: Number(c.page), quote: c.quote || "" });
                    }
                    byDoc.set(id, entry);
                  }
                  return [...byDoc.entries()].slice(0, 1).map(([docId, { doc_name, cites }]) => {
                    const qjson = encodeQjson(cites, 12);
                    return (
                      <div key={docId} className="space-y-2 rounded-2xl border border-slate-200 bg-white/80 p-3 text-xs text-slate-500">
                        <div className="flex items-center justify-between text-slate-600">
                          <span className="font-semibold text-slate-700">{doc_name}</span>
                          <Link className="text-brand-500 hover:text-brand-600" href={`/documents/${docId}/view?qjson=${encodeURIComponent(qjson)}`} target="_blank">
                            View highlights ?
                          </Link>
                        </div>
                        <p>p.{cites[0]?.page}: {cites[0]?.quote.slice(0, 100)}{cites[0]?.quote.length > 100 ? "..." : ""}</p>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}
        </aside>
      </section>

      <section id="features" className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {featureHighlights.map((feat) => (
          <div key={feat.title} className="flex h-full flex-col rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10 text-2xl">{feat.icon}</div>
            <h3 className="mt-4 text-lg font-heading text-slate-900">{feat.title}</h3>
            <p className="mt-2 text-sm text-slate-600">{feat.body}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-8 lg:grid-cols-[420px_minmax(0,1fr)]">
        <div className="rounded-3xl border border-brand-100 bg-white p-6 shadow-uplift">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-500">Why families choose us</p>
          <h2 className="mt-2 text-2xl font-heading text-slate-900">Designed with neurodiverse caregivers, advocates, and educators.</h2>
          <p className="mt-3 text-sm text-slate-600">Joslyn AI pairs intelligent automation with human warmth. See every service minute, timeline risk, and letter drafted in plain languageand lean on her when you need advocacy tips or emotional reassurance.</p>
          <div className="mt-6 space-y-4 text-sm text-slate-600">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              Joslyn AI helps me walk into meetings calm, confident, and prepared to celebrate my kid.<br />
              <span className="mt-2 block font-semibold text-slate-800">? Priya, mom & advocate</span>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              &quot;Our team trusts the citations and loves that the letters sound human�because they are.&quot;<br />
              <span className="mt-2 block font-semibold text-slate-800">? Marisol, special education director</span>
            </div>
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm">
          <h3 className="text-lg font-heading text-slate-900">Ready when you are</h3>
          <ul className="mt-4 grid gap-4 text-sm text-slate-600 sm:grid-cols-2">
            <li className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="font-semibold text-slate-800">Guided onboarding</p>
              <p className="mt-1 text-xs">Create a child profile, upload sample docs, and see an instant brief.</p>
              <Link className="mt-3 inline-flex items-center text-xs font-semibold text-brand-600 hover:text-brand-700" href="/onboarding">
                Begin now →
              </Link>
            </li>
            <li className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="font-semibold text-slate-800">Share a story</p>
              <p className="mt-1 text-xs">Capture strengths, sensory preferences, and joy to share with new providers.</p>
              <Link className="mt-3 inline-flex items-center text-xs font-semibold text-brand-600 hover:text-brand-700" href="/about-my-child">
                Build profile →
              </Link>
            </li>
            <li className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="font-semibold text-slate-800">Draft letters</p>
              <p className="mt-1 text-xs">Request evaluations, clarify services, and send gratitude in minutes.</p>
              <Link className="mt-3 inline-flex items-center text-xs font-semibold text-brand-600 hover:text-brand-700" href="/letters/new">
                Compose now →
              </Link>
            </li>
            <li className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="font-semibold text-slate-800">Track claims</p>
              <p className="mt-1 text-xs">Organize reimbursements and explanation of benefits in one spot.</p>
              <Link className="mt-3 inline-flex items-center text-xs font-semibold text-brand-600 hover:text-brand-700" href="/claims/demo">
                Review sample →
              </Link>
            </li>
          </ul>
        </div>
      </section>

      <section id="pricing" className="relative overflow-hidden rounded-3xl border border-brand-100 bg-white p-0 shadow-uplift">
        <div className="grid gap-6 p-10 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-heading text-slate-900">Basic</h2>
            <p className="mt-1 text-sm text-slate-500">Core tools to get started.</p>
            <p className="mt-4 text-3xl font-heading text-slate-900">$9<span className="text-sm text-slate-500">/mo</span></p>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              <li>Ask questions with citations</li>
              <li>Brief and letter drafts</li>
            </ul>
            <div className="mt-6 flex gap-2">
              <Link href="/onboarding" className="inline-flex items-center rounded-full bg-brand-500 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-600">Create free workspace</Link>
              <Link href="/api/auth/signin" className="inline-flex items-center rounded-full border border-brand-200 px-5 py-2 text-sm font-semibold text-brand-600 hover:border-brand-400 hover:text-brand-700">Log in</Link>
            </div>
          </div>

          <div className="rounded-3xl border border-brand-200 bg-white p-6 shadow-sm ring-1 ring-brand-100">
            <div className="inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-600">Most popular</div>
            <h2 className="mt-2 text-lg font-heading text-slate-900">Pro</h2>
            <p className="mt-1 text-sm text-slate-500">Everything in Basic, plus automation.</p>
            <p className="mt-4 text-3xl font-heading text-slate-900">$29<span className="text-sm text-slate-500">/mo</span></p>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              <li>Smart attachments</li>
              <li>Send letters</li>
              <li>Priority support</li>
            </ul>
            <div className="mt-6 flex gap-2">
              <Link href="/onboarding" className="inline-flex items-center rounded-full bg-brand-500 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-600">Start Pro trial</Link>
              <Link href="/api/auth/signin" className="inline-flex items-center rounded-full border border-brand-200 px-5 py-2 text-sm font-semibold text-brand-600 hover:border-brand-400 hover:text-brand-700">Log in</Link>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-heading text-slate-900">Business</h2>
            <p className="mt-1 text-sm text-slate-500">Teams and organizations.</p>
            <p className="mt-4 text-3xl font-heading text-slate-900">$79<span className="text-sm text-slate-500">/mo</span></p>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              <li>Admin insights</li>
              <li>Advocacy & recommendations</li>
              <li>IEP diff</li>
            </ul>
            <div className="mt-6 flex gap-2">
              <Link href="/onboarding" className="inline-flex items-center rounded-full bg-brand-500 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-600">Talk to sales</Link>
              <Link href="/api/auth/signin" className="inline-flex items-center rounded-full border border-brand-200 px-5 py-2 text-sm font-semibold text-brand-600 hover:border-brand-400 hover:text-brand-700">Log in</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden rounded-3xl border border-brand-100 bg-gradient-to-r from-brand-500 via-brand-400 to-blush-400 p-10 text-white shadow-uplift">
        <div className="max-w-3xl space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Parents + advocates</p>
          <h2 className="text-3xl font-heading">Let&apos;s make every meeting feel collaborative, not combative.</h2>
          <p className="text-sm text-white/80">Invite your team, share bilingual summaries, and walk in knowing the data has your back.</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/onboarding" className="inline-flex items-center rounded-full bg-white px-5 py-2 text-sm font-semibold text-brand-600 shadow-sm transition hover:bg-slate-100">
              Create a free workspace
            </Link>
            <Link href="mailto:hello@joslyn.ai" className="inline-flex items-center rounded-full border border-white/60 px-5 py-2 text-sm font-semibold text-white transition hover:bg-white/10">
              Invite Joslyn AI to your next IEP
            </Link>
          </div>
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
      </section>
    </div>
  );
}


















