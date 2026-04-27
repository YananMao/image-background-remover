const PAYPAL_API_BASE = process.env.PAYPAL_API_BASE;
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;

function assertConfig() {
  if (!PAYPAL_API_BASE || !PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error("PayPal environment variables are not configured");
  }
}

// 获取 PayPal Access Token
export async function getPayPalAccessToken(): Promise<string> {
  assertConfig();
  const auth = btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`);
  const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal token error: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.access_token;
}

export interface PayPalOrder {
  id: string;
  status: string;
  purchase_units: Array<{
    amount: { currency_code: string; value: string };
  }>;
  links?: Array<{
    href: string;
    rel: string;
    method: string;
  }>;
}

export interface PayPalOrderResult {
  id: string;
  approvalUrl: string;
}

// 创建订单
export async function createPayPalOrder(
  amount: string,
  currency: string = "USD",
  returnUrl?: string,
  cancelUrl?: string
): Promise<PayPalOrderResult> {
  assertConfig();
  const accessToken = await getPayPalAccessToken();

  const body: Record<string, unknown> = {
    intent: "CAPTURE",
    purchase_units: [
      {
        amount: { currency_code: currency, value: amount },
      },
    ],
  };

  if (returnUrl || cancelUrl) {
    body.application_context = {};
    if (returnUrl) (body.application_context as Record<string, string>).return_url = returnUrl;
    if (cancelUrl) (body.application_context as Record<string, string>).cancel_url = cancelUrl;
  }

  const res = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal create order error: ${res.status} ${text}`);
  }

  const order: PayPalOrder = await res.json();

  // 从 PayPal 返回的 links 中提取 approvalUrl
  let approvalUrl = "";
  if (order.links) {
    const approveLink = order.links.find((l) => l.rel === "approve");
    if (approveLink) approvalUrl = approveLink.href;
  }

  // 如果 links 中没有 approvalUrl，手动构造（兼容某些 PayPal 环境）
  if (!approvalUrl) {
    const isSandbox = PAYPAL_API_BASE?.includes("sandbox") ?? false;
    const host = isSandbox ? "https://www.sandbox.paypal.com" : "https://www.paypal.com";
    approvalUrl = `${host}/checkoutnow?token=${order.id}`;
  }

  return { id: order.id, approvalUrl };
}

// 捕获订单
export async function capturePayPalOrder(orderId: string): Promise<PayPalOrder> {
  assertConfig();
  const accessToken = await getPayPalAccessToken();
  const res = await fetch(
    `${PAYPAL_API_BASE}/v2/checkout/orders/${orderId}/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": crypto.randomUUID(),
      },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal capture error: ${res.status} ${text}`);
  }

  return res.json();
}

// 查询订单详情
export async function getPayPalOrder(orderId: string): Promise<PayPalOrder> {
  assertConfig();
  const accessToken = await getPayPalAccessToken();
  const res = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal get order error: ${res.status} ${text}`);
  }

  return res.json();
}

// 验证 Webhook 签名
export async function verifyWebhookSignature(
  headers: {
    transmissionId: string;
    transmissionTime: string;
    certId: string;
    authAlgo: string;
    transmissionSig: string;
  },
  webhookEvent: unknown
): Promise<boolean> {
  assertConfig();
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    console.warn("PAYPAL_WEBHOOK_ID not configured, skipping signature verification");
    return true;
  }

  const accessToken = await getPayPalAccessToken();
  const res = await fetch(`${PAYPAL_API_BASE}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      auth_algo: headers.authAlgo,
      cert_id: headers.certId,
      transmission_id: headers.transmissionId,
      transmission_sig: headers.transmissionSig,
      transmission_time: headers.transmissionTime,
      webhook_id: webhookId,
      webhook_event: webhookEvent,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("PayPal webhook verification error:", res.status, text);
    return false;
  }

  const data = await res.json();
  return data.verification_status === "SUCCESS";
}
