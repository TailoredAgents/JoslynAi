"use client";
import { useEffect, useState } from "react";
import en from "../i18n/messages/en.json";
import es from "../i18n/messages/es.json";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

export default function HomePage() {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [citations, setCitations] = useState<any[]>([]);
  const [msgs, setMsgs] = useState<any>(en as any);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      const lang = (sp.get('lang') || 'en').toLowerCase();
      setMsgs(lang === 'es' ? (es as any) : (en as any));
    }
  }, []);

  async function ask() {
    setLoading(true);
    setAnswer(null);
    try {
      const res = await fetch(`${API_BASE}/children/demo-child/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      setAnswer(data?.answer ?? "not found");
      setCitations(data?.citations ?? []);
    } catch (e) {
      setAnswer("error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <a className="border rounded p-4 hover:bg-slate-50" href="#">{msgs["home.cta.upload"] || "Upload Paperwork"}</a>
        <a className="border rounded p-4 hover:bg-slate-50" href="#">{msgs["home.cta.deadlines"] || "Track Deadlines"}</a>
        <a className="border rounded p-4 hover:bg-slate-50" href="#">{msgs["home.cta.letters"] || "Draft Letters"}</a>
      </div>

      <div className="border rounded p-4">
        <h2 className="font-medium mb-2">{msgs["home.ask.title"] || "Ask about your documents"}</h2>
        <div className="flex gap-2">
          <input className="flex-1 border rounded px-3 py-2" placeholder={msgs["home.ask.placeholder"] || "Ask a question..."} value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="bg-sky-500 text-white rounded px-3 py-2" onClick={ask} disabled={loading}>{loading ? "Asking..." : "Ask"}</button>
        </div>
        {answer && (
          <div className="mt-3 text-sm text-slate-700 space-y-2">
            <div>Answer: {answer}</div>
            {citations.length > 0 && (
              <div>
                <div className="font-medium">Citations:</div>
                <ul className="list-disc ml-5 text-slate-600">
                  {citations.slice(0, 2).map((c, i) => (
                    <li key={i}>{c.doc_name || c.document_id} p.{c.page}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-x-3">
        <a className="underline" href="/documents/demo/brief">View Document Brief</a>
        <a className="underline" href="/letters/new">New Letter</a>
        <a className="underline" href="/claims/demo">View Claim</a>
        <a className="underline" href="/about-my-child">About My Child</a>
      </div>
    </div>
  );
}
