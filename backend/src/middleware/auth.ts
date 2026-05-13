import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { dbGet } from '../db'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

// S1: JWT_SECRET 启动校验 — 防止生产环境使用硬编码默认密钥
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'your-secret-key-change-in-production') {
  const msg = '⚠️  [安全] JWT_SECRET 未设置或使用默认值！攻击者可伪造任意用户身份。请在环境变量中设置强密钥。'
  if (process.env.NODE_ENV === 'production') {
    console.error(msg)
    process.exit(1)
  } else {
    console.warn(msg + '（开发模式下允许继续）')
  }
}

export interface AuthRequest extends Request {
  user?: {
    userId: string
    email: string
    role: 'user' | 'admin' | 'operator' | 'manager' | 'viewer'
  }
}

// 认证中间件
export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    // 优先 Cookie（浏览器安全），回退 Bearer Header（API/移动端兼容）
    const token = (req as any).cookies?.token || req.headers.authorization?.replace('Bearer ', '')
    
    if (!token) {
      return res.status(401).json({ error: '未登录' })
    }

    // 验证token
    const decoded = jwt.verify(token, JWT_SECRET) as any

    // 检查会话是否有效
    dbGet('SELECT * FROM user_sessions WHERE token = ? AND expiresAt > ?', [
      token,
      new Date().toISOString(),
    ]).then((session) => {
      if (!session) {
        return res.status(401).json({ error: '会话已过期' })
      }

      req.user = {
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
      }
      next()
    }).catch((error) => {
      console.error('认证失败:', error)
      res.status(401).json({ error: '认证失败' })
    })
  } catch (error) {
    console.error('token验证失败:', error)
    res.status(401).json({ error: 'token无效' })
  }
}

// 权限检查中间件
export function requireRole(...roles: ('user' | 'admin' | 'operator' | 'manager' | 'viewer')[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: '未登录' })
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: '权限不足' })
    }

    next()
  }
}

// 管理员/经理权限检查（与《角色与权限矩阵》一致：管理 = admin + manager）
export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  return requireRole('admin', 'manager')(req, res, next)
}
