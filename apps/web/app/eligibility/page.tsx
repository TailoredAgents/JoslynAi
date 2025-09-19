"use client";
import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "/api/joslyn";

export default function EligibilityPage() {
  const [programs, setPrograms] = useState<any[]>([]);
  const [pdf, setPdf] = useState<string>("");

  async function screener() {
    const res = await fetch(`${API_BASE}/eligibility/screener`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ child_age: 8, diagnosis_docs: true, household_size: 3, income_band: "low", state: "US-*" }) });
    const data = await res.json();
    setPrograms(data.programs || []);
  }

  async function prefill() {
    const res = await fetch(`${API_BASE}/tools/form-fill/prefill`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ form_id: "state_medicaid_child", answers: { child_name: "Demo", address: "123 Main" } }) });
    const data = await res.json();
    setPdf(data.pdf_uri);
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Eligibility</h2>
      <button className="bg-sky-500 text-white px-3 py-1 rounded" onClick={screener}>Run Screener</button>
      <ul className="list-disc ml-5">
        {programs.map((p,i)=>(<li key={i}>{p.name} â€” Checklist: {p.checklist.join(", ")}</li>))}
      </ul>
      <button className="bg-emerald-600 text-white px-3 py-1 rounded" onClick={prefill}>Start Form</button>
      {pdf && <div>PDF: {pdf}</div>}
    </div>
  );
}

