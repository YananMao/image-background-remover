import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await getSession(request.headers.get("cookie"));
  if (!session) {
    return NextResponse.json({ user: null });
  }
  return NextResponse.json({ user: session.user });
}
