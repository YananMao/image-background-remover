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

-- 配额限制表
CREATE TABLE IF NOT EXISTS quotas (
  user_id TEXT PRIMARY KEY,
  daily_limit INTEGER DEFAULT 10,
  monthly_limit INTEGER DEFAULT 100,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 索引优化查询
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
