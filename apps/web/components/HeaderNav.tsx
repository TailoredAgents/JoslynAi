"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function HeaderNav() {
  const [showAdmin, setShowAdmin] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const envKey = process.env.NEXT_PUBLIC_ADMIN_API_KEY;
    const localKey = typeof window !== "undefined" ? localStorage.getItem("adminKey") : null;
    setShowAdmin(!!envKey || !!localKey);
  }, []);

  return (
    <header className="border-b">
      <nav className="max-w-5xl mx-auto flex items-center justify-between p-3">
        <Link href="/" className="font-semibold">IEP Ally</Link>
        <div className="relative flex items-center gap-4 text-sm">
          <Link href="/about-my-child">About My Child</Link>
          <Link href="/eligibility">Eligibility</Link>

          {showAdmin && (
            <div className="relative">
              <button
                onClick={() => setOpen(o => !o)}
                className="px-2 py-1 border rounded"
                aria-haspopup="menu"
                aria-expanded={open}
              >
                Admin ▾
              </button>
              {open && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-44 border rounded bg-white shadow"
                  onMouseLeave={() => setOpen(false)}
                >
                  <Link role="menuitem" className="block px-3 py-2 hover:bg-gray-50" href="/admin/deadlines">Deadlines</Link>
                  <Link role="menuitem" className="block px-3 py-2 hover:bg-gray-50" href="/admin/rules">Rules</Link>
                  <Link role="menuitem" className="block px-3 py-2 hover:bg-gray-50" href="/admin/usage">Usage</Link>
                </div>
              )}
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}
