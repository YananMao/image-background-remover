import { getCloudflareContext } from "@opennextjs/cloudflare";

export interface Plan {
  id: string;
  name: string;
  price: string | null;
  currency: string;
  monthly_credits: number;
  daily_limit: number;
  sort_order: number;
}

export interface UserCredits {
  user_id: string;
  total_credits: number;
  used_credits: number;
  current_plan: string;
  plan_expires_at: string | null;
}

async function getDB() {
  const { env } = await getCloudflareContext({ async: true });
  const db = env.DB as D1Database;
  if (!db) {
    throw new Error("D1 database binding 'DB' not found");
  }
  return db;
}

// 查询所有套餐
export async function getPlans(): Promise<Plan[]> {
  const db = await getDB();
  const result = await db
    .prepare("SELECT * FROM plans ORDER BY sort_order")
    .all<Plan>();
  return result.results ?? [];
}

// 查询单个套餐
export async function getPlanById(planId: string): Promise<Plan | null> {
  const db = await getDB();
  const result = await db
    .prepare("SELECT * FROM plans WHERE id = ?")
    .bind(planId)
    .first<Plan>();
  return result ?? null;
}

// 获取或初始化用户额度
export async function getUserCredits(userId: string): Promise<UserCredits> {
  const db = await getDB();
  let credits = await db
    .prepare("SELECT * FROM user_credits WHERE user_id = ?")
    .bind(userId)
    .first<UserCredits>();

  if (!credits) {
    // 初始化免费用户额度
    try {
      await db
        .prepare(
          "INSERT INTO user_credits (user_id, total_credits, used_credits, current_plan) VALUES (?, 2, 0, 'free')"
        )
        .bind(userId)
        .run();

      credits = await db
        .prepare("SELECT * FROM user_credits WHERE user_id = ?")
        .bind(userId)
        .first<UserCredits>();
    } catch {
      // 外键约束失败（users 表无此用户记录），返回临时默认额度
      // 用户重新登录后会自动写入 users 表并持久化额度
      return {
        user_id: userId,
        total_credits: 2,
        used_credits: 0,
        current_plan: "free",
        plan_expires_at: null,
      };
    }
  }

  // 检查订阅是否过期，如果过期则降级为免费
  if (
    credits &&
    credits.plan_expires_at &&
    new Date(credits.plan_expires_at) < new Date()
  ) {
    await db
      .prepare(
        "UPDATE user_credits SET current_plan = 'free', total_credits = 2, plan_expires_at = NULL, updated_at = datetime('now') WHERE user_id = ?"
      )
      .bind(userId)
      .run();

    credits = await db
      .prepare("SELECT * FROM user_credits WHERE user_id = ?")
      .bind(userId)
      .first<UserCredits>();
  }

  return credits!;
}

// 增加用户使用记录
export async function logUsage(userId: string, action: string): Promise<void> {
  try {
    const db = await getDB();
    await db
      .prepare("INSERT INTO usage_logs (user_id, action) VALUES (?, ?)")
      .bind(userId, action)
      .run();
  } catch {
    // 静默忽略（可能是外键约束失败，users 表无此用户记录）
  }
}

// 确保用户记录在 users 表中存在（用于补录老用户）
export async function ensureUserRecord(user: {
  sub: string;
  email: string;
  name: string;
  picture: string;
}): Promise<void> {
  try {
    const db = await getDB();
    await db
      .prepare(
        `INSERT INTO users (id, google_id, email, name, avatar_url, last_login_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           avatar_url = excluded.avatar_url,
           last_login_at = datetime('now')`
      )
      .bind(user.sub, user.sub, user.email, user.name, user.picture)
      .run();

    // 同时确保 user_credits 记录存在
    await db
      .prepare(
        `INSERT OR IGNORE INTO user_credits (user_id, total_credits, used_credits, current_plan)
         VALUES (?, 2, 0, 'free')`
      )
      .bind(user.sub)
      .run();
  } catch {
    // 忽略错误，不影响主流程
  }
}

// 扣减额度
export async function deductCredit(userId: string): Promise<boolean> {
  const db = await getDB();
  const credits = await getUserCredits(userId);

  if (credits.used_credits >= credits.total_credits) {
    return false;
  }

  const result = await db
    .prepare(
      "UPDATE user_credits SET used_credits = used_credits + 1, updated_at = datetime('now') WHERE user_id = ?"
    )
    .bind(userId)
    .run();

  // 如果 UPDATE 没命中（记录不存在），尝试 INSERT
  if (!result.meta || result.meta.changes === 0) {
    try {
      await db
        .prepare(
          "INSERT INTO user_credits (user_id, total_credits, used_credits, current_plan) VALUES (?, 2, 1, 'free')"
        )
        .bind(userId)
        .run();
    } catch {
      return false;
    }
  }

  return true;
}

