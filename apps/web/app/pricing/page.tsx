import Link from "next/link";

export default function PricingPage() {
  return (
    <div className="space-y-12 py-10">
      <section className="text-center space-y-2">
        <h1 className="text-4xl font-heading text-slate-900">Simple, transparent pricing</h1>
        <p className="text-slate-600">Start free. Upgrade when you need more.</p>
      </section>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
    </div>
  );
}

