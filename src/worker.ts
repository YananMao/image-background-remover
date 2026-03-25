import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { SignJWT, jwtVerify } from 'jose'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'

type Bindings = {
  REMOVEBG_API_KEY: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  JWT_SECRET: string
  DB: D1Database
}

type User = {
  id: string
  google_id: string
  email: string
  name: string | null
  avatar_url: string | null
  created_at: string
  last_login_at: string | null
}

type UsageInfo = {
  today: number
  todayLimit: number
  month: number
  monthLimit: number
}

const app = new Hono<{ Bindings: Bindings }>()

// 允许的前端域名
const ALLOWED_ORIGINS = [
  'https://removebg.maomao.blog',
  'http://localhost:3000'
]

// CORS 配置
app.use('/*', async (c, next) => {
  const origin = c.req.header('Origin') || ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  
  await cors({
    origin: allowedOrigin,
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'Cookie'],
    credentials: true,
  })(c, next)
})

// 生成随机 state（防 CSRF）
function generateState(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}

// 生成 JWT Token
async function generateJWT(userId: string, secret: string): Promise<string> {
  const secretKey = new TextEncoder().encode(secret)
  return await new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d') // 7天过期
    .sign(secretKey)
}

// 验证 JWT Token
async function verifyJWT(token: string, secret: string): Promise<{ userId: string } | null> {
  try {
    const secretKey = new TextEncoder().encode(secret)
    const { payload } = await jwtVerify(token, secretKey)
    return payload as { userId: string }
  } catch {
    return null
  }
}

// 从 Cookie 获取当前用户
async function getCurrentUser(c: any): Promise<User | null> {
  const token = getCookie(c, 'auth_token')
  if (!token) return null

  const payload = await verifyJWT(token, c.env.JWT_SECRET)
  if (!payload) return null

  const result = await c.env.DB.prepare(
    'SELECT * FROM users WHERE id = ?'
  ).bind(payload.userId).first<User>()

  return result
}

// 获取用户使用统计
async function getUsageStats(db: D1Database, userId: string): Promise<UsageInfo> {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  // 今日使用次数
  const todayResult = await db.prepare(
    'SELECT COUNT(*) as count FROM usage_logs WHERE user_id = ? AND created_at >= ?'
  ).bind(userId, todayStart).first<{ count: number }>()

  // 本月使用次数
  const monthResult = await db.prepare(
    'SELECT COUNT(*) as count FROM usage_logs WHERE user_id = ? AND created_at >= ?'
  ).bind(userId, monthStart).first<{ count: number }>()

  // 获取用户配额（如果有的话）
  const quotaResult = await db.prepare(
    'SELECT daily_limit, monthly_limit FROM quotas WHERE user_id = ?'
  ).bind(userId).first<{ daily_limit: number; monthly_limit: number }>()

  return {
    today: todayResult?.count || 0,
    todayLimit: quotaResult?.daily_limit || 10,
    month: monthResult?.count || 0,
    monthLimit: quotaResult?.monthly_limit || 100,
  }
}

// 健康检查
app.get('/api/health', (c) => {
  return c.json({ status: 'ok' })
})

// ========== OAuth 相关路由 ==========

// 启动 Google OAuth 登录
app.get('/api/auth/google', async (c) => {
  const state = generateState()
  
  // 将 state 存入 Cookie（用于回调验证）
  setCookie(c, 'oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    maxAge: 600, // 10分钟有效
  })

  const redirectUri = 'https://api.removebg.maomao.blog/api/auth/callback'
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', c.env.GOOGLE_CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', 'openid email profile')
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('access_type', 'offline')

  return c.redirect(authUrl.toString())
})

