import { Request, Response, NextFunction } from 'express'

interface RateLimitStore {
  [key: string]: {
    count: number
    resetTime: number
  }
}

const store: RateLimitStore = {}

export function rateLimitMiddleware(
  maxRequests: number = 100,
  windowMs: number = 15 * 60 * 1000 // 15分钟
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown'
    const now = Date.now()
    const record = store[key]

    if (!record || now > record.resetTime) {
      // 创建新记录
      store[key] = {
        count: 1,
        resetTime: now + windowMs,
      }
      return next()
    }

    if (record.count >= maxRequests) {
      return res.status(429).json({
        error: '请求过于频繁，请稍后再试',
        retryAfter: Math.ceil((record.resetTime - now) / 1000),
      })
    }

    record.count++
    next()
  }
}
