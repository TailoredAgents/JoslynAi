import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (token) return NextResponse.next();

  const url = req.nextUrl.clone();
  const callbackUrl = url.href;
  const signInUrl = new URL("/api/auth/signin", url.origin);
  signInUrl.searchParams.set("callbackUrl", callbackUrl);
  return NextResponse.redirect(signInUrl);
}

// Only protect app areas; keep marketing, assets, and API proxy public
export const config = {
  matcher: [
    "/copilot/:path*",
    "/documents/:path*",
    "/letters/:path*",
    "/claims/:path*",
    "/goals/:path*",
    "/iep/:path*",
    "/meetings/:path*",
    "/recommendations/:path*",
    "/research/:path*",
    "/about-my-child/:path*",
    "/eligibility/:path*",
    "/one-pagers/:path*",
    "/admin/:path*",
  ],
};

