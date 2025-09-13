"use client";
import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

export default function AboutMyChildPage() {
  const [form, setForm] = useState<any>({ strengths: [], sensory_supports: [], meltdown_plan: [], accommodations: [] });
  const [pdf, setPdf] = useState<string>("");
  const [share, setShare] = useState<string>("");
  const [qr, setQr] = useState<string>("");

  function setArray(name: string, value: string) {
    setForm((f: any) => ({ ...f, [name]: value.split(",").map((s) => s.trim()).filter(Boolean) }));
  }

  async function save() {
    const res = await fetch(`${API_BASE}/children/demo-child/profile/save`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form)
    });
    if (!res.ok) alert("Save failed");
  }

  async function renderPdf() {
    const res = await fetch(`${API_BASE}/children/demo-child/profile/render`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lang1: "en", lang2: "es" })
    });
    const data = await res.json();
    setPdf(data.pdf_uri); setShare(data.share_url); setQr(data.qr_base64);
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">About My Child</h2>
      <div className="grid grid-cols-1 gap-3">
        <label className="block">Preferred name
          <input className="border rounded px-2 py-1 w-full" onChange={(e) => setForm((f:any)=>({...f, preferred_name: e.target.value}))} />
        </label>
        <label className="block">Strengths (comma-separated)
          <input className="border rounded px-2 py-1 w-full" onChange={(e) => setArray("strengths", e.target.value)} />
        </label>
        <label className="block">Sensory supports (comma-separated)
          <input className="border rounded px-2 py-1 w-full" onChange={(e) => setArray("sensory_supports", e.target.value)} />
        </label>
        <label className="block">Meltdown plan (comma-separated)
          <input className="border rounded px-2 py-1 w-full" onChange={(e) => setArray("meltdown_plan", e.target.value)} />
        </label>
        <label className="block">Communication (free text)
          <input className="border rounded px-2 py-1 w-full" onChange={(e) => setForm((f:any)=>({...f, communication: e.target.value}))} />
        </label>
        <label className="block">Accommodations (comma-separated)
          <input className="border rounded px-2 py-1 w-full" onChange={(e) => setArray("accommodations", e.target.value)} />
        </label>
      </div>
      <div className="space-x-2">
        <button className="bg-sky-500 text-white px-3 py-1 rounded" onClick={save}>Save</button>
        <button className="bg-emerald-600 text-white px-3 py-1 rounded" onClick={renderPdf}>Render + Share</button>
      </div>
      {pdf && <div>PDF: {pdf}</div>}
      {share && <div>Share: <a className="underline" href={share} target="_blank" rel="noreferrer">{share}</a></div>}
      {qr && <img alt="QR" src={qr} className="w-40 h-40" />}
    </div>
  );
}
