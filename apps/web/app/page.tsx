"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { encodeQjson } from "../lib/qjson";
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
        <div className="text-xs text-gray-500 mb-2">Not legal or medical advice.</div>
        <div className="flex gap-2">
          <input className="flex-1 border rounded px-3 py-2" placeholder={msgs["home.ask.placeholder"] || "Ask a question..."} value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="bg-sky-500 text-white rounded px-3 py-2" onClick={ask} disabled={loading}>{loading ? "Asking..." : "Ask"}</button>
        </div>
        {answer && (
          <section className="mt-6 space-y-4">
            <h2 className="font-medium text-lg">Answer</h2>
            <p className="text-gray-800 whitespace-pre-wrap">{answer}</p>
            <div className="mt-4 space-y-3">
              <h3 className="font-medium">Citations</h3>
              {(() => {
                const byDoc = new Map<string, { doc_name: string; cites: { page: number; quote: string }[] }>();
                for (const c of citations || []) {
                  const id = c.document_id as string;
                  const entry = byDoc.get(id) ?? { doc_name: c.doc_name || "Document", cites: [] as { page: number; quote: string }[] };
                  if (!entry.cites.some(x => x.page === Number(c.page) && x.quote === (c.quote || ""))) {
                    entry.cites.push({ page: Number(c.page), quote: c.quote || "" });
                  }
                  byDoc.set(id, entry);
                }
                if (byDoc.size === 0) return <div className="text-sm text-gray-500">No citations found.</div>;
                return [...byDoc.entries()].map(([docId, { doc_name, cites }]) => {
                  const qjson = encodeQjson(cites, 12);
                  return (
                    <div key={docId} className="border rounded p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">{doc_name}</div>
                        <Link className="text-sm text-blue-600 underline" href={`/documents/${docId}/view?qjson=${encodeURIComponent(qjson)}`} target="_blank">Open all highlights ({cites.length})</Link>
                      </div>
                      <ul className="list-disc ml-5 space-y-1">
                        {cites.slice(0, 12).map((c, i) => (
                          <li key={`${c.page}-${i}`}>
                            <span className="text-gray-700">p.{c.page} — </span>
                            <span className="text-gray-600">{c.quote.slice(0, 140)}{c.quote.length > 140 ? "…" : ""}</span>{" "}
                            <Link className="text-blue-600 underline" href={`/documents/${docId}/view?page=${c.page}&q=${encodeURIComponent(c.quote)}`} target="_blank">Open</Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                });
              })()}
            </div>
          </section>
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
