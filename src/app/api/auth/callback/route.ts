import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, COOKIE_NAME, SESSION_DURATION } from "@/lib/auth";
import type { GoogleUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const storedState = request.cookies.get("oauth-state")?.value;

  if (!code || !state || state !== storedState) {
    return NextResponse.redirect(new URL("/?error=auth_failed", request.url));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL("/?error=server_error", request.url)
    );
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${new URL(request.url).origin}/api/auth/callback`,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error("Token exchange failed");
    }

    const tokens = await tokenResponse.json();

    // Decode ID token payload to extract user info
    const idToken = tokens.id_token;
    const payload = JSON.parse(
      atob(idToken.split(".")[1])
    );

    const user: GoogleUser = {
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      sub: payload.sub,
    };

    const sessionToken = await createSessionToken(user);

    const response = NextResponse.redirect(new URL("/", request.url));

    response.cookies.set(COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_DURATION,
      path: "/",
    });

    // Clear the oauth-state cookie
    response.cookies.set("oauth-state", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(new URL("/?error=auth_failed", request.url));
  }
}
