import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "IEP Comparison",
  description: "Compare the latest IEP to the previous version and review risk flags."
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
