# Image Background Remover

一个简洁的在线抠图工具，用户上传图片后一键去除背景，下载透明 PNG。

## 功能特性

- ✅ 拖拽/点击上传图片
- ✅ 支持 JPG/PNG/WebP 格式
- ✅ 最大 10MB 文件限制
- ✅ 调用 remove.bg API 去除背景
- ✅ 原图 vs 抠图效果对比预览
- ✅ 一键下载透明 PNG
- ✅ 响应式布局，支持移动端
- ✅ 友好的错误提示
- ✅ Loading 动画

## 技术栈

- **前端**: Next.js 16 + React 19 + Tailwind CSS 4（静态导出部署到 Cloudflare Pages）
- **后端**: Cloudflare Workers + Hono
- **第三方服务**: remove.bg API
- **部署**: Cloudflare Pages（前端）+ Cloudflare Workers（API）

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

**Worker 后端**：在项目根目录创建 `.dev.vars`，填入 remove.bg API Key：

```
REMOVEBG_API_KEY=你的API密钥
```

**前端**：复制 `.env.example` 为 `.env.local`，配置 Worker 地址：

```
NEXT_PUBLIC_API_URL=http://localhost:8787
```

> 获取 API Key: https://www.remove.bg/api

### 3. 启动开发服务器

需要同时运行前端和 Worker：

```bash
# 终端 1：启动 Worker API
npm run dev:worker

# 终端 2：启动前端
npm run dev
```

访问 http://localhost:3000

### 4. 构建生产版本

```bash
npm run build
```

## 部署

项目拆分为两个独立部署：

- **Cloudflare Workers** (`image-background-remover-api`)：后端 API
- **Cloudflare Pages** (`image-background-remover`)：前端静态页面

### 一键部署

```bash
npm run deploy
```

会依次执行 `deploy:worker` 和 `deploy:pages`。

### 分别部署

```bash
# 1. 部署 Worker API
npm run deploy:worker

# 2. 部署前端（需先设置 NEXT_PUBLIC_API_URL 为 Worker 的 URL）
npm run deploy:pages
```

### Cloudflare API Token 配置

在 Cloudflare Dashboard 创建 API Token，**推荐使用「Edit Cloudflare Workers」模板**，并确保添加以下权限：

| 权限类型 | 权限项 | 操作权限 |
|---------|--------|---------|
| Account | Workers Scripts | Edit |
| Account | Workers Routes | Edit（可选，用到域名路由时必填） |
| Account | User → User Details | Read |
| Account | User → Memberships | Read |
| Zone | Workers Routes | Edit（用到自定义域名时需要） |

> 💡 创建 Token 入口：Cloudflare Dashboard → My Profile → API Tokens → Create Token

### Cloudflare Pages 环境变量配置

前端部署到 Cloudflare Pages 后，需要在 Pages 项目设置中添加环境变量：

1. 进入 Cloudflare Dashboard → Workers & Pages → 选择你的 Pages 项目
2. Settings → Environment variables
3. 添加变量：

| 变量名 | 说明 |
|-------|------|
| `NEXT_PUBLIC_API_URL` | Worker 部署地址（如 `https://image-background-remover-api.xxx.workers.dev`） |
| `REMOVEBG_API_KEY` | remove.bg API 密钥 |

> ⚠️ 前端需要通过 `NEXT_PUBLIC_API_URL` 知道 Worker 的地址，确保 API 请求正确路由到后端服务。

### GitHub Actions 自动部署

推送到 `main` 分支或手动触发 workflow 会自动部署。

**配置 GitHub Secrets**：

进入 GitHub 仓库 → Settings → Secrets and variables → Actions，添加以下变量：

| Secret 名称 | 说明 |
|------------|------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token（见上方权限配置） |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账户 ID（在 Dashboard 右侧边栏可找到） |
| `REMOVEBG_API_KEY` | remove.bg API Key |
| `NEXT_PUBLIC_API_URL` | **必填** Worker 生产 URL（如 `https://image-background-remover-api.xxx.workers.dev`） |

> ⚠️ 未设置 `NEXT_PUBLIC_API_URL` 会导致 API 返回 405，因为前端会错误地请求 Pages 静态服务而非 Worker。

**验证部署**：部署完成后，打开浏览器 DevTools → Network，上传图片后确认请求地址指向 Worker 域名（非 Pages 域名）。

## 项目结构

```
├── src/
│   ├── app/
│   │   ├── page.tsx          # 主页面组件
│   │   ├── layout.tsx        # 布局组件
│   │   └── globals.css       # 全局样式
│   └── worker.ts             # Cloudflare Workers API 入口 (Hono)
├── public/                   # 静态资源
├── .dev.vars                 # Worker 本地环境变量（不提交）
├── .env.local                # 前端本地环境变量（不提交）
├── .env.example              # 环境变量示例
├── wrangler.toml             # Cloudflare Workers 配置
└── package.json
```

## API 接口

### POST /api/remove-background

**请求**

```
Content-Type: multipart/form-data

file: <image binary>
```

**成功响应**

```
Content-Type: image/png

<transparent png binary>
```

**错误响应**

```json
{
  "error": "错误信息"
}
```

## 费用说明

- **Cloudflare Pages**: 免费
- **Cloudflare Workers**: 免费额度 100,000 请求/天
- **remove.bg API**:
  - 免费版：50 次/月
  - 付费版：$0.20/张起

## License

MIT

更换邮箱为 yannanmao1996
