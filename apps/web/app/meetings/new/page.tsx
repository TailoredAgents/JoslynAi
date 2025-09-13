"use client";
import { useEffect, useRef, useState } from "react";

export default function NewMeetingPage() {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [caption, setCaption] = useState("");

  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:8080/realtime/demo-child`);
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (ev) => { /* no-op */ };
    wsRef.current = ws;
    return () => ws.close();
  }, []);

  function sendCommitment() {
    wsRef.current?.send(JSON.stringify({ type: "commitment", title: caption, due_date: new Date().toISOString() }));
    setCaption("");
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Meeting (demo)</h2>
      <div className="text-sm">WebSocket: {connected ? "connected" : "disconnected"}</div>
      <textarea className="w-full h-40 border rounded p-2" placeholder="Live captions (demo)" value={caption} onChange={(e)=>setCaption(e.target.value)} />
      <button className="bg-sky-500 text-white px-3 py-1 rounded" onClick={sendCommitment}>Create task from caption</button>
    </div>
  );
}

