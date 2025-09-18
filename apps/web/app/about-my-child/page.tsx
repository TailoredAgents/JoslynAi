"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useBootstrappedChild } from "../../lib/use-child";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "/api/joslyn";

const defaultProfile = {
  preferred_name: "Sam",
  pronouns: "they/she",
  strengths: [],
  sensory_supports: [],
  meltdown_plan: [],
  communication: "",
  accommodations: [],
  favorite_people: "",
  celebration: ""
};

export default function AboutMyChildPage() {
  const [form, setForm] = useState<any>(defaultProfile);
  const [pdf, setPdf] = useState<string>("");
  const [share, setShare] = useState<string>("");
  const [qr, setQr] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [rendering, setRendering] = useState(false);
  const { child, loading: childLoading, error: childError } = useBootstrappedChild();
  const childId = child?.id ?? null;
  const childReady = Boolean(childId);

  function updateField(name: string, value: string) {
    setForm((f: any) => ({ ...f, [name]: value }));
  }

  function updateList(name: string, value: string) {
    setForm((f: any) => ({
      ...f,
      [name]: value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    }));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/children/${childId}/profile/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      if (!res.ok) throw new Error("Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function renderPdf() {
    setRendering(true);
    try {
      const res = await fetch(`${API_BASE}/children/${childId}/profile/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang1: "en", lang2: "es" })
      });
      const data = await res.json();
      setPdf(data.pdf_uri);
      setShare(data.share_url);
      setQr(data.qr_base64);
    } finally {
      setRendering(false);
    }
  }

  if (childLoading && !childReady) {
    return <div className="mx-auto w-full max-w-5xl py-10 text-sm text-slate-500">Loading child workspace...</div>;
  }

  if (!childLoading && !childReady) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-3 py-10 text-sm text-slate-500">
        <p className="font-semibold text-rose-500">Unable to load your child workspace.</p>
        {childError ? <p className="text-xs text-rose-400">{childError}</p> : null}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-10 py-10">
      <header className="max-w-3xl space-y-4">
        <span className="inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-brand-600">Child story</span>
        <h1 className="text-3xl font-heading text-slate-900 sm:text-4xl">Share who your child is beyond the paperwork.</h1>
        <p className="text-sm text-slate-600">Capture strengths, sensory preferences, and celebrations. Generate a bilingual handout to share with new teachers, therapists, and babysitters.</p>
      </header>

      <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-heading text-slate-900">Warm introduction</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="space-y-1 text-sm text-slate-600">
                Preferred name
                <input className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700 shadow-inner focus:border-brand-400 focus:outline-none focus:ring focus:ring-brand-200/60" value={form.preferred_name || ""} onChange={(e) => updateField("preferred_name", e.target.value)} />
              </label>
              <label className="space-y-1 text-sm text-slate-600">
                Pronouns
                <input className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700 shadow-inner focus:border-brand-400 focus:outline-none focus:ring focus:ring-brand-200/60" value={form.pronouns || ""} onChange={(e) => updateField("pronouns", e.target.value)} />
              </label>
            </div>
            <label className="mt-4 block space-y-1 text-sm text-slate-600">
              Celebration moment (what makes them beam?)
              <textarea className="h-24 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 shadow-inner focus:border-brand-400 focus:outline-none focus:ring focus:ring-brand-200/60" value={form.celebration || ""} onChange={(e) => updateField("celebration", e.target.value)} />
            </label>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-heading text-slate-900">Strengths & supports</h2>
            <p className="mt-1 text-xs text-slate-500">Separate each item with a comma-we&apos;ll format it beautifully for you.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="space-y-1 text-sm text-slate-600">
                Strengths (e.g., &quot;pattern finder, empathetic friend&quot;)
                <input className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700" onChange={(e) => updateList("strengths", e.target.value)} />
              </label>
              <label className="space-y-1 text-sm text-slate-600">
                Sensory supports (e.g., &quot;noise-canceling headphones&quot;)
                <input className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700" onChange={(e) => updateList("sensory_supports", e.target.value)} />
              </label>
              <label className="space-y-1 text-sm text-slate-600">
                Meltdown plan
                <input className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700" onChange={(e) => updateList("meltdown_plan", e.target.value)} />
              </label>
              <label className="space-y-1 text-sm text-slate-600">
                Favorite accommodations
                <input className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700" onChange={(e) => updateList("accommodations", e.target.value)} />
              </label>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-heading text-slate-900">Communication & relationships</h2>
            <label className="mt-3 block space-y-1 text-sm text-slate-600">
              Communication notes
              <textarea className="h-32 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700" value={form.communication || ""} onChange={(e) => updateField("communication", e.target.value)} />
            </label>
            <label className="mt-3 block space-y-1 text-sm text-slate-600">
              Favorite people & helpers
              <textarea className="h-24 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700" value={form.favorite_people || ""} onChange={(e) => updateField("favorite_people", e.target.value)} />
            </label>
          </div>

          <div className="flex flex-wrap gap-3">
            <button className="inline-flex items-center rounded-full bg-brand-500 px-6 py-3 text-sm font-semibold text-white shadow-uplift transition hover:bg-brand-600 disabled:opacity-40" onClick={save} disabled={saving || !childReady}>
              {saving ? "Saving..." : "Save story"}
            </button>
            <button className="inline-flex items-center rounded-full border border-brand-200 px-6 py-3 text-sm font-semibold text-brand-600 transition hover:border-brand-400 disabled:opacity-40" onClick={renderPdf} disabled={rendering || !childReady}>
              {rendering ? "Preparing..." : "Render bilingual handout"}
            </button>
            <Link className="inline-flex items-center rounded-full border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300" href="/letters/new">
              Draft a welcome letter
            </Link>
          </div>
        </div>

        <aside className="space-y-6">
          <div className="rounded-3xl border border-brand-100 bg-brand-50/70 p-6 text-sm text-brand-700">
            <p className="font-heading text-sm uppercase tracking-[0.3em] text-brand-600/70">Sharing tip</p>
            <p className="mt-2 text-sm">Include a photo of your child doing something they love. It helps new team members connect faster.</p>
          </div>
          <div className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 text-xs text-slate-500">
            <p className="font-heading text-sm text-slate-700">Ready to share</p>
            {pdf ? (
              <>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                  <p className="font-semibold text-slate-800">PDF</p>
                  <Link className="text-brand-600 hover:text-brand-700" href={pdf} target="_blank" rel="noreferrer">Download handout ?</Link>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                  <p className="font-semibold text-slate-800">Share link</p>
                  <Link className="text-brand-600 hover:text-brand-700" href={share} target="_blank" rel="noreferrer">{share}</Link>
                </div>
                {qr && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center">
                    <p className="text-xs text-slate-500">Scan to open</p>
                    <Image alt="QR code" src={qr} width={128} height={128} className="mx-auto mt-2 h-32 w-32" />
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-400">
                Render your handout to see links and a shareable QR code here.
              </div>
            )}
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-6 text-xs text-slate-500">
            <p className="font-heading text-sm text-slate-700">Looking for inspiration?</p>
            <p className="mt-3">• Highlight routines that bring joy
              <br />• Mention what helps transitions
              <br />• Celebrate the advocates on your team</p>
          </div>
        </aside>
      </section>
    </div>
  );
}

















