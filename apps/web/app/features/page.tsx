import Link from "next/link";

export default function FeaturesPage() {
  return (
    <div className="space-y-10 py-10">
      <section className="text-center space-y-2">
        <h1 className="text-4xl font-heading text-slate-900">What Joslyn AI can do</h1>
        <p className="text-slate-600">Clarity, compassion, and momentum in one workspace.</p>
      </section>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-heading text-slate-900">Ask with citations</h2>
          <p className="mt-2 text-sm text-slate-600">Turn documents into answers you can trust—every response links to a source.</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-heading text-slate-900">Deadlines on autopilot</h2>
          <p className="mt-2 text-sm text-slate-600">We surface time‑sensitive actions tailored to your jurisdiction.</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-heading text-slate-900">Letters that sound human</h2>
          <p className="mt-2 text-sm text-slate-600">Draft requests and follow‑ups in minutes; translate and send when ready.</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-heading text-slate-900">Smart attachments</h2>
          <p className="mt-2 text-sm text-slate-600">Upload PDFs; we map insights automatically for your copilots.</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-heading text-slate-900">Team‑friendly</h2>
          <p className="mt-2 text-sm text-slate-600">Invite advocates and teachers; share bilingual summaries securely.</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-heading text-slate-900">Privacy‑first</h2>
          <p className="mt-2 text-sm text-slate-600">Your data stays yours. Role‑aware access and audit trails.</p>
        </div>
      </div>

      <div className="flex gap-3">
        <Link href="/onboarding" className="inline-flex items-center rounded-full bg-brand-500 px-6 py-3 text-sm font-semibold text-white shadow-uplift transition hover:bg-brand-600">Create a free workspace</Link>
        <Link href="/api/auth/signin" className="inline-flex items-center rounded-full border border-brand-200 px-6 py-3 text-sm font-semibold text-brand-600 transition hover:border-brand-400 hover:text-brand-700">Log in</Link>
      </div>
    </div>
  );
}

