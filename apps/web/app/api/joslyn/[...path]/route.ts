import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../../lib/auth-options";

const API_ORIGIN = process.env.JOSLYN_API_ORIGIN || "http://localhost:8080";

function sanitizeBase(origin: string) {
  try {
    return new URL(origin);
  } catch (error) {
    throw new Error("JOSLYN_API_ORIGIN must be an absolute URL");
  }
}

type CookieStore = Awaited<ReturnType<typeof cookies>>;

function buildIdentity(session: any, cookieStore: CookieStore) {
  const cookieOrg = cookieStore.get("joslyn-org")?.value || null;
  const cookieUser = cookieStore.get("joslyn-user")?.value || null;
  const cookieEmail = cookieStore.get("joslyn-email")?.value || null;
  const cookieRole = cookieStore.get("joslyn-role")?.value || null;

  if (session?.user?.org_id) {
    return {
      orgId: session.user.org_id,
      userId: session.user.id || cookieUser || "user-anon",
      email: session.user.email || cookieEmail || "anon@joslyn.ai",
      role: session.user.role || cookieRole || "owner",
    };
  }

  return {
    orgId: cookieOrg || "org-anon",
    userId: cookieUser || "user-anon",
    email: cookieEmail || "anon@joslyn.ai",
    role: cookieRole || "owner",
  };
}

async function proxy(request: NextRequest, params: { path: string[] }) {
  const base = sanitizeBase(API_ORIGIN);
  const pathSegments = Array.isArray(params?.path) ? params.path : [];
  const targetPath = pathSegments.length ? pathSegments.join("/") : "";
  const targetUrl = new URL(targetPath, base);
  if (request.nextUrl.search) {
    targetUrl.search = request.nextUrl.search;
  }

  const session = await getServerSession(authOptions);
  const cookieStore = await cookies();
  const identity = buildIdentity(session, cookieStore);

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === "host" || lower === "connection" || lower === "content-length") {
      return;
    }
    headers.set(key, value);
  });

  headers.set("x-org-id", identity.orgId);
  headers.set("x-user-id", identity.userId);
  headers.set("x-user-email", identity.email);
  headers.set("x-user-role", identity.role);

  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();

  const upstream = await fetch(targetUrl, {
    method: request.method,
    headers,
    body,
    redirect: "manual",
  });

  const responseHeaders = new Headers(upstream.headers);
  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export async function (request: NextRequest, { params }: { params: { path: string[] } }) { return proxy(request, params); }
export async function (request: NextRequest, { params }: { params: { path: string[] } }) { return proxy(request, params); }
export async function (request: NextRequest, { params }: { params: { path: string[] } }) { return proxy(request, params); }
export async function (request: NextRequest, { params }: { params: { path: string[] } }) { return proxy(request, params); }
export async function (request: NextRequest, { params }: { params: { path: string[] } }) { return proxy(request, params); }
export async function (request: NextRequest, { params }: { params: { path: string[] } }) { return proxy(request, params); }
