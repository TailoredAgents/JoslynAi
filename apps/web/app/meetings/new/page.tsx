"use client";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

export default function NewMeetingPage() {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [caption, setCaption] = useState("");
  const [consented, setConsented] = useState(false);
  const { data: session } = useSession();
  const userId = typeof (session as any)?.user?.id === "string" ? String((session as any).user.id) : undefined;

  async function connect() {
    if (!consented) return;
    const ws = new WebSocket(`ws://localhost:8080/realtime/demo-child`);
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
        body: JSON.stringify({ child_id: "demo-child", consent: true })
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
        <input type="checkbox" checked={consented} onChange={handleConsentToggle} />
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
        disabled={!consented}
      >
        Create task from caption
      </button>
    </div>
  );
}
