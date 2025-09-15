import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

const handler = NextAuth({
  providers: [
    Credentials({
      name: "Email",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(credentials) {
        const email = (credentials?.email || "").toString().trim().toLowerCase();
        if (!email) return null;
        // Dev-only: derive a stable id from email
        const id = `user_${Buffer.from(email).toString("hex").slice(0, 12)}`;
        return { id, email } as any;
      }
    }),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [Google({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET })]
      : []),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = (user as any).id;
        token.email = (user as any).email;
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).user = { id: token.sub, email: token.email } as any;
      (session as any).accessToken = token as any; // include raw token
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {},
});

export { handler as GET, handler as POST };

export default handler;
