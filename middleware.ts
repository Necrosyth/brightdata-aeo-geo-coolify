import { NextRequest, NextResponse } from "next/server";

/**
 * Edge middleware that protects dashboard routes and the API.
 * Reads an HMAC-signed auth_token cookie and validates it.
 * Unauthenticated users are redirected to /login.
 * Authenticated users on /login are redirected to /.
 */

// Routes that do NOT require authentication
const PUBLIC_ROUTES = ["/login", "/_next", "/favicon.ico"];

// API routes that are public (auth endpoints themselves)
const PUBLIC_API_PREFIXES = ["/api/auth/login", "/api/auth/logout"];

function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.some((r) => pathname.startsWith(r))) return true;
  if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip public routes
  if (isPublicRoute(pathname)) {
    // If user is already authenticated and trying to access /login, redirect to /
    if (pathname === "/login" && (await isValidToken(req))) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  // For all other routes, check authentication
  const valid = await isValidToken(req);
  if (!valid) {
    // Redirect to login, preserving the original URL as a query param
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

async function isValidToken(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get("auth_token")?.value;
  if (!token) return false;

  try {
    const secret = getSecret();
    const parts = token.split(".");
    if (parts.length !== 2) return false;

    const [payloadB64, signatureB64] = parts;
    const expectedSig = await hmacSha256(payloadB64, secret);

    if (signatureB64 !== expectedSig) return false;

    const payloadJson = Buffer.from(payloadB64, "base64url").toString("utf-8");
    const payload = JSON.parse(payloadJson);

    // Check expiry
    if (payload.exp && payload.exp < Date.now()) return false;

    return true;
  } catch {
    return false;
  }
}

function getSecret(): string {
  return process.env.AUTH_SECRET || "sovereign-default-secret-change-in-production";
}

async function hmacSha256(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return Buffer.from(sig).toString("base64url");
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
