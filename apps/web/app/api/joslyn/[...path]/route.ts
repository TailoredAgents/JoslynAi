import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../../lib/auth-options";
import crypto from "node:crypto";

const API_ORIGIN = process.env.JOSLYN_API_ORIGIN || "http://localhost:8080";
// Secret used to mint API-compatible JWTs (must match API JWT_SECRET)
const API_JWT_SECRET = process.env.API_JWT_SECRET || process.env.JWT_SECRET || "";

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

async function proxy(request: Request, params: { path: string[] }) {
  const base = sanitizeBase(API_ORIGIN);
  const pathSegments = Array.isArray(params?.path) ? params.path : [];
  const targetPath = pathSegments.length ? pathSegments.join("/") : "";
  // Block SSRF: do not allow absolute/external targets
  const lower = targetPath.toLowerCase();
  if (!targetPath || lower.startsWith("http://") || lower.startsWith("https://") || lower.includes("://")) {
    return NextResponse.json({ error: "invalid_path" }, { status: 400 });
  }
  const targetUrl = new URL(targetPath, base);
  try {
    const inUrl = new URL(request.url);
    if (inUrl.search) targetUrl.search = inUrl.search;
  } catch {}

  const session = await getServerSession(authOptions);
  // Require a valid session for proxying user requests
  if (!session?.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
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

  // Build a short-lived JWT for the API (5 minutes)
  if (!API_JWT_SECRET) {
    return NextResponse.json({ error: "api_jwt_secret_missing" }, { status: 500 });
  }
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: "joslyn-web",
    aud: "joslyn-api",
    iat: now,
    exp: now + 300,
    sub: identity.userId,
    email: identity.email,
    role: identity.role,
    org_id: identity.orgId,
  } as const;
  const segH = Buffer.from(JSON.stringify(header)).toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const segP = Buffer.from(JSON.stringify(payload)).toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const data = `${segH}.${segP}`;
  const sig = crypto.createHmac("sha256", API_JWT_SECRET).update(data).digest("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  headers.set("authorization", `Bearer ${data}.${sig}`);

  const body = request.method === "GET" || request.method === "HEAD" ? undefined : (request as any).body ?? undefined;

  const upstream = await fetch(targetUrl, {
    method: request.method,
    headers,
    body,
    // Needed when streaming a Request.body in Node.js runtimes
    ...(body ? ({ duplex: "half" } as any) : {}),
    redirect: "manual",
  });

  const responseHeaders = new Headers(upstream.headers);
  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export async function GET(request: Request, context: any) {
  const params = (await (context?.params)) || { path: [] };
  return proxy(request, params);
}
export async function POST(request: Request, context: any) {
  const params = (await (context?.params)) || { path: [] };
  return proxy(request, params);
}
export async function PUT(request: Request, context: any) {
  const params = (await (context?.params)) || { path: [] };
  return proxy(request, params);
}
export async function PATCH(request: Request, context: any) {
  const params = (await (context?.params)) || { path: [] };
  return proxy(request, params);
}
export async function DELETE(request: Request, context: any) {
  const params = (await (context?.params)) || { path: [] };
  return proxy(request, params);
}
export async function OPTIONS(request: Request, context: any) {
  const params = (await (context?.params)) || { path: [] };
  return proxy(request, params);
}
// Ensure Node.js runtime for compatibility with NextAuth and streaming bodies
export const runtime = "nodejs";
