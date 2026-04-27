import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUserCredits, getPlanById, getPlans, ensureUserRecord } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request.headers.get("cookie"));
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensureUserRecord(session.user);
    const userId = session.user.sub;
    const [credits, allPlans] = await Promise.all([
      getUserCredits(userId),
      getPlans(),
    ]);

    const currentPlan = await getPlanById(credits.current_plan);

    return NextResponse.json({
      currentPlan: currentPlan ?? allPlans.find((p) => p.id === "free"),
      credits: {
        total: credits.total_credits,
        used: credits.used_credits,
        remaining: Math.max(0, credits.total_credits - credits.used_credits),
      },
      expiresAt: credits.plan_expires_at,
      plans: allPlans,
    });
  } catch (error) {
    console.error("Get subscription error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
