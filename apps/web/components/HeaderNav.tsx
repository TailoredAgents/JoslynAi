"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function HeaderNav() {
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => {
    const envKey = process.env.NEXT_PUBLIC_ADMIN_API_KEY as string | undefined;
    const localKey = typeof window !== "undefined" ? localStorage.getItem("adminKey") : null;
    setShowAdmin(!!envKey || !!localKey);
  }, []);

  return (
    <header className="border-b">
      <nav className="max-w-5xl mx-auto flex items-center justify-between p-3">
        <Link href="/" className="font-semibold">IEP Ally</Link>
        <div className="space-x-4 text-sm">
          <Link href="/about-my-child">About My Child</Link>
          <Link href="/eligibility">Eligibility</Link>
          {showAdmin && <Link href="/admin/usage">Admin</Link>}
        </div>
      </nav>
    </header>
  );
}

