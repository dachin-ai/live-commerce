/**
 * 内置翻译工具：使用 Google Translate 非官方接口，无需 API key，不依赖 LLM。
 * 用于待办等多语言展示，避免生成时写多语言浪费 API。
 * 带内存缓存以减少请求。
 *
 * google-translate-api-x v10 默认 forceBatch:true，数组走 batchexecute，易触发
 * 「Partial Translation Request Fail」导致整批失败。策略：批量时 rejectOnPartialFail:false，
 * 缺译条目再改用单条接口（forceBatch:false）；整批异常则顺序单条重试。
 */

import translate from 'google-translate-api-x'

function toGoogleLang(locale: string): string {
  const n = (locale || '').trim().toLowerCase()
  if (n.startsWith('zh')) return 'zh-CN'
  if (n.startsWith('en')) return 'en'
  if (n.startsWith('th')) return 'th'
  if (n.startsWith('id')) return 'id'
  return 'en'
}

function translateTld(): string {
  const raw = (process.env.GOOGLE_TRANSLATE_TLD || 'com').trim().replace(/^\./, '')
  return raw || 'com'
}

type TranslateOptions = NonNullable<Parameters<typeof translate>[1]>

function baseTranslateOptions(source: string, target: string, extra?: Partial<TranslateOptions>): TranslateOptions {
  return {
    from: source,
    to: target,
    tld: translateTld(),
    ...extra,
  } as TranslateOptions
}

const MAX_CACHE = 500
const cache = new Map<string, string>()

function cacheKey(text: string, targetLang: string, sourceLang: string): string {
  return `${sourceLang}|${targetLang}|${text.slice(0, 300)}`
}

function evictCacheIfNeeded(): void {
  if (cache.size >= MAX_CACHE) {
    const first = cache.keys().next().value
    if (first) cache.delete(first)
  }
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

/** 翻译服务不可用（网络/被墙/被拦截等） */
export class TranslateServiceUnavailableError extends Error {
  code = 'TRANSLATE_UNAVAILABLE'
  constructor(message: string) {
    super(message)
    this.name = 'TranslateServiceUnavailableError'
  }
}

function isQuotaMessage(msg: string): boolean {
  return /limit|quota|429|too many|rate|forbidden|403/i.test(msg)
}
function isNetworkMessage(msg: string): boolean {
  return /fetch failed|enotfound|econnrefused|eai_again|etimedout|network|socket|tls|cert/i.test(msg)
}

/**
 * 单条翻译（translate_a/single），比 batchexecute 更稳，适合降级与短文本。
 */
async function translateViaSingleEndpoint(
  text: string,
  targetLang: string,
  sourceLang: string,
  useCache: boolean
): Promise<string> {
  const target = toGoogleLang(targetLang)
  const source = toGoogleLang(sourceLang)
  if (!text || source === target) return text

  const key = cacheKey(text, targetLang, sourceLang)
  if (useCache) {
    const hit = cache.get(key)
    if (hit !== undefined) return hit
  }

  const slice = text.slice(0, 500)
  try {
    const result = await translate(slice, baseTranslateOptions(source, target, { forceBatch: false }))
    const out = (typeof result?.text === 'string' && result.text.length > 0 ? result.text : slice) as string
    if (useCache) {
      evictCacheIfNeeded()
      cache.set(key, out)
    }
    return out
  } catch (e: unknown) {
    const errObj = e as { message?: string; cause?: unknown }
    const msg = String(errObj?.message ?? e)
    const causeMsg = errObj?.cause ? String((errObj.cause as any)?.message ?? errObj.cause) : ''
    console.error('[translateViaSingleEndpoint]', msg.slice(0, 220), causeMsg ? `cause=${causeMsg.slice(0, 220)}` : '')
    if (isQuotaMessage(msg)) throw new TranslateQuotaError()
    if (isNetworkMessage(msg) || isNetworkMessage(causeMsg)) {
      const tld = translateTld()
      throw new TranslateServiceUnavailableError(
        `翻译服务网络不可用（google translate 连接失败）。可尝试配置代理或调整 GOOGLE_TRANSLATE_TLD（当前=${tld}），然后重试。`
      )
    }
    throw e
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
  return translateViaSingleEndpoint(text, targetLang, sourceLang, true)
}

function extractBatchItemText(res: unknown, fallback: string): string | null {
  if (res == null) return null
  if (typeof res === 'object' && 'text' in res) {
    const t = (res as { text?: string }).text
    if (typeof t === 'string' && t.length > 0) return t
  }
  return null
}

/**
 * 批量翻译：优先一次 batchexecute；失败或单条 null 时降级为单条接口。
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
  const batchOpts = baseTranslateOptions(source, target, { rejectOnPartialFail: false })
  const maxAttempts = 2

  const fillFromBatchResponse = async (arr: unknown[]): Promise<boolean> => {
    let allOk = true
    for (let j = 0; j < toFetch.length; j++) {
      const { index } = toFetch[j]
      const piece = extractBatchItemText(arr[j], inputTexts[j])
      if (piece != null) {
        results[index] = piece
        const key = cacheKey(inputTexts[j], targetLang, sourceLang)
        evictCacheIfNeeded()
        cache.set(key, piece)
      } else {
        allOk = false
      }
    }
    if (!allOk) {
      for (let j = 0; j < toFetch.length; j++) {
        const { index } = toFetch[j]
        if (results[index] !== undefined && results[index] !== '') continue
        try {
          results[index] = await translateViaSingleEndpoint(inputTexts[j], targetLang, sourceLang, true)
        } catch {
          results[index] = inputTexts[j]
        }
        await new Promise((r) => setTimeout(r, 120))
      }
    }
    return allOk
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const translated = await translate(inputTexts, batchOpts)
      const arr = Array.isArray(translated) ? translated : [translated]
      await fillFromBatchResponse(arr)
      return results
    } catch (e: unknown) {
      const msg = String((e as { message?: string })?.message ?? e)
      console.error('[translateBatch] attempt', attempt, msg.slice(0, 300))
      if (isQuotaMessage(msg)) throw new TranslateQuotaError()
      if (isNetworkMessage(msg)) {
        const tld = translateTld()
        throw new TranslateServiceUnavailableError(
          `翻译服务网络不可用（google translate 连接失败）。可尝试配置代理或调整 GOOGLE_TRANSLATE_TLD（当前=${tld}），然后重试。`
        )
      }
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 1500))
        continue
      }
      for (const { index, text } of toFetch) {
        if (results[index] !== undefined && results[index] !== '') continue
        try {
          results[index] = await translateViaSingleEndpoint(text, targetLang, sourceLang, true)
        } catch {
          results[index] = text
        }
        await new Promise((r) => setTimeout(r, 200))
      }
      return results
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
  const BATCH_SIZE = 5
  const out: string[] = []
  for (let i = 0; i < segments.length; i += BATCH_SIZE) {
    if (i > 0) await new Promise((r) => setTimeout(r, 550))
    const chunk = segments.slice(i, i + BATCH_SIZE)
    const suffixChunk = suffixes.slice(i, i + BATCH_SIZE)
    const translatedChunk = await translateBatch(chunk, targetLang, sourceLang)
    for (let j = 0; j < translatedChunk.length; j++) {
      out.push(translatedChunk[j] + (suffixChunk[j] ?? ''))
    }
  }
  return out.join('')
}
