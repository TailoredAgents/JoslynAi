import crypto from "node:crypto";
import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

function deriveOrgId(email: string | null | undefined) {
  const source = (email || "anon@joslyn.ai").trim().toLowerCase();
  const digest = crypto.createHash("sha1").update(source).digest("hex").slice(0, 24);
  return `org_${digest}`;
}

function buildUser(email: string) {
  const normalized = email.trim().toLowerCase();
  const id = `user_${crypto.createHash("sha1").update(normalized).digest("hex").slice(0, 24)}`;
  const org_id = deriveOrgId(normalized);
  return { id, email: normalized, org_id, role: "owner" as const };
}

export const authOptions: NextAuthOptions = {
  providers: [
    Credentials({
      name: "Email",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(credentials) {
        const email = (credentials?.email || "").toString().trim().toLowerCase();
        if (!email) return null;
        return buildUser(email) as any;
      },
    }),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            profile(profile) {
              const email = profile.email || "";
              return { ...profile, ...buildUser(email) } as any;
            },
          }),
        ]
      : []),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const base = buildUser((user as any).email || (token.email as string) || "user@joslyn.ai");
        token.sub = (user as any).id || base.id;
        token.email = (user as any).email || base.email;
        token.org_id = (user as any).org_id || base.org_id;
        token.role = (user as any).role || "owner";
      } else {
        if (!token.org_id) {
          token.org_id = deriveOrgId(token.email as string | undefined);
        }
        if (!token.role) {
          token.role = "owner";
        }
      }
      return token;
    },
    async session({ session, token }) {
      const existing = session.user || {};
      (session as any).user = {
        ...existing,
        id: token.sub,
        email: token.email,
        org_id: token.org_id,
        role: token.role || "owner",
      };
      (session as any).accessToken = token;
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {},
};