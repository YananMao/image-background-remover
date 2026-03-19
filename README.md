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

- **前端**: Next.js 16 + React 19 + Tailwind CSS 4
- **后端**: Next.js API Routes / Cloudflare Workers + Hono
- **第三方服务**: remove.bg API
- **部署**: Cloudflare Pages + Workers

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env.local`，并填入你的 remove.bg API Key：

```bash
cp .env.example .env.local
```

编辑 `.env.local`：

```
REMOVEBG_API_KEY=你的API密钥
```

> 获取 API Key: https://www.remove.bg/api

### 3. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000

### 4. 构建生产版本

```bash
npm run build
```

## 部署

### 部署到 Cloudflare Pages

1. 安装 Wrangler CLI 并登录：

```bash
npx wrangler login
```

2. 部署：

```bash
npm run deploy:pages
```

### 部署 Workers API（可选）

如果需要将 API 部署到 Cloudflare Workers：

1. 在 Cloudflare Dashboard 创建一个 Worker
2. 设置环境变量 `REMOVEBG_API_KEY`
3. 部署：

```bash
npm run deploy:worker
```

## 项目结构

```
├── src/
│   ├── app/
│   │   ├── page.tsx          # 主页面组件
│   │   ├── layout.tsx        # 布局组件
│   │   ├── globals.css       # 全局样式
│   │   └── api/
│   │       └── remove-background/
│   │           └── route.ts  # Next.js API 路由
│   └── worker.ts             # Cloudflare Workers 入口
├── public/                   # 静态资源
├── .env.local               # 本地环境变量（不提交）
├── .env.example             # 环境变量示例
├── wrangler.toml            # Cloudflare Workers 配置
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
