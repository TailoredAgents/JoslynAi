"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

export default function HeaderNav() {
  const [showAdmin, setShowAdmin] = useState(false);
  const [open, setOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpText, setHelpText] = useState("");
  const { data: session } = useSession();
  const userId = typeof (session as any)?.user?.id === "string" ? String((session as any).user.id) : undefined;

  useEffect(() => {
    const envKey = process.env.NEXT_PUBLIC_ADMIN_API_KEY;
    const localKey = typeof window !== "undefined" ? localStorage.getItem("adminKey") : null;
    setShowAdmin(!!envKey || !!localKey);
  }, []);

  async function submitFeedback() {
    try {
      const payload = {
        url: typeof window !== "undefined" ? window.location.href : "",
        notes: helpText
      };
      await fetch(`${API_BASE}/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(userId ? { "x-user-id": userId } : {})
        },
        body: JSON.stringify(payload)
      });
      alert("Thanks! Feedback sent.");
      setHelpText("");
      setHelpOpen(false);
    } catch {
      alert("Failed to send feedback");
    }
  }

  return (
    <header className="border-b">
      <nav className="max-w-5xl mx-auto flex items-center justify-between p-3">
        <Link href="/" className="font-semibold">
          IEP Ally
        </Link>
        <div className="relative flex items-center gap-4 text-sm">
          <Link href="/about-my-child">About My Child</Link>
          <Link href="/eligibility">Eligibility</Link>
          <Link href="/onboarding">Onboarding</Link>

          {showAdmin && (
            <div className="relative">
              <button
                onClick={() => setOpen((o) => !o)}
                className="px-2 py-1 border rounded"
                aria-haspopup="menu"
                aria-expanded={open}
              >
                Admin ?
              </button>
              {open && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-44 border rounded bg-white shadow"
                  onMouseLeave={() => setOpen(false)}
                >
                  <Link role="menuitem" className="block px-3 py-2 hover:bg-gray-50" href="/admin/deadlines">
                    Deadlines
                  </Link>
                  <Link role="menuitem" className="block px-3 py-2 hover:bg-gray-50" href="/admin/rules">
                    Rules
                  </Link>
                  <Link role="menuitem" className="block px-3 py-2 hover:bg-gray-50" href="/admin/usage">
                    Usage
                  </Link>
                </div>
              )}
            </div>
          )}

          <button className="px-2 py-1 border rounded" onClick={() => setHelpOpen(true)}>
            Help
          </button>

          {session?.user ? (
            <>
              <span className="text-gray-600">{session.user.email}</span>
              <button className="px-2 py-1 border rounded" onClick={() => signOut()}>
                Logout
              </button>
            </>
          ) : (
            <button className="px-2 py-1 border rounded" onClick={() => signIn()}>
              Login
            </button>
          )}
        </div>
      </nav>

      {helpOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center" onClick={() => setHelpOpen(false)}>
          <div className="bg-white rounded shadow p-4 w-[500px]" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-2">Report a problem</h3>
            <textarea
              className="w-full h-32 border rounded p-2"
              placeholder="What went wrong?"
              value={helpText}
              onChange={(e) => setHelpText(e.target.value)}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button className="px-3 py-1" onClick={() => setHelpOpen(false)}>
                Cancel
              </button>
              <button className="px-3 py-1 bg-sky-600 text-white rounded" onClick={submitFeedback}>
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
