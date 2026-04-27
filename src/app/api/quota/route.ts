import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUserCredits, checkDailyLimit, ensureUserRecord } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request.headers.get("cookie"));
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensureUserRecord(session.user);
    const userId = session.user.sub;
    const credits = await getUserCredits(userId);
    const withinDailyLimit = await checkDailyLimit(userId);

    return NextResponse.json({
      total: credits.total_credits,
      used: credits.used_credits,
      remaining: Math.max(0, credits.total_credits - credits.used_credits),
      currentPlan: credits.current_plan,
      withinDailyLimit,
    });
  } catch (error) {
    console.error("Get quota error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
