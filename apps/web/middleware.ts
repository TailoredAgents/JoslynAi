import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ORG_COOKIE = "joslyn-org";
const USER_COOKIE = "joslyn-user";
const EMAIL_COOKIE = "joslyn-email";
const ROLE_COOKIE = "joslyn-role";
const COOKIE_BASE_OPTIONS = { path: "/", sameSite: "lax" as const, maxAge: 60 * 60 * 24 * 365 };

type CookieName = typeof ORG_COOKIE | typeof USER_COOKIE | typeof EMAIL_COOKIE | typeof ROLE_COOKIE;

function ensureCookie(response: NextResponse, request: NextRequest, name: CookieName, value: string) {
  if (!request.cookies.get(name)?.value) {
    response.cookies.set(name, value, COOKIE_BASE_OPTIONS);
  }
}

function ensureIdentity(response: NextResponse, request: NextRequest) {
  const seed = crypto.randomUUID().replace(/-/g, "");
  const orgId = `org_${seed}`;
  const userId = `user_${seed.slice(0, 24)}`;
  const email = `${userId}@joslyn.local`;

  ensureCookie(response, request, ORG_COOKIE, orgId);
  ensureCookie(response, request, USER_COOKIE, userId);
  ensureCookie(response, request, EMAIL_COOKIE, email);
  ensureCookie(response, request, ROLE_COOKIE, "owner");
}

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  const lang = request.nextUrl.searchParams.get("lang");
  if (lang) {
    response.cookies.set("NEXT_LOCALE", lang, { path: "/" });
  }

  ensureIdentity(response, request);
  return response;
}