// 支付成功后升级套餐
export async function upgradeUserPlan(
  userId: string,
  planId: string,
  orderType: string = "subscription"
): Promise<void> {
  const db = await getDB();
  const plan = await getPlanById(planId);
  if (!plan) throw new Error("Plan not found");

  const now = new Date();
  let planExpiresAt: string | null = null;

  if (orderType === "subscription" && planId !== "free" && planId !== "onetime") {
    // 订阅套餐：30 天有效期
    const expiry = new Date(now);
    expiry.setDate(expiry.getDate() + 30);
    planExpiresAt = expiry.toISOString();
  }

  // 一次性购买：额度累加，永久有效
  if (planId === "onetime") {
    await db
      .prepare(
        `UPDATE user_credits 
         SET total_credits = total_credits + ?, 
             used_credits = used_credits,
             current_plan = CASE WHEN current_plan = 'free' THEN 'onetime' ELSE current_plan END,
             updated_at = datetime('now')
         WHERE user_id = ?`
      )
      .bind(plan.monthly_credits, userId)
      .run();
    return;
  }

  // 订阅套餐：重置额度
  await db
    .prepare(
      `INSERT INTO user_credits (user_id, total_credits, used_credits, current_plan, plan_expires_at, updated_at)
       VALUES (?, ?, 0, ?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         total_credits = excluded.total_credits,
         used_credits = 0,
         current_plan = excluded.current_plan,
         plan_expires_at = excluded.plan_expires_at,
         updated_at = datetime('now')`
    )
    .bind(userId, plan.monthly_credits, planId, planExpiresAt)
    .run();
}

// 创建订单记录
export async function createOrderRecord(params: {
  id: string;
  userId: string;
  planId: string;
  paypalOrderId: string;
  amount: string;
  currency?: string;
  type?: string;
}): Promise<void> {
  const db = await getDB();
  await db
    .prepare(
      `INSERT INTO orders (id, user_id, plan_id, paypal_order_id, amount, currency, type, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', datetime('now'))`
    )
    .bind(
      params.id,
      params.userId,
      params.planId,
      params.paypalOrderId,
      params.amount,
      params.currency ?? "USD",
      params.type ?? "subscription"
    )
    .run();
}

// 完成订单
export async function completeOrder(
  paypalOrderId: string
): Promise<{ userId: string; planId: string; type: string } | null> {
  const db = await getDB();
  const order = await db
    .prepare("SELECT * FROM orders WHERE paypal_order_id = ?")
    .bind(paypalOrderId)
    .first<{ user_id: string; plan_id: string; type: string }>();

  if (!order) return null;

  await db
    .prepare(
      "UPDATE orders SET status = 'COMPLETED', completed_at = datetime('now') WHERE paypal_order_id = ?"
    )
    .bind(paypalOrderId)
    .run();

  return {
    userId: order.user_id,
    planId: order.plan_id,
    type: order.type,
  };
}

// Webhook 幂等性检查
export async function isWebhookProcessed(transmissionId: string): Promise<boolean> {
  const db = await getDB();
  const log = await db
    .prepare("SELECT 1 FROM webhook_logs WHERE transmission_id = ?")
    .bind(transmissionId)
    .first();
  return !!log;
}

// 记录 Webhook 处理日志
export async function logWebhook(params: {
  transmissionId: string;
  eventType: string;
  resourceId?: string;
  payload?: string;
}): Promise<void> {
  const db = await getDB();
  await db
    .prepare(
      "INSERT OR IGNORE INTO webhook_logs (transmission_id, event_type, resource_id, payload) VALUES (?, ?, ?, ?)"
    )
    .bind(params.transmissionId, params.eventType, params.resourceId ?? null, params.payload ?? null)
    .run();
}

// 通过 PayPal Order ID 查找订单
export async function findOrderByPayPalId(paypalOrderId: string): Promise<{ userId: string; planId: string; type: string } | null> {
  const db = await getDB();
  const order = await db
    .prepare("SELECT user_id, plan_id, type FROM orders WHERE paypal_order_id = ?")
    .bind(paypalOrderId)
    .first<{ user_id: string; plan_id: string; type: string }>();
  if (!order) return null;
  return {
    userId: order.user_id,
    planId: order.plan_id,
    type: order.type,
  };
}

// 取消用户订阅（降级为免费）
export async function cancelUserSubscription(userId: string): Promise<void> {
  const db = await getDB();
  await db
    .prepare(
      "UPDATE user_credits SET current_plan = 'free', total_credits = 2, plan_expires_at = NULL, updated_at = datetime('now') WHERE user_id = ?"
    )
    .bind(userId)
    .run();
}

// 检查今日使用是否超过每日限制
export async function checkDailyLimit(userId: string): Promise<boolean> {
  const db = await getDB();
  const plan = await getPlanById((await getUserCredits(userId)).current_plan);
  if (!plan || !plan.daily_limit || plan.daily_limit <= 0) return true;

  const todayUsage = await db
    .prepare(
      `SELECT COUNT(*) as count FROM usage_logs 
       WHERE user_id = ? AND action = 'remove_background' 
       AND date(created_at) = date('now')`
    )
    .bind(userId)
    .first<{ count: number }>();

  return (todayUsage?.count ?? 0) < plan.daily_limit;
}
