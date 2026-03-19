import type { CloudflareConfig } from "@opennextjs/cloudflare";

const config: CloudflareConfig = {
  // 构建时不连接 Cloudflare API，用本地缓存
  offline: true,
};

export default config;
