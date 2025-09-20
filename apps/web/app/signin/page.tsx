"use client";
import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";

export default function SignInPage() {
  const [next, setNext] = useState<string>("/copilot");
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const cb = params.get("callbackUrl");
      if (cb && cb.startsWith("/")) setNext(cb);
    } catch {}
  }, []);

  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onEmailSignIn(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return setErr("Please enter your email.");
    setSubmitting(true);
    setErr(null);
    try {
      const res = await signIn("credentials", { email: trimmed, callbackUrl: next, redirect: true });
      // With redirect:true, NextAuth will navigate. If not, show a fallback.
      if (res?.error) setErr("Sign in failed. Try a different email or Google.");
    } catch (e) {
      setErr("We couldn’t sign you in just yet. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function onGoogle() {
    setSubmitting(true);
    signIn("google", { callbackUrl: next, redirect: true }).finally(() => setSubmitting(false));
  }

  return (
    <div className="min-h-[70vh] grid place-items-center">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-500 text-white shadow-uplift">
            <span className="text-lg font-heading">IA</span>
          </span>
          <div className="flex flex-col">
            <span className="font-heading text-lg text-slate-900">Joslyn AI</span>
            <span className="text-xs text-slate-500">Sign in to your workspace</span>
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={onGoogle}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            disabled={submitting}
          >
            Continue with Google
          </button>

          <div className="relative my-3 text-center text-xs uppercase tracking-wide text-slate-400">
            <span className="bg-white px-2">or</span>
            <div className="absolute inset-x-0 top-1/2 -z-10 h-px -translate-y-1/2 bg-slate-200" />
          </div>

          <form onSubmit={onEmailSignIn} className="space-y-3">
            <label className="block text-xs font-semibold text-slate-600">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm shadow-inner focus:border-brand-400 focus:outline-none focus:ring focus:ring-brand-200/60"
            />
            {err && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">{err}</div>}
            <button
              type="submit"
              className="w-full rounded-2xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-uplift transition hover:bg-brand-600 disabled:opacity-60"
              disabled={submitting}
            >
              {submitting ? "Signing in..." : "Continue with email"}
            </button>
          </form>

          <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
            <Link href="/onboarding" className="font-semibold text-brand-600 hover:text-brand-700">Create a free workspace</Link>
            <Link href="/" className="hover:text-slate-700">Back to home</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
