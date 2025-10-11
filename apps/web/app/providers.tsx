"use client";
import { SessionProvider } from "next-auth/react";
import OrgBootstrapper from "../components/OrgBootstrapper";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <OrgBootstrapper />
      {children}
    </SessionProvider>
  );
}
