import { Request, Response, NextFunction } from 'express'

interface CacheEntry {
  data: any
  timestamp: number
  ttl: number
}

const cache = new Map<string, CacheEntry>()

const DEFAULT_TTL = 5 * 60 * 1000 // 5分钟

export function cacheMiddleware(ttl: number = DEFAULT_TTL) {
  return (req: Request, res: Response, next: NextFunction) => {
    // 只缓存GET请求
    if (req.method !== 'GET') {
      return next()
    }

    const key = req.originalUrl || req.url
    const cached = cache.get(key)

    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      // 设置缓存头
      res.setHeader('X-Cache', 'HIT')
      return res.json(cached.data)
    }

    // 保存原始json方法
    const originalJson = res.json.bind(res)

    // 重写json方法以缓存响应
    res.json = function (body: any) {
      cache.set(key, {
        data: body,
        timestamp: Date.now(),
        ttl,
      })
      res.setHeader('X-Cache', 'MISS')
      return originalJson(body)
    }

    next()
  }
}

// 清除缓存
export function clearCache(pattern?: string) {
  if (!pattern) {
    cache.clear()
    return
  }

  for (const key of cache.keys()) {
    if (key.includes(pattern)) {
      cache.delete(key)
    }
  }
}
