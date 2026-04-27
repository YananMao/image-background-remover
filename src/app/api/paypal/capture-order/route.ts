import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { capturePayPalOrder, getPayPalOrder } from "@/lib/paypal";
import { completeOrder, upgradeUserPlan } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request.headers.get("cookie"));
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { orderId } = body;

    if (!orderId) {
      return NextResponse.json(
        { error: "Order ID is required" },
        { status: 400 }
      );
    }

    // 先查询订单状态，避免重复捕获
    const existingOrder = await getPayPalOrder(orderId);
    if (existingOrder.status === "COMPLETED") {
      // 已经支付过了，更新本地状态
      const orderInfo = await completeOrder(orderId);
      if (orderInfo) {
        await upgradeUserPlan(orderInfo.userId, orderInfo.planId, orderInfo.type);
      }
      return NextResponse.json({ success: true, status: "COMPLETED" });
    }

    // 捕获订单
    const captureResult = await capturePayPalOrder(orderId);

    if (captureResult.status !== "COMPLETED") {
      return NextResponse.json(
        {
          error: "Payment not completed",
          status: captureResult.status,
        },
        { status: 400 }
      );
    }

    // 更新本地订单状态并升级用户套餐
    const orderInfo = await completeOrder(orderId);
    if (!orderInfo) {
      return NextResponse.json(
        { error: "Order not found in database" },
        { status: 404 }
      );
    }

    // 确认是同一用户
    if (orderInfo.userId !== session.user.sub) {
      return NextResponse.json(
        { error: "Order does not belong to current user" },
        { status: 403 }
      );
    }

    await upgradeUserPlan(orderInfo.userId, orderInfo.planId, orderInfo.type);

    return NextResponse.json({ success: true, status: "COMPLETED" });
  } catch (error) {
    console.error("Capture order error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to capture order";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
