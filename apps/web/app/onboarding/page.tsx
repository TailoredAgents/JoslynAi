"use client";
import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [childId, setChildId] = useState<string>("");
  const [docId, setDocId] = useState<string>("");
  const [answer, setAnswer] = useState<string>("");
  const [letterId, setLetterId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<any[]>([]);

  async function createChild() {
    setLoading(true);
    const res = await fetch(`${API}/children`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Demo Child" }) });
    const data = await res.json();
    setChildId(data.child_id);
    setStep(2);
    setLoading(false);
  }

  async function useSample() {
    if (!childId) return;
    setLoading(true);
    const file = new File([new Blob([""], { type: "application/pdf" })], "sample-iep.pdf");
    const form = new FormData();
    // Try to fetch from dev_samples
    try {
      const sample = await fetch("/dev_samples/sample-iep.pdf");
      const blob = await sample.blob();
      form.append("file", blob, "sample-iep.pdf");
    } catch {
      form.append("file", file);
    }
    const up = await fetch(`${API}/children/${childId}/documents`, { method: "POST", body: form as any });
    const data = await up.json();
    setDocId(data.document_id);
    setLoading(false);
    // start polling jobs
    pollJobs();
  }

  async function pollJobs() {
    if (!childId) return;
    const res = await fetch(`${API}/jobs?child_id=${childId}`);
    const data = await res.json();
    setJobs(data);
    const done = data.every((j: any) => j.status === "done");
    if (!done) setTimeout(pollJobs, 2000);
  }

  async function runBriefAsk() {
    if (!docId || !childId) return;
    setLoading(true);
    await fetch(`${API}/documents/${docId}/brief?child_id=${childId}&lang=en`);
    const ask = await fetch(`${API}/children/${childId}/ask`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: "What services and minutes are listed?" }) });
    const a = await ask.json();
    setAnswer(a.answer || "");
    setStep(4);
    setLoading(false);
  }

  async function draftLetter() {
    const res = await fetch(`${API}/tools/letter/draft`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "evaluation-request", merge_fields: { child_id: childId, parent_name: "Parent", child_name: "Demo Child", school_name: "Demo School", requested_areas: "Speech", todays_date: new Date().toISOString().slice(0,10), reply_by: new Date(Date.now()+7*86400000).toISOString().slice(0,10) } }) });
    const d = await res.json();
    setLetterId(d.letter_id);
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-xl font-semibold">Onboarding</h1>

      {step === 1 && (
        <div className="space-y-2">
          <div className="text-sm">Step 1 • Child basics</div>
          <button className="bg-sky-500 text-white px-3 py-1 rounded" onClick={createChild} disabled={loading}>Create Child</button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-2">
          <div className="text-sm">Step 2 • Upload or use sample</div>
          <button className="bg-slate-700 text-white px-3 py-1 rounded" onClick={useSample} disabled={loading || !childId}>Use sample IEP</button>
          <div className="text-sm text-gray-600">Jobs:</div>
          <ul className="text-sm list-disc ml-5">
            {jobs.map((j)=> (<li key={j.id}>{j.type}: {j.status}</li>))}
          </ul>
          <button className="bg-sky-500 text-white px-3 py-1 rounded" onClick={()=>setStep(3)} disabled={!docId}>Continue</button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-2">
          <div className="text-sm">Step 3 • Brief & Ask</div>
          <button className="bg-sky-500 text-white px-3 py-1 rounded" onClick={runBriefAsk} disabled={loading || !docId}>Run</button>
          {answer && <div className="text-sm text-gray-700">Answer: {answer}</div>}
        </div>
      )}

      {step === 4 && (
        <div className="space-y-2">
          <div className="text-sm">Step 4 • Draft Evaluation Request</div>
          <button className="bg-sky-500 text-white px-3 py-1 rounded" onClick={draftLetter} disabled={loading || !childId}>Draft Letter</button>
          {letterId && <div className="text-sm">Drafted letter: {letterId} <a className="underline" href="#">Render</a></div>}
        </div>
      )}
    </div>
  );
}

