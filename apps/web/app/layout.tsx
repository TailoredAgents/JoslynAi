import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "IEP Ally",
  description: "AI assistant for IEP/504 and benefits",
  manifest: "/manifest.json",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="p-4 border-b flex items-center justify-between">
          <h1 className="font-semibold">IEP Ally</h1>
        </header>
        <main className="p-4 max-w-3xl mx-auto">{children}</main>
      </body>
    </html>
  );
}

