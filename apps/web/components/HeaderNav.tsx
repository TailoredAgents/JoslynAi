"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "/api/joslyn";

const marketingNav = [
  { href: "/#features", label: "Features" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
];
const appNav = [
  { href: "/copilot", label: "Copilot" },
  { href: "/documents", label: "Documents" },
  { href: "/letters", label: "Letters" },
  { href: "/claims", label: "Claims" },
  { href: "/goals", label: "Goals" },
  { href: "/iep", label: "IEP" },
  { href: "/about-my-child", label: "Profile" },
  { href: "/eligibility", label: "Eligibility" },
  { href: "/meetings", label: "Meetings" },
  { href: "/recommendations", label: "Recommendations" },
  { href: "/research", label: "Research" },
  { href: "/one-pagers", label: "One-pagers" },
];

export default function HeaderNav() {
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpText, setHelpText] = useState("");
  const { data: session } = useSession();
  const userId = typeof (session as any)?.user?.id === "string" ? String((session as any).user.id) : undefined;
  const pathname = usePathname();

  useEffect(() => {
    const envKey = process.env.NEXT_PUBLIC_ADMIN_API_KEY;
    const localKey = typeof window !== "undefined" ? localStorage.getItem("adminKey") : null;
    setShowAdmin(!!envKey || !!localKey);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setAdminOpen(false);
  }, [pathname]);

  const loggedIn = !!session?.user;
  const navItems = useMemo(() => {
    if (!loggedIn) return marketingNav;
    return showAdmin ? [...appNav, { href: "/admin/deadlines", label: "Admin" }] : appNav;
  }, [loggedIn, showAdmin]);

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
      setHelpText("");
      setHelpOpen(false);
      window?.alert?.("Thank you! We just received your note.");
    } catch {
      window?.alert?.("We couldn't send that just yet. Please try again.");
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-500 text-white shadow-uplift">
            <span className="text-lg font-heading">IA</span>
          </span>
          <div className="flex flex-col">
            <span className="font-heading text-lg text-slate-900">Joslyn AI</span>
            <span className="text-xs text-slate-500">Your compassionate IEP co-pilot</span>
          </div>
        </Link>

        <div className="hidden items-center gap-6 text-sm sm:flex">
          {navItems.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`font-medium transition-colors ${pathname?.startsWith(href) ? "text-brand-600" : "text-slate-600 hover:text-slate-900"}`}
            >
              {label}
            </Link>
          ))}
          {showAdmin && (
            <div className="relative">
              <button
                onClick={() => setAdminOpen((o) => !o)}
                className={`flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium shadow-sm transition hover:border-brand-500 hover:text-brand-600 ${adminOpen ? "border-brand-500 text-brand-600" : "text-slate-600"}`}
                aria-haspopup="menu"
                aria-expanded={adminOpen}
              >
                Admin Tools
                <span aria-hidden>?</span>
              </button>
              {adminOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-48 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-lg"
                  onMouseLeave={() => setAdminOpen(false)}
                >
                  <Link role="menuitem" className="block px-4 py-2 text-sm text-slate-600 transition hover:bg-brand-50 hover:text-brand-600" href="/admin/deadlines">
                    Deadlines
                  </Link>
                  <Link role="menuitem" className="block px-4 py-2 text-sm text-slate-600 transition hover:bg-brand-50 hover:text-brand-600" href="/admin/rules">
                    Timeline rules
                  </Link>
                  <Link role="menuitem" className="block px-4 py-2 text-sm text-slate-600 transition hover:bg-brand-50 hover:text-brand-600" href="/admin/usage">
                    Usage & insights
                  </Link>
                </div>
              )}
            </div>
          )}

          <button className="inline-flex items-center rounded-full border border-transparent bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-uplift transition hover:bg-brand-600" onClick={() => setHelpOpen(true)}>
            Talk to us
          </button>
          {session?.user ? (
            <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm">
              <span>{session.user.email}</span>
              <button className="rounded-full border border-slate-200 px-2 py-1 text-xs text-slate-500 transition hover:border-brand-500 hover:text-brand-600" onClick={() => signOut()}>
                Logout
              </button>
            </div>
          ) : (
            <button className="inline-flex items-center rounded-full border border-brand-200 px-4 py-2 text-sm font-semibold text-brand-600 transition hover:border-brand-400 hover:text-brand-700" onClick={() => signIn()}>
              Log in
            </button>
          )}
        </div>

        <button
          className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 text-slate-600 transition hover:border-brand-500 hover:text-brand-600 sm:hidden"
          onClick={() => setMobileOpen((o) => !o)}
          aria-label="Toggle navigation"
        >
          <span className="flex flex-col gap-1.5">
            <span className="h-0.5 w-6 rounded bg-current" />
            <span className="h-0.5 w-4 rounded bg-current" />
            <span className="h-0.5 w-5 rounded bg-current" />
          </span>
        </button>
      </div>

      {mobileOpen && (
        <div className="sm:hidden">
          <div className="space-y-1 border-b border-slate-200 bg-white px-4 pb-4 pt-2">
            {navItems.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`block rounded-xl px-3 py-2 text-sm font-medium transition ${pathname?.startsWith(href) ? "bg-brand-50 text-brand-600" : "text-slate-600 hover:bg-slate-100"}`}
              >
                {label}
              </Link>
            ))}
            <button className="w-full rounded-xl border border-brand-200 px-3 py-2 text-left text-sm font-semibold text-brand-600 transition hover:border-brand-400" onClick={() => setHelpOpen(true)}>
              Talk to the team
            </button>
            {session?.user ? (
              <button className="w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-sm text-slate-500 transition hover:border-brand-400 hover:text-brand-600" onClick={() => signOut()}>
                Logout {session.user.email}
              </button>
            ) : (
              <button className="w-full rounded-xl bg-brand-500 px-3 py-2 text-left text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600" onClick={() => signIn()}>
                Log in
              </button>
            )}
          </div>
        </div>
      )}

      {helpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4" onClick={() => setHelpOpen(false)}>
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-heading uppercase tracking-wide text-brand-500">We?re here for you</p>
                <h3 className="mt-1 text-xl font-heading text-slate-900">Anything we can help with?</h3>
                <p className="mt-2 text-sm text-slate-500">Tell us what you expected or what felt confusing. A real human will read it.</p>
              </div>
              <button className="rounded-full border border-slate-200 p-1 text-slate-400 transition hover:text-slate-600" onClick={() => setHelpOpen(false)} aria-label="Close dialog">
                ?
              </button>
            </div>
            <textarea
              className="mt-5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 shadow-inner focus:border-brand-400 focus:outline-none focus:ring focus:ring-brand-200/60"
              placeholder="Describe the moment or feature you?d like help with."
              value={helpText}
              onChange={(e) => setHelpText(e.target.value)}
              rows={5}
            />
            <div className="mt-4 flex justify-end gap-2 text-sm">
              <button className="rounded-full border border-slate-200 px-4 py-2 text-slate-500 transition hover:border-slate-300" onClick={() => setHelpOpen(false)}>
                Cancel
              </button>
              <button className="inline-flex items-center rounded-full bg-brand-500 px-5 py-2 font-semibold text-white shadow-uplift transition hover:bg-brand-600" onClick={submitFeedback}>
                Send feedback
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}


