"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

const steps = [
  { id: 1, title: "Say hello", subtitle: "Give us a few basics" },
  { id: 2, title: "Share paperwork", subtitle: "Upload or use a demo IEP" },
  { id: 3, title: "See your brief", subtitle: "Ask Joslyn what it found" },
  { id: 4, title: "Draft a letter", subtitle: "Request services with confidence" }
];

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [childId, setChildId] = useState<string>("");
  const [docId, setDocId] = useState<string>("");
  const [jobs, setJobs] = useState<any[]>([]);
  const [answer, setAnswer] = useState<string>("");
  const [letterId, setLetterId] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    pollJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId]);

  const progress = useMemo(() => ({ width: `${(step / steps.length) * 100}%` }), [step]);

  async function createChild() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/children`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Your child" })
      });
      const data = await res.json();
      setChildId(data.child_id);
      setStep(2);
    } finally {
      setLoading(false);
    }
  }

  async function useSample() {
    if (!childId) return;
    setLoading(true);
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
      const up = await fetch(`${API}/children/${childId}/documents`, { method: "POST", body: form as any });
      const data = await up.json();
      setDocId(data.document_id);
      setStep(3);
    } finally {
      setLoading(false);
    }
  }

  async function pollJobs() {
    if (!childId) return;
    const res = await fetch(`${API}/jobs?child_id=${childId}`);
    const data = await res.json();
    setJobs(data);
    const done = data.every((j: any) => j.status === "done");
    if (!done) setTimeout(pollJobs, 2500);
  }

  async function runBriefAsk() {
    if (!docId || !childId) return;
    setLoading(true);
    try {
      await fetch(`${API}/documents/${docId}/brief?child_id=${childId}&lang=en`);
      const ask = await fetch(`${API}/children/${childId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "What services and minutes are listed?" })
      });
      const a = await ask.json();
      setAnswer(a.answer || "We highlighted the services and minutes for you.");
      setStep(4);
    } finally {
      setLoading(false);
    }
  }

  async function draftLetter() {
    setLoading(true);
    try {
      const today = new Date();
      const replyBy = new Date(Date.now() + 7 * 86400000);
      const res = await fetch(`${API}/tools/letter/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "evaluation-request",
          merge_fields: {
            child_id: childId,
            parent_name: "A loving parent",
            child_name: "Your child",
            school_name: "Neighborhood Elementary",
            requested_areas: "Speech & OT",
            todays_date: today.toISOString().slice(0, 10),
            reply_by: replyBy.toISOString().slice(0, 10)
          }
        })
      });
      const d = await res.json();
      setLetterId(d.letter_id);
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
        <h1 className="text-3xl font-heading text-slate-900 sm:text-4xl">Let’s tailor Joslyn for your family.</h1>
        <p className="max-w-2xl text-sm text-slate-500">
          This walkthrough uses a demo IEP so you can see Joslyn in action. Swap in your own paperwork at any time.
        </p>
        <div className="relative h-2 overflow-hidden rounded-full bg-slate-200/60">
          <div className="h-full rounded-full bg-brand-500 transition-all" style={progress} />
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs text-slate-500 sm:grid-cols-4">
          {steps.map((s) => (
            <div key={s.id} className={`rounded-2xl border px-3 py-3 ${step >= s.id ? "border-brand-200 bg-brand-50 text-brand-600" : "border-slate-200 bg-white"}`}>
              <p className="font-semibold text-slate-700">Step {s.id}</p>
              <p className="text-[11px] leading-relaxed">{s.title}</p>
            </div>
          ))}
        </div>
      </header>

      <section className="space-y-10 rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-brand-500/10">
        {step === 1 && (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="space-y-6">
              <h2 className="text-2xl font-heading text-slate-900">Start with a child profile</h2>
              <p className="text-sm text-slate-600">We’ll create a safe workspace for your child. Later, add strengths, sensory preferences, and team members.</p>
              <button className="inline-flex items-center rounded-full bg-brand-500 px-6 py-3 text-sm font-semibold text-white shadow-uplift transition hover:bg-brand-600" onClick={createChild} disabled={loading}>
                {loading ? "Creating..." : "Create child workspace"}
              </button>
            </div>
            <aside className="rounded-2xl border border-brand-100 bg-brand-50 p-5 text-sm text-brand-700">
              <p className="font-heading text-sm uppercase tracking-[0.3em] text-brand-600/70">Tip</p>
              <p className="mt-2 text-sm">You can invite partners, teachers, or advocates later. Everyone sees the same story.
              </p>
            </aside>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="space-y-4">
              <h2 className="text-2xl font-heading text-slate-900">Upload or explore with a sample IEP</h2>
              <p className="text-sm text-slate-600">Drop in a document anytime. For this walkthrough we’ll use a short demo IEP to show what Joslyn surfaces.</p>
              <div className="flex flex-wrap gap-3">
                <button className="inline-flex items-center rounded-full border border-brand-200 px-5 py-2 text-sm font-semibold text-brand-600 transition hover:border-brand-400" disabled>
                  Upload my IEP (coming soon)
                </button>
                <button className="inline-flex items-center rounded-full bg-brand-500 px-5 py-2 text-sm font-semibold text-white shadow-uplift transition hover:bg-brand-600" onClick={useSample} disabled={loading || !childId}>
                  {loading ? "Loading sample..." : "Use sample IEP"}
                </button>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Processing status</p>
                <ul className="mt-2 space-y-2 text-xs text-slate-600">
                  {jobs.length === 0 && <li className="text-slate-400">No jobs running yet.</li>}
                  {jobs.map((j) => (
                    <li key={j.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2">
                      <span className="capitalize">{j.type.replace(/_/g, " ")}</span>
                      <span className={`text-xs font-semibold ${j.status === "done" ? "text-emerald-600" : "text-slate-500"}`}>{j.status}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex justify-end">
                <button className="inline-flex items-center rounded-full bg-brand-500 px-6 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-40" onClick={() => setStep(3)} disabled={!docId || loading}>
                  Continue to brief
                </button>
              </div>
            </div>
            <aside className="rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-500">
              <p className="font-heading text-sm text-slate-700">What we extract</p>
              <ul className="mt-3 space-y-2">
                <li>• Service minutes and providers</li>
                <li>• Goals and progress notes</li>
                <li>• Dates, accommodations, and red flags</li>
              </ul>
            </aside>
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="space-y-4">
              <h2 className="text-2xl font-heading text-slate-900">Let Joslyn walk the IEP with you</h2>
              <p className="text-sm text-slate-600">We’ll generate a quick brief and answer a sample question about services and minutes.</p>
              <button className="inline-flex items-center rounded-full bg-brand-500 px-6 py-3 text-sm font-semibold text-white shadow-uplift transition hover:bg-brand-600" onClick={runBriefAsk} disabled={loading || !docId}>
                {loading ? "Creating brief..." : "Run brief & ask"}
              </button>
              {answer && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Answer highlight</p>
                  <p className="mt-2 text-sm text-slate-600 whitespace-pre-wrap">{answer}</p>
                  <Link className="mt-3 inline-flex items-center text-xs font-semibold text-brand-600" href={docId ? `/documents/${docId}/view` : "#"}>
                    View citations and highlights ?
                  </Link>
                </div>
              )}
              <div className="flex justify-end">
                <button className="inline-flex items-center rounded-full bg-brand-500 px-6 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-40" onClick={() => setStep(4)} disabled={!answer}>
                  Continue to letter draft
                </button>
              </div>
            </div>
            <aside className="rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-500">
              <p className="font-heading text-sm text-slate-700">Why this matters</p>
              <p className="mt-3 text-sm">Knowing exactly what services are documented helps you anchor requests and celebrate wins.</p>
            </aside>
          </div>
        )}

        {step === 4 && (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="space-y-4">
              <h2 className="text-2xl font-heading text-slate-900">Draft an evaluation request letter</h2>
              <p className="text-sm text-slate-600">Joslyn personalizes the tone and details. Review, adjust, then render as PDF or send securely.</p>
              <button className="inline-flex items-center rounded-full bg-brand-500 px-6 py-3 text-sm font-semibold text-white shadow-uplift transition hover:bg-brand-600" onClick={draftLetter} disabled={loading || !childId}>
                {loading ? "Drafting..." : "Draft evaluation letter"}
              </button>
              {letterId && (
                <div className="rounded-2xl border border-brand-100 bg-brand-50 p-4 text-sm text-brand-700">
                  <p className="font-semibold">Letter ready!</p>
                  <p className="mt-1 text-sm text-brand-600/80">Preview or send to see bilingual options and tracked delivery.</p>
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
                <p className="mt-1 text-xs">Book a session with a Joslyn AI care guide. We’re former educators and advocates who speak parent.
                </p>
                <Link className="mt-3 inline-flex items-center text-xs font-semibold text-brand-600" href="mailto:hello@joslyn.ai">
                  Schedule a session ?
                </Link>
              </div>
            </div>
            <aside className="rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-500">
              <p className="font-heading text-sm text-slate-700">What’s next?</p>
              <ul className="mt-3 space-y-2">
                <li>• Invite your IEP team to the workspace</li>
                <li>• Translate your child story to Spanish in one click</li>
                <li>• Track reimbursements and upcoming meetings</li>
              </ul>
            </aside>
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-brand-100 bg-brand-50/60 p-6 text-sm text-brand-700">
        <p className="font-heading text-sm uppercase tracking-[0.4em] text-brand-600/70">Need help?</p>
        <p className="mt-2 max-w-2xl text-sm">Live chat with us inside the app, or email <Link className="font-semibold underline" href="mailto:hello@joslyn.ai">hello@joslyn.ai</Link>. We support English and Spanish.</p>
      </section>
    </div>
  );
}

