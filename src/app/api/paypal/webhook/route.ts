import { NextRequest, NextResponse } from "next/server";
import {
  isWebhookProcessed,
  logWebhook,
  findOrderByPayPalId,
  completeOrder,
  upgradeUserPlan,
  cancelUserSubscription,
} from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/paypal";

// PayPal Webhook 事件处理器
// 文档：https://developer.paypal.com/api/rest/webhooks/

interface PayPalWebhookEvent {
  id: string;
  event_version: string;
  create_time: string;
  resource_type: string;
  event_type: string;
  summary: string;
  resource: Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  try {
    // 读取 PayPal 传输头（用于幂等性和后续签名验证）
    const transmissionId = request.headers.get("paypal-transmission-id") || "";
    const transmissionTime = request.headers.get("paypal-transmission-time") || "";
    const certId = request.headers.get("paypal-cert-id") || "";
    const authAlgo = request.headers.get("paypal-auth-algo") || "";
    const transmissionSig = request.headers.get("paypal-transmission-sig") || "";

    if (!transmissionId) {
      return NextResponse.json({ error: "Missing transmission ID" }, { status: 400 });
    }

    // 幂等性检查：同一个 transmission_id 只处理一次
    const alreadyProcessed = await isWebhookProcessed(transmissionId);
    if (alreadyProcessed) {
      return NextResponse.json({ success: true, message: "Already processed" });
    }

    // 解析事件体
    const event: PayPalWebhookEvent = await request.json();
    const eventType = event.event_type;
    const resource = event.resource;

    // 验证 PayPal 签名（防止伪造请求）
    const isValid = await verifyWebhookSignature(
      {
        transmissionId,
        transmissionTime,
        certId,
        authAlgo,
        transmissionSig,
      },
      event
    );

    if (!isValid) {
      console.error(`[Webhook] Invalid signature, txId: ${transmissionId}`);
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    console.log(`[Webhook] ${eventType} received, txId: ${transmissionId}`);

    // 处理不同事件类型
    switch (eventType) {
      case "PAYMENT.CAPTURE.COMPLETED": {
        // 付款完成
        const orderId = resource.order_id as string | undefined;
        const captureId = resource.id as string | undefined;
        const status = resource.status as string | undefined;

        if (orderId && status === "COMPLETED") {
          const orderInfo = await findOrderByPayPalId(orderId);
          if (orderInfo) {
            // 完成订单并升级用户
            await completeOrder(orderId);
            await upgradeUserPlan(orderInfo.userId, orderInfo.planId, orderInfo.type);
            console.log(`[Webhook] Order ${orderId} completed, user ${orderInfo.userId} upgraded to ${orderInfo.planId}`);
          } else {
            console.warn(`[Webhook] Order ${orderId} not found in database`);
          }
        }
        break;
      }

      case "BILLING.SUBSCRIPTION.ACTIVATED": {
        // 订阅已激活
        const subscriptionId = resource.id as string | undefined;
        const customId = resource.custom_id as string | undefined;
        console.log(`[Webhook] Subscription activated: ${subscriptionId}, custom: ${customId}`);
        // 通常在前端 capture 时已经处理了，这里做兜底
        break;
      }

      case "BILLING.SUBSCRIPTION.CANCELLED": {
        // 订阅已取消
        const customId = resource.custom_id as string | undefined;
        if (customId) {
          // custom_id 可以存储 user_id，如果设置了的话
          // 目前我们的系统没有设置 custom_id，需要额外逻辑匹配
          console.log(`[Webhook] Subscription cancelled, custom: ${customId}`);
        }
        break;
      }

      case "BILLING.SUBSCRIPTION.EXPIRED": {
        // 订阅已过期
        const customId = resource.custom_id as string | undefined;
        if (customId) {
          await cancelUserSubscription(customId);
          console.log(`[Webhook] Subscription expired, user ${customId} downgraded to free`);
        }
        break;
      }

      default:
        console.log(`[Webhook] Unhandled event type: ${eventType}`);
    }

    // 记录已处理
    await logWebhook({
      transmissionId,
      eventType,
      resourceId: resource.id as string | undefined,
      payload: JSON.stringify(event),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
