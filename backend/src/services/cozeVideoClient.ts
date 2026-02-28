/**
 * Coze 视频分析 API 客户端
 * 支持 coze.site 发布站点与 api.coze.com Open API 两种格式
 */

import crypto from 'crypto'

const COZE_VIDEO_PROJECT_ID = Number(process.env.COZE_VIDEO_PROJECT_ID || process.env.COZE_PROJECT_ID) || 7596987147106893834
const COZE_VIDEO_BOT_ID = process.env.COZE_VIDEO_BOT_ID || ''
const COZE_VIDEO_TIMEOUT_MS = Number(process.env.VIDEO_ANALYSIS_TIMEOUT_MS) || 120000

/** 是否为 Coze 接口（coze.site 发布站点 或 api.coze.com Open API） */
export function isCozeVideoUrl(url: string): boolean {
  const u = (url || '').trim()
  return u.includes('coze.site') || u.includes('api.coze.com')
}

/** 确保 URL 包含 stream_run（coze.site 需 /stream_run；api.coze.com 为 /open_api/v2/stream_run） */
export function ensureCozeStreamRunUrl(url: string): string {
  const u = url.replace(/\/$/, '')
  if (u.includes('api.coze.com')) {
    if (u.includes('/stream_run')) return u
    return u.replace(/\/open_api\/v2\/?$/, '') + '/open_api/v2/stream_run'
  }
  if (!u.includes('stream_run')) return u + '/stream_run'
  return u
}

/** 构建 coze.site 发布站点 legacy 请求体 */
function buildCozeSiteBody(message: string): Record<string, unknown> {
  return {
    content: {
      query: {
        prompt: [{ type: 'text', content: { text: message } }],
      },
    },
    type: 'query',
    session_id: crypto.randomUUID(),
    project_id: COZE_VIDEO_PROJECT_ID,
  }
}

/** 构建 api.coze.com Open API 请求体（需配置 COZE_VIDEO_BOT_ID） */
function buildCozeOpenApiBody(message: string, userId: string): Record<string, unknown> {
  const botId = COZE_VIDEO_BOT_ID.trim()
  if (!botId) {
    throw new Error('使用 api.coze.com 时需配置环境变量 COZE_VIDEO_BOT_ID')
  }
  return {
    bot_id: botId,
    user_id: userId,
    additional_messages: [
      {
        role: 'user',
        content: message,
        content_type: 'text',
      },
    ],
    stream: true,
  }
}

/** 从 Coze SSE payload 提取文本内容（兼容 conversation.message.delta / message.completed 等） */
function extractCozeContent(data: Record<string, unknown>): string | undefined {
  if (data.event === 'conversation.message.delta' || data.event === 'conversation.message.completed') {
    const inner = data.data as Record<string, unknown> | undefined
    const delta = inner?.delta as Record<string, unknown> | undefined
    const c = (delta?.content ?? inner?.content ?? data.content) as string | undefined
    if (typeof c === 'string' && c) return c
  }
  if (data.type === 'answer') {
    const c = (data.answer ?? (data.content as Record<string, unknown>)?.answer) as string | undefined
    if (typeof c === 'string' && c) return c
  }
  if (data.event === 'message.delta' || data.event === 'message.chunk') {
    const c = (data.content ?? data.delta ?? data.answer) as string | undefined
    if (typeof c === 'string' && c) return c
  }
  const c = (data.content ?? data.text ?? data.delta ?? data.answer) as string | undefined
  if (typeof c === 'string' && c) return c
  const inner = data.data as Record<string, unknown> | undefined
  if (inner && typeof inner === 'object') {
    const ic = (inner.content ?? inner.delta ?? inner.answer) as string | undefined
    if (typeof ic === 'string' && ic) return ic
  }
  return undefined
}

/**
 * 调用 Coze 视频分析 API，聚合流式响应为完整文本
 */
export async function callCozeVideoAPI(
  url: string,
  apiKey: string,
  message: string
): Promise<string> {
  const cozeUrl = ensureCozeStreamRunUrl(url)
  const isOpenApi = url.includes('api.coze.com')
  const userId = `video_${crypto.randomUUID()}`
  const body = isOpenApi ? buildCozeOpenApiBody(message, userId) : buildCozeSiteBody(message)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), COZE_VIDEO_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(cozeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(apiKey?.trim() ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  })
  } catch (e) {
    clearTimeout(timeoutId)
    if ((e as Error).name === 'AbortError') {
      throw new Error('视频分析超时，请稍后重试')
    }
    throw e
  }
  clearTimeout(timeoutId)

  if (!res.ok) {
    const text = (await res.text()).slice(0, 500)
    throw new Error(`Coze 视频分析请求失败: ${res.status} ${text}`)
  }

  if (!res.body) {
    throw new Error('Coze 响应无 body')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const chunks: string[] = []

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value?.length) {
        buffer += decoder.decode(value, { stream: true })
      }
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() || ''
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line || line === 'data: [DONE]') continue
        let payload = ''
        if (line.startsWith('data: ')) {
          payload = line.slice(6).trim()
        } else if (line === 'data:' && lines[i + 1]) {
          payload = lines[i + 1].trim()
          i += 1
        } else if (line.startsWith('{')) {
          payload = line
        }
        if (!payload) continue
        try {
          const data = JSON.parse(payload) as Record<string, unknown>
          const content = extractCozeContent(data)
          if (content) chunks.push(content)
        } catch {
          // 尝试简单提取
          const m = payload.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)"/)
          if (m?.[1]) {
            chunks.push(m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'))
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  const full = chunks.join('')
  if (!full.trim()) {
    throw new Error('Coze 视频分析返回内容为空，请检查 Bot 配置与 API Key')
  }
  return full
}
