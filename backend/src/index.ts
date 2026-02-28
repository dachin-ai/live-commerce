import './loadEnv' // 必须最先执行，否则 auth/email 等读不到 .env

import express from 'express'
import cors from 'cors'
import path from 'path'
import statsRoutes from './routes/stats'
import tasksRoutes from './routes/tasks'
import storesRoutes from './routes/stores'
import aiRoutes from './routes/ai-refactored'
import materialsRoutes from './routes/materials'
import usersRoutes from './routes/users'
import categoriesRoutes from './routes/categories'
import regionsRoutes from './routes/regions'
import authRoutes from './routes/auth'
import preferencesRoutes from './routes/preferences'
import versionLogsRoutes from './routes/version-logs'
import workflowRoutes from './routes/workflow'
import dataImportRoutes from './routes/dataImport'
import configRoutes from './routes/config'
import translateRoutes from './routes/translate'
import feedbackRoutes from './routes/feedback'
import messagesRoutes from './routes/messages'
import videosRoutes from './routes/videos'
import { initDatabase } from './db'
import { loadScriptLLMConfigCache } from './services/scriptLLMConfig'
import { rateLimitMiddleware } from './middleware/rateLimit'
import compression from 'compression'

const app = express()
const PORT = process.env.PORT || 3000

// 中间件
app.use(cors())
app.use(compression()) // 启用Gzip压缩
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))
app.use(rateLimitMiddleware(500, 15 * 60 * 1000)) // 限流：15分钟内最多500个请求（开发/多接口页面需更高额度）

// 静态文件服务（用于上传的文件）
app.use('/uploads', express.static(path.join(__dirname, '../uploads')))

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// 路由
app.use('/api/auth', authRoutes)
app.use('/api/stats', statsRoutes)
app.use('/api/tasks', tasksRoutes)
app.use('/api/stores', storesRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/materials', materialsRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/categories', categoriesRoutes)
app.use('/api/regions', regionsRoutes)
app.use('/api/preferences', preferencesRoutes)
app.use('/api/version-logs', versionLogsRoutes)
app.use('/api/workflow', workflowRoutes)
app.use('/api/data-import', dataImportRoutes)
app.use('/api/config', configRoutes)
app.use('/api/translate', translateRoutes)
app.use('/api/feedback', feedbackRoutes)
app.use('/api/messages', messagesRoutes)
app.use('/api/videos', videosRoutes)

// 错误处理
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err)
  res.status(err?.status || 500).json({
    error: err?.message || 'Internal Server Error',
  })
})

// 生产环境必须设置 JWT_SECRET，且不能使用默认值
const DEFAULT_JWT_SECRET = 'your-secret-key-change-in-production'
if (process.env.NODE_ENV === 'production') {
  const secret = process.env.JWT_SECRET
  if (!secret || secret === DEFAULT_JWT_SECRET) {
    console.error('❌ 生产环境必须在 backend/.env 中设置 JWT_SECRET，且不可使用默认值。')
    process.exit(1)
  }
}

// 启动服务器
async function startServer() {
  try {
    // 初始化数据库
    await initDatabase()
    // 加载话术 LLM 配置缓存（管理员在后台保存的配置）
    await loadScriptLLMConfigCache()

    app.listen(PORT, () => {
      console.log(`🚀 服务器运行在 http://localhost:${PORT}`)
      console.log(`✅ 后端服务已启动，按 Ctrl+C 停止`)
      if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        console.log(`📧 邮件服务已配置（忘记密码将发验证码至邮箱）`)
      } else {
        console.log(`📧 邮件服务未配置（忘记密码不会发邮件，开发环境会返回验证码）`)
      }
    }).on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ 错误: 端口 ${PORT} 已被占用`)
        console.error(`   请关闭占用端口的程序或修改 PORT 环境变量`)
      } else {
        console.error(`❌ 启动服务器失败:`, err)
      }
      process.exit(1)
    })
  } catch (error) {
    console.error('启动服务器失败:', error)
    process.exit(1)
  }
}

startServer()
