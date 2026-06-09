import { NextResponse } from "next/server";

/**
 * POST /api/auth/logout
 * Clears the auth_token cookie.
 */
export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set("auth_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0, // delete immediately
  });
  return response;
}
