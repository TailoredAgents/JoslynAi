import "./globals.css";
import type { Metadata } from "next";
import HeaderNav from "../components/HeaderNav";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "IEP Ally",
  description: "AI assistant for IEP/504 and benefits",
  manifest: "/manifest.json"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <HeaderNav />
          <main className="p-4 max-w-3xl mx-auto">{children}</main>
          <footer className="max-w-3xl mx-auto p-6 text-sm text-gray-600 border-t mt-10 flex justify-between">
            <div>&copy; {new Date().getFullYear()} IEP Ally</div>
            <div className="space-x-4">
              <a className="underline" href="/legal/terms">Terms</a>
              <a className="underline" href="/legal/privacy">Privacy</a>
              <a className="underline" href="/legal/sub-processors">Sub-processors</a>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
