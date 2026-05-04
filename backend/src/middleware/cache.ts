import { Request, Response, NextFunction } from 'express'

/**
 * LRU 有界缓存实现
 * - MAX_SIZE: 最大缓存条目数，防止内存无限膨胀
 * - 当达到上限时淘汰最久未访问的条目（LRU 语义）
 * - 使用 Map 保留插入顺序，get 时删除并重新插入实现 LRU
 */
const MAX_SIZE = 500
const DEFAULT_TTL = 5 * 60 * 1000 // 5分钟

interface CacheEntry {
  data: any
  expiresAt: number // 绝对过期时间戳，避免每次都做加减法
}

class LruCache {
  private store = new Map<string, CacheEntry>()

  get(key: string): CacheEntry | undefined {
    const entry = this.store.get(key)
    if (!entry) return undefined
    // 已过期直接移除，返回 undefined
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return undefined
    }
    // LRU：移到末尾（Map 按插入顺序迭代）
    this.store.delete(key)
    this.store.set(key, entry)
    return entry
  }

  set(key: string, data: any, ttl: number): void {
    // 淘汰：若达容量上限，删除最旧条目（Map 首个 key）
    if (this.store.size >= MAX_SIZE) {
      const oldest = this.store.keys().next().value
      if (oldest !== undefined) this.store.delete(oldest)
    }
    this.store.set(key, { data, expiresAt: Date.now() + ttl })
  }

  delete(key: string): void {
    this.store.delete(key)
  }

  /** 按前缀批量删除（用于数据写入后的缓存失效） */
  invalidate(pattern: string): void {
    for (const key of this.store.keys()) {
      if (key.includes(pattern)) this.store.delete(key)
    }
  }

  clear(): void {
    this.store.clear()
  }

  get size(): number {
    return this.store.size
  }
}

const lruCache = new LruCache()

export function cacheMiddleware(ttl: number = DEFAULT_TTL) {
  return (req: Request, res: Response, next: NextFunction) => {
    // 只缓存 GET 请求
    if (req.method !== 'GET') return next()

    const key = req.originalUrl || req.url
    const cached = lruCache.get(key)

    if (cached) {
      res.setHeader('X-Cache', 'HIT')
      res.setHeader('X-Cache-Size', String(lruCache.size))
      return res.json(cached.data)
    }

    // 拦截 res.json 以缓存响应
    const originalJson = res.json.bind(res)
    res.json = function (body: any) {
      // 只缓存成功响应（2xx），避免缓存错误
      if (res.statusCode >= 200 && res.statusCode < 300) {
        lruCache.set(key, body, ttl)
      }
      res.setHeader('X-Cache', 'MISS')
      res.setHeader('X-Cache-Size', String(lruCache.size))
      return originalJson(body)
    }

    next()
  }
}

/** 清除全部或按 pattern 前缀清除缓存 */
export function clearCache(pattern?: string): void {
  if (!pattern) {
    lruCache.clear()
  } else {
    lruCache.invalidate(pattern)
  }
}

export { lruCache }
