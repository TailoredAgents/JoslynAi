
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useBootstrappedChild } from "../../lib/use-child";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

const SUGGESTIONS = [
  "List services & minutes",
  "Show speech therapy goals",
  "Draft recap email"
];

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export default function CopilotPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [question, setQuestion] = useState("What services are in this IEP?");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [thinking, setThinking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [jobs, setJobs] = useState<any[]>([]);

  const { child, loading: childLoading, error: childError, refresh: refreshChild } = useBootstrappedChild();
  const childId = child?.id ?? null;\r\n  const childReady = Boolean(childId);

  useEffect(() => {
    if (!childId) return;
    pollJobs(childId);
  }, [childId]);

  async function pollJobs(targetId?: string) {
    const id = targetId ?? childId;
    if (!id) return;
    try {
      const res = await fetch(`${API_BASE}/jobs?child_id=${id}`);
      const data = await res.json();
      setJobs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleUpload(evt: React.FormEvent<HTMLFormElement>) {
    evt.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file || !childId) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await fetch(`${API_BASE}/children/${childId}/documents`, { method: "POST", body: formData as any });
      await pollJobs(childId);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  }

  async function askCopilot(prompt?: string) {
    const query = (prompt ?? question).trim();
    if (!query || !childId) return;
    setMessages((prev) => [...prev, { role: "user", content: query }]);
    if (!prompt) {
      setQuestion("");
    }
    setThinking(true);
    try {
      const res = await fetch(`${API_BASE}/children/${childId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query })
      });
      const data = await res.json();
      const answer = data?.answer ?? "I wasn't able to find that just yet.";
      setMessages((prev) => [...prev, { role: "assistant", content: answer }]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "I hit a snag reaching Joslyn AI. Try again in a moment."
        }
      ]);
    } finally {
      setThinking(false);
    }
  }

  const jobSummary = useMemo(
    () =>
      jobs.map((job: any) => ({
        id: job.id,
        type: job.type?.replace(/_/g, " ") ?? "job",
        status: job.status ?? "pending"
      })),
    [jobs]
  );

  if (childLoading && !childReady) {
    return <div className="mx-auto w-full max-w-6xl py-10 text-sm text-slate-500">Loading child workspace...</div>;
  }

  if (!childLoading && !childReady) {
    return (
      <div className="mx-auto w-full max-w-6xl py-10 text-sm text-slate-500">
        <p className="mb-3 font-semibold text-rose-500">
          Unable to load your child workspace.
        </p>
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
    <div className="mx-auto w-full max-w-6xl space-y-10 py-10">
      <header className="space-y-4">
        <span className="inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-brand-600">
          Joslyn AI copilot
        </span>
        <h1 className="text-4xl font-heading text-slate-900 sm:text-5xl">Ask questions. Drop files. Stay ready.</h1>
        <p className="max-w-3xl text-sm text-slate-600">
          Upload IEPs, evaluations, or meeting notes and talk with Joslyn AI about services, goals, and next steps. Answers always include citations so you can trust what you hear.
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-1 flex-col space-y-4 overflow-hidden">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-heading text-slate-900">Conversation</h2>
              <button
                type="button"
                className="text-xs font-semibold text-slate-500 transition hover:text-brand-600"
                onClick={() => pollJobs(childId)}
              >
                Refresh jobs
              </button>
            </div>
            <div className="h-80 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              {messages.length === 0 ? (
                <div className="flex h-full items-center justify-center text-xs text-slate-500">
                  Ask Joslyn AI about service minutes, accommodations, or next best steps.
                </div>
              ) : (
                <ul className="space-y-3">
                  {messages.map((msg, idx) => (
                    <li
                      key={idx}
                      className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${msg.role === "user" ? "ml-auto bg-brand-500 text-white" : "bg-white text-slate-700"}`}
                    >
                      {msg.content}
                    </li>
                  ))}
                  {thinking && (
                    <li className="max-w-[60%] rounded-2xl bg-white px-4 py-3 text-xs text-slate-500 shadow-sm">
                                            Joslyn AI is thinking�
                    </li>
                  )}
                </ul>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap gap-2.5">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-brand-600 shadow-sm transition hover:border-brand-400 hover:text-brand-700 focus:outline-none focus:ring focus:ring-brand-200/70"
                  onClick={() => askCopilot(suggestion)}
                  disabled={thinking || !childReady}
                >
                  <span className="h-2 w-2 rounded-full bg-brand-400" aria-hidden />
                  {suggestion}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <input
                className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 focus:border-brand-400 focus:outline-none focus:ring focus:ring-brand-200/60"
                placeholder="Ask a question about your child's plan…"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
              <button
                type="button"
                className="inline-flex items-center rounded-full bg-brand-500 px-5 py-2 text-sm font-semibold text-white shadow-uplift transition hover:bg-brand-600 disabled:opacity-40"
                onClick={() => askCopilot()}
                disabled={thinking || !question.trim() || !childReady}
              >
                Send
              </button>
            </div>
          </div>
        </div>

        <aside className="space-y-5">
          <form onSubmit={handleUpload} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-heading text-slate-900">Upload supporting documents</p>
            <p className="mt-2 text-xs text-slate-500">PDFs work best. We’ll scan for services, goals, and accommodations.</p>
            <input ref={fileInputRef} type="file" accept="application/pdf" className="mt-4 block w-full text-xs" />
            <button
              type="submit"
              className="mt-4 inline-flex items-center rounded-full bg-brand-500 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-600 disabled:opacity-40"
              disabled={uploading || !childReady}
            >
              {uploading ? "Uploading…" : "Upload to Joslyn AI"}
            </button>
            <p className="mt-3 text-xs text-slate-500">Files live in your encrypted Joslyn AI workspace. We never share them.</p>
          </form>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 text-xs text-slate-500">
            <p className="font-heading text-sm text-slate-700">Processing status</p>
            {jobSummary.length === 0 ? (
              <p className="mt-3 text-xs text-slate-400">No active jobs. Upload a document to get started.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {jobSummary.map((job) => (
                  <li key={job.id} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <span className="capitalize text-slate-600">{job.type}</span>
                    <span className={`text-xs font-semibold ${job.status === "done" ? "text-emerald-600" : "text-slate-500"}`}>{job.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 text-xs text-slate-500">
            <p className="font-heading text-sm text-slate-700">Sample prompts</p>
            <ul className="mt-3 space-y-2 leading-relaxed">
              <li>- What is an IEP and why does it matter?</li>
              <li>- How can I prepare for my child's next IEP meeting?</li>
              <li>- What supports help during sensory overload?</li>
            </ul>
          </div>
        </aside>
      </section>
    </div>
  );
}

