// Google OAuth 回调
app.get('/api/auth/callback', async (c) => {
  const code = c.req.query('code')
  const state = c.req.query('state')
  const storedState = getCookie(c, 'oauth_state')

  // 验证 state
  if (!state || state !== storedState) {
    return c.redirect('https://removebg.maomao.blog?error=invalid_state')
  }

  // 清除 state cookie
  deleteCookie(c, 'oauth_state')

  if (!code) {
    return c.redirect('https://removebg.maomao.blog?error=no_code')
  }

  try {
    const redirectUri = 'https://api.removebg.maomao.blog/api/auth/callback'
    
    // 用 code 换取 access_token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: c.env.GOOGLE_CLIENT_ID,
        client_secret: c.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    })

    if (!tokenResponse.ok) {
      console.error('Token exchange failed:', await tokenResponse.text())
      return c.redirect('https://removebg.maomao.blog?error=token_failed')
    }

    const tokenData = await tokenResponse.json() as { access_token: string }
    const accessToken = tokenData.access_token

    // 获取用户信息
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!userResponse.ok) {
      return c.redirect('https://removebg.maomao.blog?error=user_info_failed')
    }

    const userData = await userResponse.json() as {
      sub: string
      email: string
      name?: string
      picture?: string
    }

    // 检查用户是否已存在
    let user = await c.env.DB.prepare(
      'SELECT * FROM users WHERE google_id = ?'
    ).bind(userData.sub).first<User>()

    if (user) {
      // 更新最后登录时间
      await c.env.DB.prepare(
        'UPDATE users SET last_login_at = ? WHERE id = ?'
      ).bind(new Date().toISOString(), user.id).run()
    } else {
      // 创建新用户
      const userId = crypto.randomUUID()
      await c.env.DB.prepare(
        'INSERT INTO users (id, google_id, email, name, avatar_url, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        userId,
        userData.sub,
        userData.email,
        userData.name || null,
        userData.picture || null,
        new Date().toISOString(),
        new Date().toISOString()
      ).run()

      // 为新用户创建默认配额
      await c.env.DB.prepare(
        'INSERT INTO quotas (user_id, daily_limit, monthly_limit) VALUES (?, ?, ?)'
      ).bind(userId, 10, 100).run()

      user = {
        id: userId,
        google_id: userData.sub,
        email: userData.email,
        name: userData.name || null,
        avatar_url: userData.picture || null,
        created_at: new Date().toISOString(),
        last_login_at: new Date().toISOString(),
      }
    }

    // 生成 JWT token
    const jwtToken = await generateJWT(user.id, c.env.JWT_SECRET)

    // 设置 Cookie
    setCookie(c, 'auth_token', jwtToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      maxAge: 7 * 24 * 60 * 60, // 7天
      path: '/',
    })

    return c.redirect('https://removebg.maomao.blog?login=success')
  } catch (error) {
    console.error('OAuth callback error:', error)
    return c.redirect('https://removebg.maomao.blog?error=unknown')
  }
})

// 获取当前用户信息
app.get('/api/auth/me', async (c) => {
  const user = await getCurrentUser(c)
  
  if (!user) {
    return c.json({ user: null, usage: null })
  }

  const usage = await getUsageStats(c.env.DB, user.id)

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatar_url,
    },
    usage: {
      today: usage.today,
      todayLimit: usage.todayLimit,
      month: usage.month,
      monthLimit: usage.monthLimit,
    },
  })
})

// 登出
app.post('/api/auth/logout', async (c) => {
  deleteCookie(c, 'auth_token')
  return c.json({ success: true })
})

// ========== 去除背景 API ==========

app.post('/api/remove-background', async (c) => {
  // 验证登录状态
  const user = await getCurrentUser(c)
  
  if (!user) {
    return c.json({ error: '请先登录', needLogin: true }, 401)
  }

  // 检查配额
  const usage = await getUsageStats(c.env.DB, user.id)
  
  if (usage.today >= usage.todayLimit) {
    return c.json({ error: '今日使用次数已达上限，请明天再试', quotaExceeded: true }, 429)
  }
  
  if (usage.month >= usage.monthLimit) {
    return c.json({ error: '本月使用次数已达上限', quotaExceeded: true }, 429)
  }

  try {
    const apiKey = c.env.REMOVEBG_API_KEY
    
    if (!apiKey) {
      return c.json({ error: '服务配置错误：缺少 API Key' }, 500)
    }

    const formData = await c.req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return c.json({ error: '请上传图片文件' }, 400)
    }

    // 验证文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      return c.json({ error: '仅支持 JPG、PNG、WebP 格式' }, 400)
    }

    // 验证文件大小 (10MB)
    if (file.size > 10 * 1024 * 1024) {
      return c.json({ error: '文件大小不能超过 10MB' }, 400)
    }

    // 调用 remove.bg API
    const removeBgFormData = new FormData()
    removeBgFormData.append('image_file', file)
    removeBgFormData.append('size', 'auto')

    const response = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
      },
      body: removeBgFormData,
    })

    if (!response.ok) {
      const errorText = await response.text()
      let errorMessage = '处理失败'
      
      if (response.status === 402) {
        errorMessage = 'API 配额已用完，请稍后再试'
      } else if (response.status === 403) {
        errorMessage = 'API Key 无效'
      } else if (response.status === 429) {
        errorMessage = '请求过于频繁，请稍后再试'
      } else if (response.status === 400) {
        errorMessage = '图片格式不支持或图片损坏'
      }

      console.error('remove.bg API error:', response.status, errorText)
      return c.json({ error: errorMessage }, response.status as 400 | 402 | 429 | 500)
    }

    // 记录使用日志
    await c.env.DB.prepare(
      'INSERT INTO usage_logs (user_id, action, created_at) VALUES (?, ?, ?)'
    ).bind(user.id, 'remove_background', new Date().toISOString()).run()

    // 返回处理后的图片
    const imageBuffer = await response.arrayBuffer()
    
    return new Response(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': 'attachment; filename=processed.png',
      },
    })

  } catch (error) {
    console.error('Remove background error:', error)
    return c.json({ error: '服务器错误，请稍后再试' }, 500)
  }
})

export default app
