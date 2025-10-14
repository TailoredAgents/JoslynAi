"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_BASE_URL || "/api/joslyn";

const steps = [
  { id: 1, title: "Say hello", subtitle: "Give us a few basics" },
  { id: 2, title: "Share paperwork", subtitle: "Upload or use a demo IEP" },
  { id: 3, title: "See your brief", subtitle: "Ask Joslyn what it found" },
  { id: 4, title: "Draft a letter", subtitle: "Request services with confidence" },
];

type JobRow = { id: string; type: string; status: string };

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [childId, setChildId] = useState<string>("");
  const [docId, setDocId] = useState<string>("");
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [answer, setAnswer] = useState<string>("");
  const [letterId, setLetterId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [bootstrapPending, setBootstrapPending] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const progress = useMemo(() => ({ width: `${(step / steps.length) * 100}%` }), [step]);
  const actionsDisabled = loading || bootstrapPending || !!bootstrapError;

  const safeFetch = useCallback(async (url: string, init: RequestInit = {}) => {
    const method = (init.method || "GET").toUpperCase();
    const headers = new Headers(init.headers as HeadersInit);
    const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
    if (!isFormData && method !== "GET" && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const resp = await fetch(url, {
      cache: "no-store",
      credentials: "include",
      ...init,
      method,
      headers,
    });
    if (!resp.ok) {
      const message = await resp.text().catch(() => resp.statusText);
      throw new Error(message || `HTTP ${resp.status}`);
    }
    return resp;
  }, []);

  const bootstrapOrg = useCallback(async () => {
    setBootstrapPending(true);
    setBootstrapError(null);
    try {
      await safeFetch(`${API}/orgs/bootstrap`, { method: "POST", body: JSON.stringify({}) });
    } catch (err) {
      setBootstrapError(err instanceof Error ? err.message : "We couldn't prepare your workspace yet.");
      return;
    } finally {
      setBootstrapPending(false);
    }
  }, [safeFetch]);

  useEffect(() => {
    bootstrapOrg();
  }, [bootstrapOrg]);

  useEffect(() => {
    if (!childId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await safeFetch(`${API}/jobs?child_id=${childId}`);
        const data: JobRow[] = await res.json();
        if (cancelled) return;
        setJobs(data);
        const allDone = data.every((job) => job.status === "done");
        if (!allDone && !cancelled) {
          setTimeout(poll, 2500);
        }
      } catch (err) {
        if (!cancelled) {
          setGlobalError(err instanceof Error ? err.message : "We couldn't check job status right now.");
        }
      }
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, [childId, safeFetch]);

  async function createChild() {
    if (actionsDisabled) return;
    setLoading(true);
    setGlobalError(null);
    try {
      const res = await safeFetch(`${API}/children`, {
        method: "POST",
        body: JSON.stringify({ name: "Your child" }),
      });
      const data = await res.json();
      setChildId(data.child_id);
      setStep(2);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "We couldn't start your workspace just yet.");
    } finally {
      setLoading(false);
    }
  }

  async function useSample() {
    if (actionsDisabled || !childId) return;
    setLoading(true);
    setGlobalError(null);
    try {
      const form = new FormData();
      try {
        const sample = await fetch("/dev_samples/sample-iep.pdf");
        const blob = await sample.blob();
        form.append("file", blob, "sample-iep.pdf");
      } catch {
        const file = new File([new Blob([""], { type: "application/pdf" })], "sample-iep.pdf");
        form.append("file", file);
      }
      const response = await fetch(`${API}/children/${childId}/documents`, {
        method: "POST",
        body: form as any,
        cache: "no-store",
        credentials: "include",
      });
      if (!response.ok) {
        const message = await response.text().catch(() => response.statusText);
        throw new Error(message || "Upload failed.");
      }
      const data = await response.json();
      setDocId(data.document_id);
      setStep(3);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "We couldn't upload that document just yet.");
    } finally {
      setLoading(false);
    }
  }

  async function runBriefAsk() {
    if (actionsDisabled || !docId || !childId) return;
    setLoading(true);
    setGlobalError(null);
    try {
      await safeFetch(`${API}/documents/${docId}/brief?child_id=${childId}&lang=en`);
      const ask = await safeFetch(`${API}/children/${childId}/ask`, {
        method: "POST",
        body: JSON.stringify({ query: "What services and minutes are listed?" }),
      });
      const payload = await ask.json();
      setAnswer(payload.answer || "We highlighted the services and minutes for you.");
      setStep(4);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "We couldn't generate that brief just yet.");
    } finally {
      setLoading(false);
    }
  }

  async function draftLetter() {
    if (actionsDisabled || !childId) return;
    setLoading(true);
    setGlobalError(null);
    try {
      const today = new Date();
      const replyBy = new Date(Date.now() + 7 * 86400000);
      const res = await safeFetch(`${API}/tools/letter/draft`, {
        method: "POST",
        body: JSON.stringify({
          kind: "evaluation-request",
          merge_fields: {
            child_id: childId,
            parent_name: "A loving parent",
            child_name: "Your child",
            school_name: "Neighborhood Elementary",
            requested_areas: "Speech & OT",
            todays_date: today.toISOString().slice(0, 10),
            reply_by: replyBy.toISOString().slice(0, 10),
          },
        }),
      });
      const data = await res.json();
      setLetterId(data.letter_id);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "We couldn't draft that letter just yet.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-10 py-10">
      <header className="space-y-4">
        <span className="inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-600">
          Guided setup
        </span>
        <h1 className="text-3xl font-heading text-slate-900">
          Let&apos;s get your Joslyn workspace ready.
        </h1>
        <p className="max-w-2xl text-sm text-slate-600">
          We&apos;ll prepare your sandbox, add a sample child, and walk through key automations.
        </p>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200/60">
          <div className="h-full rounded-full bg-brand-500 transition-all" style={progress} />
        </div>
      </header>

      <StatusBanner pending={bootstrapPending} error={bootstrapError} onRetry={bootstrapOrg} />
      {globalError && (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {globalError}
        </div>
      )}

      <section className="space-y-10">
        {step === 1 && (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="space-y-4">
              <h2 className="text-2xl font-heading text-slate-900">Say hello to Joslyn</h2>
              <p className="text-sm text-slate-600">
                We&apos;ll create a safe workspace so you can explore without touching real records.
              </p>
              <button
                className="inline-flex items-center rounded-full bg-brand-500 px-6 py-3 text-sm font-semibold text-white shadow-uplift transition hover:bg-brand-600 disabled:opacity-40"
                onClick={createChild}
                disabled={actionsDisabled}
              >
                {loading ? "Preparing workspace..." : "Create demo child"}
              </button>
              <p className="text-xs text-slate-500">
                We&apos;ll add a placeholder child to keep everything scoped to your organization.
              </p>
            </div>
            <aside className="rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-500">
              <p className="font-heading text-sm text-slate-700">Why we do this</p>
              <p className="mt-3">
                Joslyn is multi-tenant. Bootstrapping your org ensures documents, timelines, and letters stay private to your team.
              </p>
            </aside>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="space-y-4">
              <h2 className="text-2xl font-heading text-slate-900">Upload or explore with a sample IEP</h2>
              <p className="text-sm text-slate-600">
                Drop in a document anytime. For this walkthrough we&apos;ll use a short demo IEP to show what Joslyn surfaces.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  className="inline-flex items-center rounded-full border border-brand-200 px-5 py-2 text-sm font-semibold text-brand-600 transition hover:border-brand-400"
                  disabled
                >
                  Upload my IEP (coming soon)
                </button>
                <button
                  className="inline-flex items-center rounded-full bg-brand-500 px-5 py-2 text-sm font-semibold text-white shadow-uplift transition hover:bg-brand-600 disabled:opacity-40"
                  onClick={useSample}
                  disabled={actionsDisabled || !childId}
                >
                  {loading ? "Loading sample..." : "Use sample IEP"}
                </button>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Processing status</p>
                <ul className="mt-2 space-y-2 text-xs text-slate-600">
                  {jobs.length === 0 && <li className="text-slate-400">No jobs running yet.</li>}
                  {jobs.map((job) => (
                    <li key={job.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2">
                      <span className="capitalize">{job.type.replace(/_/g, " ")}</span>
                      <span className={`text-xs font-semibold ${job.status === "done" ? "text-emerald-600" : "text-slate-500"}`}>
                        {job.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex justify-end">
                <button
                  className="inline-flex items-center rounded-full bg-brand-500 px-6 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-40"
                  onClick={() => setStep(3)}
                  disabled={!docId || loading}
                >
                  Continue to brief
                </button>
              </div>
            </div>
            <aside className="rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-500">
              <p className="font-heading text-sm text-slate-700">What we extract</p>
              <ul className="mt-3 space-y-2">
                <li>Service minutes and providers</li>
                <li>Goals and progress notes</li>
                <li>Dates, accommodations, and red flags</li>
              </ul>
            </aside>
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="space-y-4">
              <h2 className="text-2xl font-heading text-slate-900">Let Joslyn walk the IEP with you</h2>
              <p className="text-sm text-slate-600">
                We&apos;ll generate a quick brief and answer a sample question about services and minutes.
              </p>
              <button
                className="inline-flex items-center rounded-full bg-brand-500 px-6 py-3 text-sm font-semibold text-white shadow-uplift transition hover:bg-brand-600 disabled:opacity-40"
                onClick={runBriefAsk}
                disabled={actionsDisabled || !docId}
              >
                {loading ? "Creating brief..." : "Run brief & ask"}
              </button>
              {answer && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Answer highlight</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{answer}</p>
                  <Link className="mt-3 inline-flex items-center text-xs font-semibold text-brand-600" href={docId ? `/documents/${docId}/view` : "#"}>
                    View citations and highlights
                  </Link>
                </div>
              )}
              <div className="flex justify-end">
                <button
                  className="inline-flex items-center rounded-full bg-brand-500 px-6 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-40"
                  onClick={() => setStep(4)}
                  disabled={!answer}
                >
                  Continue to letter draft
                </button>
              </div>
            </div>
            <aside className="rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-500">
              <p className="font-heading text-sm text-slate-700">Why this matters</p>
              <p className="mt-3 text-sm">
                Knowing exactly what services are documented helps you anchor requests and celebrate wins.
              </p>
            </aside>
          </div>
        )}

        {step === 4 && (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="space-y-4">
              <h2 className="text-2xl font-heading text-slate-900">Draft an evaluation request letter</h2>
              <p className="text-sm text-slate-600">
                Joslyn personalizes the tone and details. Review, adjust, then render as PDF or send securely.
              </p>
              <button
                className="inline-flex items-center rounded-full bg-brand-500 px-6 py-3 text-sm font-semibold text-white shadow-uplift transition hover:bg-brand-600 disabled:opacity-40"
                onClick={draftLetter}
                disabled={actionsDisabled || !childId}
              >
                {loading ? "Drafting..." : "Draft evaluation letter"}
              </button>
              {letterId && (
                <div className="rounded-2xl border border-brand-100 bg-brand-50 p-4 text-sm text-brand-700">
                  <p className="font-semibold">Letter ready!</p>
                  <p className="mt-1 text-sm text-brand-600/80">
                    Preview or send to see bilingual options and tracked delivery.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Link className="inline-flex items-center rounded-full border border-brand-300 px-4 py-2 text-xs font-semibold text-brand-600 transition hover:border-brand-400" href={`/letters/${letterId}/render`}>
                      Render PDF
                    </Link>
                    <Link className="inline-flex items-center rounded-full bg-brand-500 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-600" href={`/letters/${letterId}/send`}>
                      Send letter
                    </Link>
                  </div>
                </div>
              )}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
                <p className="font-heading text-sm text-slate-700">Need a human check?</p>
                <p className="mt-1 text-xs">
                  Book a session with a Joslyn AI care guide. We&apos;re former educators and advocates who speak parent.
                </p>
                <Link className="mt-3 inline-flex items-center text-xs font-semibold text-brand-600" href="mailto:hello@joslyn.ai">
                  Schedule a session
                </Link>
              </div>
            </div>
            <aside className="rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-500">
              <p className="font-heading text-sm text-slate-700">What&apos;s next?</p>
              <ul className="mt-3 space-y-2">
                <li>Invite your IEP team to the workspace</li>
                <li>Translate your child story to Spanish in one click</li>
                <li>Track reimbursements and upcoming meetings</li>
              </ul>
            </aside>
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-brand-100 bg-brand-50/60 p-6 text-sm text-brand-700">
        <p className="font-heading text-sm uppercase tracking-[0.4em] text-brand-600/70">Need help?</p>
        <p className="mt-2 max-w-2xl text-sm">
          Live chat with us inside the app, or email <Link className="font-semibold underline" href="mailto:hello@joslyn.ai">hello@joslyn.ai</Link>. We support English and Spanish.
        </p>
      </section>
    </div>
  );
}

function StatusBanner({ pending, error, onRetry }: { pending: boolean; error: string | null; onRetry: () => void }) {
  if (pending) {
    return (
      <div className="rounded-3xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-700">
        Preparing your workspace...
      </div>
    );
  }
  if (!error) return null;
  return (
    <div className="flex items-center justify-between rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
      <span>{error}</span>
      <button className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:border-rose-400" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
