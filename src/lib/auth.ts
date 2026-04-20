import { SignJWT, jwtVerify } from "jose";

export interface GoogleUser {
  email: string;
  name: string;
  picture: string;
  sub: string;
}

export interface Session {
  user: GoogleUser;
  expiresAt: number;
}

export const COOKIE_NAME = "auth-session";
export const SESSION_DURATION = 7 * 24 * 60 * 60; // 7 days in seconds

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET environment variable is not set");
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(user: GoogleUser): Promise<string> {
  return new SignJWT({ user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION}s`)
    .sign(getSecret());
}

export async function verifySessionToken(
  token: string
): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return {
      user: payload.user as GoogleUser,
      expiresAt: payload.exp as number,
    };
  } catch {
    return null;
  }
}

export async function getSession(
  cookieHeader: string | null
): Promise<Session | null> {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;
  return verifySessionToken(match[1]);
}
