"use client";
import { useState } from "react";

const API = process.env.NEXT_PUBLIC_API_BASE_URL || "/api/joslyn";

const plans = [
  {
    key: "basic",
    name: "Basic",
    price: "$9/mo",
    description: ["Copilot chat", "Document Q&A with citations", "Brief and letter drafts"],
  },
  {
    key: "pro",
    name: "Pro",
    price: "$29/mo",
    description: ["Everything in Basic", "Smart attachments", "Send letters with tracking", "Priority support"],
  },
];

export default function BillingPage() {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout(plan: string) {
    setLoadingPlan(plan);
    setError(null);
    try {
      const res = await fetch(`${API}/billing/checkout`, {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const payload = await res.json();
      if (!res.ok || !payload?.url) {
        const reason = payload?.error || payload?.message || res.statusText;
        throw new Error(reason || "Price not configured. Set PRICE_BASIC/PRICE_PRO in Render.");
      }
      window.location.assign(payload.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't start that checkout just yet.");
    } finally {
      setLoadingPlan(null);
    }
  }

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <span className="inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-brand-600">
          Settings
        </span>
        <div className="space-y-2">
          <h1 className="text-3xl font-heading text-slate-900">Manage billing</h1>
          <p className="text-sm text-slate-600">
            Choose the plan that fits your team. Checkout opens in a new tab using secure Stripe-hosted pages.
          </p>
        </div>
      </header>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 text-xs text-slate-600">
        <p>
          <span className="font-semibold text-slate-700">Heads up:</span> make sure `PRICE_BASIC`, `PRICE_PRO`, and Stripe secrets are set in Render before launching a checkout session.
        </p>
      </div>

      {error && (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <section className="grid gap-6 sm:grid-cols-2">
        {plans.map((plan) => (
          <article key={plan.key} className="flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-500">{plan.name}</p>
              <h2 className="mt-2 text-2xl font-heading text-slate-900">{plan.price}</h2>
              <ul className="mt-4 space-y-2 text-sm text-slate-600">
                {plan.description.map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-100 text-brand-600">-</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-6 flex flex-1 items-end">
              <button
                className="inline-flex w-full items-center justify-center rounded-full bg-brand-500 px-5 py-2 text-sm font-semibold text-white shadow-uplift transition hover:bg-brand-600 disabled:opacity-40"
                onClick={() => startCheckout(plan.key)}
                disabled={loadingPlan === plan.key}
              >
                {loadingPlan === plan.key ? "Starting checkout..." : `Choose ${plan.name}`}
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
