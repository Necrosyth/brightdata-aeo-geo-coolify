import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/auth/login
 * Accepts { username, password } and sets an auth_token cookie if credentials match.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, password } = body as {
      username?: string;
      password?: string;
    };

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 },
      );
    }

    const expectedUsername =
      process.env.DASHBOARD_USERNAME || "admin";
    const expectedPassword =
      process.env.DASHBOARD_PASSWORD || "admin";

    if (username !== expectedUsername || password !== expectedPassword) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 },
      );
    }

    // Create auth token (payload.expiry)
    const secret = process.env.AUTH_SECRET || "sovereign-default-secret-change-in-production";
    const payload = {
      username,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signatureB64 = await hmacSha256(payloadB64, secret);
    const token = `${payloadB64}.${signatureB64}`;

    const response = NextResponse.json({ ok: true });
    response.cookies.set("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
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
