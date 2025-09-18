"use client";
import { useEffect, useRef, useState } from "react";
import { useBootstrappedChild } from "../../../lib/use-child";
import { useSession } from "next-auth/react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "/api/joslyn";

export default function NewMeetingPage() {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [caption, setCaption] = useState("");
  const [consented, setConsented] = useState(false);
  const { data: session } = useSession();
  const userId = typeof (session as any)?.user?.id === "string" ? String((session as any).user.id) : undefined;
  const { child, loading: childLoading } = useBootstrappedChild();
  const childId = (child as any)?.id || null;
  const wsBase = (API_BASE || "/api/joslyn").startsWith("https")
    ? (API_BASE || "/api/joslyn").replace(/^https/, "wss")
    : (API_BASE || "/api/joslyn").replace(/^http/, "ws");

  async function connect() {
    if (!consented || !childId) return;
    const ws = new WebSocket(`${wsBase}/realtime/${childId}`);
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = () => {};
    wsRef.current = ws;
  }

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  async function handleConsentToggle(e: any) {
    const c = Boolean(e.target.checked);
    setConsented(c);
    if (c) {
      await fetch(`${API_BASE}/events/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(userId ? { "x-user-id": userId } : {}) },
        body: JSON.stringify({ child_id: childId, consent: true })
      });
      await connect();
    } else {
      wsRef.current?.close();
    }
  }

  function sendCommitment() {
    wsRef.current?.send(JSON.stringify({ type: "commitment", title: caption, due_date: new Date().toISOString() }));
    setCaption("");
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Meeting (demo)</h2>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={consented} onChange={handleConsentToggle} disabled={!childId || childLoading} />
        <span>I consent to capturing notes</span>
      </label>
      <div className="text-sm">WebSocket: {connected ? "connected" : "disconnected"}</div>
      <textarea
        className="w-full h-40 border rounded p-2"
        placeholder="Live captions (demo)"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        disabled={!consented}
      />
      <button
        className="bg-sky-500 text-white px-3 py-1 rounded disabled:opacity-50"
        onClick={sendCommitment}
        disabled={!consented || !childId}
      >
        Create task from caption
      </button>
    </div>
  );
}
