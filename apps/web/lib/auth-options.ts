import crypto from "node:crypto";
import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import EmailProvider from "next-auth/providers/email";

// Simple in-memory throttle for Credentials sign-ins (best-effort)
const attemptMap = new Map<string, { count: number; windowStart: number }>();
function tooManyAttempts(key: string, limit = 5, windowMs = 60_000) {
  const now = Date.now();
  const rec = attemptMap.get(key) || { count: 0, windowStart: now };
  if (now - rec.windowStart > windowMs) {
    rec.count = 0;
    rec.windowStart = now;
  }
  rec.count += 1;
  attemptMap.set(key, rec);
  return rec.count > limit;
}

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

const hasEmailProvider = Boolean(
  process.env.EMAIL_FROM &&
    (process.env.EMAIL_SERVER || (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS))
);
const allowDevCredentials = process.env.ALLOW_DEV_FAKE_LOGIN === "1";

if (!hasEmailProvider) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("EMAIL auth configuration missing: set EMAIL_FROM and SMTP settings.");
  }
  if (!allowDevCredentials) {
    throw new Error(
      "Email auth not configured. Set EMAIL_FROM/SMTP_* or explicitly allow ALLOW_DEV_FAKE_LOGIN=1 for dev."
    );
  }
}

const providers: NextAuthOptions["providers"] = [];

if (hasEmailProvider) {
  providers.push(
    EmailProvider({
      server: process.env.EMAIL_SERVER || {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      },
      from: process.env.EMAIL_FROM!,
    })
  );
} else if (allowDevCredentials) {
  providers.push(
    Credentials({
      name: "Email (dev)",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(credentials, req) {
        const ip = (req as any)?.headers?.["x-forwarded-for"] || "unknown";
        if (tooManyAttempts(String(ip))) return null;
        const email = (credentials?.email || "").toString().trim().toLowerCase();
        if (!email) return null;
        return buildUser(email) as any;
      },
    })
  );
}

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      profile(profile) {
        const email = profile.email || "";
        return { ...profile, ...buildUser(email) } as any;
      },
    })
  );
}

export const authOptions: NextAuthOptions = {
  providers,
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
  pages: { signIn: "/signin" },
};
