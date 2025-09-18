import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user?: (DefaultSession["user"] & {
      id?: string | null;
      org_id?: string | null;
      role?: string | null;
    }) | null;
  }

  interface User {
    id?: string;
    org_id?: string;
    role?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    org_id?: string;
    role?: string;
  }
}