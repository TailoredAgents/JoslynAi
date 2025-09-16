import "./globals.css";
import type { Metadata } from "next";
import HeaderNav from "../components/HeaderNav";
import { Providers } from "./providers";
import { Nunito, Work_Sans } from "next/font/google";

const headingFont = Nunito({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--font-heading" });
const bodyFont = Work_Sans({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Joslyn AI",
  description: "A compassionate AI co-pilot for IEP/504 planning and support",
  manifest: "/manifest.json"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bodyFont.variable} ${headingFont.variable}`}>
      <body className="bg-[var(--background)] text-[var(--foreground)] font-body antialiased min-h-screen">
        <Providers>
          <div className="relative min-h-screen overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-radiant-glow" aria-hidden="true" />
            <div className="relative flex min-h-screen flex-col">
              <HeaderNav />
              <main className="flex-1">
                <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
                  {children}
                </div>
              </main>
              <footer className="border-t border-slate-200/60 bg-white/85 backdrop-blur-sm">
                <div className="mx-auto flex w-full max-w-6xl flex-col justify-between gap-4 px-4 py-8 text-sm text-slate-600 sm:flex-row sm:items-center sm:px-6 lg:px-8">
                  <div className="space-y-1">
                    <p className="font-heading text-base text-slate-800">Joslyn AI</p>
                    <p className="text-slate-500">&copy; {new Date().getFullYear()} Crafted with care for families and educators.</p>
                  </div>
                  <div className="flex flex-wrap gap-4 text-slate-500">
                    <a className="hover:text-brand-500" href="/legal/terms">Terms</a>
                    <a className="hover:text-brand-500" href="/legal/privacy">Privacy</a>
                    <a className="hover:text-brand-500" href="/legal/sub-processors">Sub-processors</a>
                    <a className="hover:text-brand-500" href="mailto:support@joslyn.ai">Support</a>
                  </div>
                </div>
              </footer>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}

