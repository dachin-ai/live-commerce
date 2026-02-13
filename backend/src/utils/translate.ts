/**
 * 内置翻译工具：使用 Google Translate 非官方接口，无需 API key，不依赖 LLM。
 * 用于待办等多语言展示，避免生成时写多语言浪费 API。
 * 带内存缓存以减少请求。
 */

import translate from 'google-translate-api-x'

function toGoogleLang(locale: string): string {
  const n = (locale || '').trim().toLowerCase()
  if (n.startsWith('zh')) return 'zh-CN'
  if (n.startsWith('en')) return 'en'
  if (n.startsWith('th')) return 'th'
  return 'en'
}

const MAX_CACHE = 500
const cache = new Map<string, string>()

function cacheKey(text: string, targetLang: string, sourceLang: string): string {
  return `${sourceLang}|${targetLang}|${text.slice(0, 300)}`
}

/** 额度不足时给用户看的硬编码提示（不依赖 i18n，直接展示） */
export const TRANSLATE_QUOTA_MESSAGE = '额度不足，请前往https://translate.google.com/'

/** 限额或网络错误时抛出，便于上层返回统一提示 */
export class TranslateQuotaError extends Error {
  code = 'QUOTA_EXCEEDED'
  constructor(message: string = TRANSLATE_QUOTA_MESSAGE) {
    super(message)
    this.name = 'TranslateQuotaError'
  }
}

/**
 * 将一段文本翻译为目标语言。
 * @param text 原文（建议单句或短段，API 有长度限制）
 * @param targetLang 目标语言，如 zh-CN、en-US、th-TH
 * @param sourceLang 源语言，默认 zh-CN
 */
export async function translateText(
  text: string,
  targetLang: string,
  sourceLang: string = 'zh-CN'
): Promise<string> {
  if (!text || typeof text !== 'string') return text
  const target = toGoogleLang(targetLang)
  const source = toGoogleLang(sourceLang)
  if (source === target) return text
  const key = cacheKey(text, targetLang, sourceLang)
  const cached = cache.get(key)
  if (cached !== undefined) return cached
  try {
    const result = await translate(text.slice(0, 500), { from: source, to: target, client: 'gtx' } as Parameters<typeof translate>[1])
    const translated = result.text ?? text
    if (cache.size >= MAX_CACHE) {
      const first = cache.keys().next().value
      if (first) cache.delete(first)
    }
    cache.set(key, translated)
    return translated
  } catch (e: any) {
    console.error('[translate]', e)
    const msg = String(e?.message || e)
    if (/limit|quota|429|too many|rate/i.test(msg)) throw new TranslateQuotaError()
    throw e
  }
}

/**
 * 批量翻译：一次请求翻译多条文本，显著减少总耗时（由 2×N 次请求变为 1 次）。
 * 会利用内存缓存，未命中部分合并为一次 batch 请求。
 */
export async function translateBatch(
  texts: string[],
  targetLang: string,
  sourceLang: string = 'zh-CN'
): Promise<string[]> {
  const target = toGoogleLang(targetLang)
  const source = toGoogleLang(sourceLang)
  if (source === target) return texts.map((t) => (typeof t === 'string' ? t : ''))

  const results: string[] = new Array(texts.length)
  const toFetch: { index: number; text: string }[] = []
  for (let i = 0; i < texts.length; i++) {
    const raw = texts[i]
    const t = typeof raw !== 'string' || !raw ? '' : String(raw).slice(0, 500)
    const key = cacheKey(t, targetLang, sourceLang)
    const cached = cache.get(key)
    if (cached !== undefined) {
      results[i] = cached
    } else {
      toFetch.push({ index: i, text: t })
    }
  }
  if (toFetch.length === 0) return results

  const inputTexts = toFetch.map((x) => x.text)
  const opts = { from: source, to: target, client: 'gtx' } as Parameters<typeof translate>[1]
  const maxAttempts = 2
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const translated = await translate(inputTexts, opts)
      const arr = Array.isArray(translated) ? translated : [translated]
      for (let j = 0; j < toFetch.length; j++) {
        const { index } = toFetch[j]
        const res = arr[j]
        const raw = res != null && typeof res === 'object' && 'text' in res ? (res as { text?: string }).text : undefined
        const value = typeof raw === 'string' ? raw : inputTexts[j]
        results[index] = value
        const key = cacheKey(inputTexts[j], targetLang, sourceLang)
        if (cache.size >= MAX_CACHE) {
          const first = cache.keys().next().value
          if (first) cache.delete(first)
        }
        cache.set(key, value)
      }
      return results
    } catch (e: any) {
      console.error('[translateBatch] attempt', attempt, e)
      const msg = String(e?.message || e)
      if (/limit|quota|429|too many|rate/i.test(msg)) throw new TranslateQuotaError()
      if (attempt === maxAttempts) throw e
      await new Promise((r) => setTimeout(r, 1500))
    }
  }
  return results
}

const SEGMENT_MAX = 450

/**
 * 将长文本按段落/行切分后批量翻译再拼接，用于话术等长内容。
 * @param content 原文（通常为中文话术）
 * @param targetLang 目标语言，如 en-US、th-TH
 * @param sourceLang 源语言，默认 zh-CN
 */
export async function translateLongText(
  content: string,
  targetLang: string,
  sourceLang: string = 'zh-CN'
): Promise<string> {
  if (!content || typeof content !== 'string') return content
  const target = toGoogleLang(targetLang)
  const source = toGoogleLang(sourceLang)
  if (source === target) return content

  const segments: string[] = []
  const suffixes: string[] = []
  const paragraphs = content.split(/\n\n+/)
  for (const p of paragraphs) {
    if (p.length <= SEGMENT_MAX) {
      segments.push(p)
      suffixes.push('\n\n')
    } else {
      const lines = p.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const isLastLine = i === lines.length - 1
        if (line.length <= SEGMENT_MAX) {
          segments.push(line)
          suffixes.push(isLastLine ? '\n\n' : '\n')
        } else {
          for (let j = 0; j < line.length; j += SEGMENT_MAX) {
            segments.push(line.slice(j, j + SEGMENT_MAX))
            const isLastChunk = j + SEGMENT_MAX >= line.length
            suffixes.push(isLastChunk ? (isLastLine ? '\n\n' : '\n') : '')
          }
        }
      }
    }
  }
  if (segments.length === 0) return content
  // 分批请求，适度加大批次、缩短间隔以缩短总耗时，兼顾限流
  const BATCH_SIZE = 10
  const out: string[] = []
  for (let i = 0; i < segments.length; i += BATCH_SIZE) {
    if (i > 0) await new Promise((r) => setTimeout(r, 400))
    const chunk = segments.slice(i, i + BATCH_SIZE)
    const suffixChunk = suffixes.slice(i, i + BATCH_SIZE)
    const translatedChunk = await translateBatch(chunk, targetLang, sourceLang)
    for (let j = 0; j < translatedChunk.length; j++) {
      out.push(translatedChunk[j] + (suffixChunk[j] ?? ''))
    }
  }
  return out.join('')
}
