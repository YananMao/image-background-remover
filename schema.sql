-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  google_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  last_login_at TEXT
);

-- 使用记录表
CREATE TABLE IF NOT EXISTS usage_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 套餐定义表
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price TEXT,
  currency TEXT DEFAULT 'USD',
  monthly_credits INTEGER NOT NULL DEFAULT 0,
  daily_limit INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);

-- 订单表
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  paypal_order_id TEXT,
  amount TEXT,
  currency TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'PENDING',
  type TEXT DEFAULT 'subscription',
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (plan_id) REFERENCES plans(id)
);

-- 用户额度表（合并订阅 + 一次性购买）
CREATE TABLE IF NOT EXISTS user_credits (
  user_id TEXT PRIMARY KEY,
  total_credits INTEGER DEFAULT 0,
  used_credits INTEGER DEFAULT 0,
  current_plan TEXT DEFAULT 'free',
  plan_expires_at TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 初始化套餐数据
INSERT OR IGNORE INTO plans (id, name, price, currency, monthly_credits, daily_limit, sort_order) VALUES
  ('free', 'Free', NULL, 'USD', 2, 1, 1),
  ('basic', 'Basic', '4.99', 'USD', 50, 10, 2),
  ('pro', 'Pro', '9.99', 'USD', 200, 50, 3),
  ('enterprise', 'Enterprise', '29.99', 'USD', 1000, 200, 4),
  ('onetime', 'Pay As You Go', '2.99', 'USD', 20, 0, 5);

-- Webhook 通知日志表（幂等性保障）
CREATE TABLE IF NOT EXISTS webhook_logs (
  transmission_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  resource_id TEXT,
  payload TEXT,
  processed_at TEXT DEFAULT (datetime('now'))
);

-- 索引优化查询
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_paypal_order_id ON orders(paypal_order_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_event_type ON webhook_logs(event_type);
