import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import HeaderNav from "../components/HeaderNav";

export const metadata: Metadata = {
  title: "IEP Ally",
  description: "AI assistant for IEP/504 and benefits",
  manifest: "/manifest.json",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <HeaderNav />
        <main className="p-4 max-w-3xl mx-auto">{children}</main>
      </body>
    </html>
  );
}
