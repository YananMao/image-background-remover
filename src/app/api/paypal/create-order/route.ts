import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getPlanById, createOrderRecord } from "@/lib/db";
import { createPayPalOrder } from "@/lib/paypal";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request.headers.get("cookie"));
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { planId } = body;

    if (!planId) {
      return NextResponse.json(
        { error: "Plan ID is required" },
        { status: 400 }
      );
    }

    const plan = await getPlanById(planId);
    if (!plan) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    if (planId === "free") {
      return NextResponse.json(
        { error: "Cannot purchase free plan" },
        { status: 400 }
      );
    }

    if (!plan.price) {
      return NextResponse.json(
        { error: "Plan has no price" },
        { status: 400 }
      );
    }

    // 构造支付完成后的返回地址
    const origin = new URL(request.url).origin;
    const returnUrl = `${origin}/?payment=success`;
    const cancelUrl = `${origin}/?payment=cancel`;

    const paypalOrder = await createPayPalOrder(
      plan.price,
      plan.currency,
      returnUrl,
      cancelUrl
    );

    if (!paypalOrder.id) {
      return NextResponse.json(
        { error: "Failed to create PayPal order" },
        { status: 500 }
      );
    }

    const orderType = planId === "onetime" ? "onetime" : "subscription";
    await createOrderRecord({
      id: crypto.randomUUID(),
      userId: session.user.sub,
      planId,
      paypalOrderId: paypalOrder.id,
      amount: plan.price,
      currency: plan.currency,
      type: orderType,
    });

    return NextResponse.json({
      id: paypalOrder.id,
      approvalUrl: paypalOrder.approvalUrl,
    });
  } catch (error) {
    console.error("Create order error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to create order";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
