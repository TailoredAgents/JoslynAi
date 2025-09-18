"use client";
import { useState } from "react";
import { useBootstrappedChild } from "../../../lib/use-child";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

export default function NewLetter() {
  const [kind, setKind] = useState("evaluation-request");
  const [text, setText] = useState<string>("");
  const [letterId, setLetterId] = useState<string>("");
  const [pdfUri, setPdfUri] = useState<string>("");
  const { child, loading: childLoading } = useBootstrappedChild();
  const childId = (child as any)?.id || null;

  async function draft() {
    if (!childId) return;
    const res = await fetch(`${API_BASE}/tools/letter/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        merge_fields: {
          child_id: childId,
          parent_name: "Parent Name",
          child_name: "Demo Child",
          school_name: "Demo School",
          requested_areas: "Speech, OT",
          todays_date: new Date().toLocaleDateString(),
          reply_by: new Date(Date.now() + 7*86400000).toLocaleDateString()
        }
      })
    });
    const data = await res.json();
    setLetterId(data.letter_id);
    setText(data.text);
  }

  async function renderPdf() {
    if (!letterId) return;
    const res = await fetch(`${API_BASE}/tools/letter/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ letter_id: letterId })
    });
    const data = await res.json();
    setPdfUri(data.pdf_uri);
  }

  async function sendEmail() {
    await fetch(`${API_BASE}/tools/letter/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ letter_id: letterId, to: "demo@example.com", subject: "IEP Letter" })
    });
    alert("Email sent (check Mailhog at http://localhost:8025)");
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">New Letter</h2>
      <div className="text-xs text-gray-500">Not legal or medical advice.</div>
      <select className="border rounded px-2 py-1" value={kind} onChange={(e) => setKind(e.target.value)}>
        <option value="evaluation-request">Evaluation Request</option>
        <option value="records-request">Records Request</option>
        <option value="amendment">Amendment</option>
        <option value="meeting-recap">Meeting Recap</option>
        <option value="thank-you">Thank You</option>
      </select>
      <div className="space-x-2">
        <button className="bg-sky-500 text-white px-3 py-1 rounded disabled:opacity-50" onClick={draft} disabled={!childId || childLoading}>Draft</button>
        {letterId && <button className="bg-slate-700 text-white px-3 py-1 rounded disabled:opacity-50" onClick={renderPdf} disabled={!letterId}>Render PDF</button>}
        {pdfUri && <button className="bg-emerald-600 text-white px-3 py-1 rounded" onClick={sendEmail}>Send Email</button>}
      </div>
      {text && (
        <textarea className="w-full h-60 border rounded p-2" value={text} onChange={(e) => setText(e.target.value)} />
      )}
      {pdfUri && (
        <div>PDF stored at: {pdfUri}</div>
      )}
    </div>
  );
}
