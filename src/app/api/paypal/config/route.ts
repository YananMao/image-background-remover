import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await getSession(request.headers.get("cookie"));
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const isSandbox = process.env.PAYPAL_API_BASE?.includes("sandbox") ?? false;

  if (!clientId) {
    return NextResponse.json(
      { error: "PayPal not configured" },
      { status: 500 }
    );
  }

  return NextResponse.json({ clientId, isSandbox });
}
