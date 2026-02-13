/**
 * 话术生成 LLM 流式适配层（可选）
 * 配置来源：环境变量 或 管理员在后台保存的数据库配置（全体用户共享）。
 * 支持：Coze 智能体 stream_run、OpenAI 兼容 API、豆包/火山方舟等。
 * Coze 专项优化：超时/重试、统一错误处理、可观测性、提示词场景区分、流式体验。
 */

import crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'

import { getScriptLLMConfigSync, getLLMModesSync, type ScriptLLMConfig, type LLMModeValue } from './scriptLLMConfig'
import {
  registerScriptLLMProvider,
  getScriptLLMProvider,
  type ScriptLLMProviderConfig,
  type ScriptLLMProviderOptions,
  type IScriptLLMProvider,
} from './scriptLLMProvider'

const DEFAULT_MODEL = process.env.SCRIPT_LLM_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini'
const DEBUG_COZE = process.env.DEBUG_COZE_STREAM === '1'

/** Coze 流式请求超时（毫秒），默认 120s，保证完整销售流程话术（含逼单结尾）不被截断 */
const COZE_STREAM_TIMEOUT_MS = Number(process.env.COZE_STREAM_TIMEOUT_MS) || 120000
/** Coze 一次性调用超时（callLLMOnce），默认 25s */
const COZE_ONCE_TIMEOUT_MS = Number(process.env.LLM_ONCE_TIMEOUT_MS) || 25000
/** Coze 请求失败时最大重试次数（仅对初始 fetch，不含流式读取中段） */
const COZE_MAX_RETRIES = Math.min(Math.max(0, Number(process.env.COZE_MAX_RETRIES) || 2), 5)
/** 重试退避基数（毫秒），第 n 次重试等待 base * n */
const COZE_RETRY_DELAY_MS = Number(process.env.COZE_RETRY_DELAY_MS) || 1000

/** Coze 可观测性：请求数、成功、失败、超时、重试次数、最近一次耗时（内存统计，不持久化） */
const cozeStats = {
  requests: 0,
  success: 0,
  fail: 0,
  timeout: 0,
  retries: 0,
  lastRequestDurationMs: 0 as number,
}

function debugLog(msg: string, payload?: string): void {
  if (!DEBUG_COZE) return
  try {
    const logPath = path.join(__dirname, '..', '..', 'coze-stream-debug.log')
    const line = `[${new Date().toISOString()}] ${msg}${payload !== undefined ? '\n' + payload + '\n' : ''}\n`
    fs.appendFileSync(logPath, line)
  } catch {
    // ignore
  }
}

/** 诊断日志：始终写入 backend/coze-debug.log，便于排查返回空等问题 */
function cozeDiagnosticLog(phase: string, data: Record<string, unknown>): void {
  try {
    const logPath = path.join(__dirname, '..', '..', 'coze-debug.log')
    const line = `[${new Date().toISOString()}] [${phase}] ${JSON.stringify(data)}\n`
    fs.appendFileSync(logPath, line)
  } catch {
    // ignore
  }
}

/** 记录 Coze 单次请求结果与耗时（用于可观测性） */
function cozeRecord(result: 'success' | 'fail' | 'timeout', durationMs?: number): void {
  cozeStats.requests += 1
  if (result === 'success') cozeStats.success += 1
  else if (result === 'timeout') cozeStats.timeout += 1
  else cozeStats.fail += 1
  if (durationMs != null) cozeStats.lastRequestDurationMs = durationMs
  if (result !== 'success') {
    console.warn(
      `[scriptLLM] [Coze] 统计: requests=${cozeStats.requests} success=${cozeStats.success} fail=${cozeStats.fail} timeout=${cozeStats.timeout} retries=${cozeStats.retries} lastMs=${cozeStats.lastRequestDurationMs}`
    )
  }
}

/** 获取当前 Coze 统计（供运维或调试）；可定期 log 汇总 */
export function getCozeStats(): {
  requests: number
  success: number
  fail: number
  timeout: number
  retries: number
  lastRequestDurationMs: number
} {
  return { ...cozeStats }
}

export function isScriptLLMConfigured(): boolean {
  return Boolean(getScriptLLMConfigSync())
}

export interface ScriptLLMOptions {
  systemPrompt: string
  userMessage: string
  temperature?: number
  /** 限制生成长度，加快响应；OpenAI/豆包等为 max_tokens */
  maxTokens?: number
  /** Coze 场景：话术/待办已模块化，由 Coze 侧控制输出形态 */
  taskType?: 'script' | 'todo'
  /** 一次性调用超时（毫秒），仅 Coze 分支生效；不传则用 LLM_ONCE_TIMEOUT_MS，待办生成可传至 120000（2 分钟） */
  timeoutMs?: number
  /** 多套 AI 工具：调用时传入指定配置，不传则用 getScriptLLMConfigSync() */
  config?: ScriptLLMConfig | { url: string; apiKey: string; model?: string }
  /** 方案1：话术生成时仅发单条用户消息，不拼接长系统提示（由 Coze 侧在 answer 中直接输出话术，不依赖工具） */
  toolCallOnly?: boolean
}

/** 是否为 Coze 智能体 stream_run 接口（coze.site 发布站点） */
function isCozeStreamRun(url: string): boolean {
  return url.includes('coze.site') && url.includes('stream_run')
}

/** 当选择 Coze/Agent 方式时，若 URL 未含 stream_run 则自动追加（兼容 coze.site 与电商数据分析专家 Agent） */
function ensureCozeStreamRunUrl(url: string): string {
  const u = url.replace(/\/$/, '')
  if (!u.includes('stream_run')) return u + '/stream_run'
  return u
}

/** 话术生成时请求 Coze 的最大输出 token；部分 Coze 发布站点可能忽略此参数 */
const COZE_SCRIPT_MAX_TOKENS = Math.min(16000, Math.max(2048, Number(process.env.COZE_SCRIPT_MAX_TOKENS) || 8192))
/** Coze 发布站点（*.coze.site）常用旧版 body：content.query.prompt + project_id；设为 1 或 true 时使用旧格式，否则用 Agent 格式 content+session_id */
const COZE_LEGACY_BODY = process.env.COZE_LEGACY_BODY === '1' || process.env.COZE_LEGACY_BODY === 'true'
/** 电商数据分析专家 Agent 等统一 Agent 接口：始终使用 { content, session_id }，与《电商数据分析专家Agent-API使用指南》一致 */
const AGENT_API_BODY = process.env.AGENT_API_BODY === '1' || process.env.AGENT_API_BODY === 'true'
const COZE_DEFAULT_PROJECT_ID = 7596987147106893834

function buildCozeStreamRunBody(message: string, options?: { maxTokens?: number }, requestUrl?: string): Record<string, unknown> {
  // 电商数据分析专家 Agent 对接协议（Coze 对接协议 v1.0）：入参为 content.query.prompt[0].content.text，即 legacy 体
  // *.coze.site 默认用 legacy，仅显式 AGENT_API_BODY=1 时用 { content, session_id }（部分自建 Agent 需此格式）
  if (AGENT_API_BODY) {
    return { content: message, session_id: crypto.randomUUID() }
  }
  const useLegacy = COZE_LEGACY_BODY || (requestUrl && requestUrl.includes('coze.site'))
  if (useLegacy) {
    const projectId = process.env.COZE_PROJECT_ID
    const projectIdNum = projectId ? Number(projectId) : COZE_DEFAULT_PROJECT_ID
    const query: Record<string, unknown> = {
      prompt: [{ type: 'text', content: { text: message } }],
    }
    if (options?.maxTokens != null && options.maxTokens > 0) {
      query.parameters = { max_tokens: options.maxTokens }
    }
    return {
      content: { query },
      type: 'query',
      session_id: crypto.randomUUID(),
      project_id: projectIdNum || COZE_DEFAULT_PROJECT_ID,
    }
  }
  return { content: message, session_id: crypto.randomUUID() }
}

/** 根据 base URL 拼出 chat/completions 地址（兼容 OpenAI /v1 与火山方舟 /v3） */
function buildChatCompletionsUrl(base: string): string {
  const b = base.replace(/\/$/, '')
  if (b.includes('chat/completions')) return b
  if (b.includes('/v3') || b.includes('volces.com')) return b + '/chat/completions'
  return b + (b.includes('/v1') ? '' : '/v1') + '/chat/completions'
}

/** 判断是否为工具调用类事件（不当作正文输出）；与 Coze SSE 说明一致：tool_request / tool_response 不产出正文 */
function isCozeToolCallEvent(data: Record<string, unknown>): boolean {
  const type = data.type ?? (data.message && typeof data.message === 'object' ? (data.message as Record<string, unknown>).type : undefined)
  return type === 'function_call' || type === 'tool_call' || type === 'tool_request' || type === 'tool_response'
}

/** 从 Coze SSE 行 payload 中提取文本内容（兼容多种返回格式）；工具调用事件不返回内容。 */
function extractCozeContent(data: Record<string, unknown>): string | undefined {
  // 处理工具调用和响应：只取 answer 正文，不把 function_call/tool_call 当话术输出
  if (isCozeToolCallEvent(data)) return undefined
  const msg = data.message as Record<string, unknown> | undefined
  const msgType = msg && typeof msg === 'object' ? msg.type : undefined
  if (msgType === 'function_call' || msgType === 'tool_call') return undefined

  // type=answer：电商数据分析专家 Agent 等为顶层 answer；Coze 为 content.answer（《电商数据分析专家Agent-API使用指南》示例：data.answer）
  if (data.type === 'answer') {
    const topLevel = typeof data.answer === 'string' ? data.answer : undefined
    const contentObj = data.content && typeof data.content === 'object' ? (data.content as Record<string, unknown>) : undefined
    const c =
      topLevel ??
      (contentObj?.answer as string | undefined) ??
      (contentObj?.content && typeof contentObj.content === 'object' ? (contentObj.content as Record<string, unknown>).answer as string | undefined : undefined)
    if (typeof c === 'string' && c) return c
  }
  // conversation.message.delta / message.completed：流式逐块输出（待办与话术均为流式）
  if (data.event === 'conversation.message.delta' || data.event === 'conversation.message.completed') {
    const c = data.content
    if (typeof c === 'string' && c) return c
  }
  // 发布站点常见：message.delta / message.chunk 等流式事件
  if (data.event === 'message.delta' || data.event === 'message.chunk' || data.event === 'message.answer') {
    const c = data.content ?? data.delta ?? data.answer
    if (typeof c === 'string' && c) return c
  }
  // 官方/发布站点常见：event=message, message.content
  if (data.event === 'message' && msg && typeof msg === 'object') {
    const c = msg.content
    if (typeof c === 'string' && c) return c
  }
  // 兼容：直接 content / text / delta / answer
  const c = data.content ?? data.text ?? data.delta ?? data.answer
  if (typeof c === 'string' && c) return c
  // 兼容：data.data.content（部分站点）
  const inner = data.data as Record<string, unknown> | undefined
  if (inner && typeof inner === 'object') {
    const ic = inner.content ?? inner.text ?? inner.answer
    if (typeof ic === 'string' && ic) return ic
  }
  // 兼容：content 为对象时的 answer/content/text
  const contentObj = data.content as Record<string, unknown> | undefined
  if (contentObj && typeof contentObj === 'object') {
    const co = contentObj.answer ?? contentObj.content ?? contentObj.text
    if (typeof co === 'string' && co) return co
  }
  // message_end：部分 Coze 站点在结束时才带完整 content；兼容多种字段名
  if (data.type === 'message_end' && contentObj && typeof contentObj === 'object') {
    const endContent = (
      contentObj.answer ??
      contentObj.content ??
      contentObj.text ??
      contentObj.reply ??
      contentObj.output ??
      contentObj.result ??
      contentObj.message ??
      contentObj.body
    ) as string | undefined
    if (typeof endContent === 'string' && endContent) return endContent
  }
  // 兼容：delta 为对象时的 content/text
  const delta = data.delta as Record<string, unknown> | undefined
  if (delta && typeof delta === 'object') {
    const dc = delta.content ?? delta.text
    if (typeof dc === 'string' && dc) return dc
  }
  // 兜底：递归查找任意 content/text（仍排除含 function_call 的 message）
  if (msg && typeof msg === 'object' && (msg as Record<string, unknown>).type === 'answer') {
    const mc = (msg as Record<string, unknown>).content
    if (typeof mc === 'string' && mc) return mc
  }
  return extractAnyContent(data)
}

/** @deprecated tool 路径已废弃，本系统不再从 tool_response 产出正文。保留函数仅作兼容/诊断参考。 */
function extractScriptFromToolResponse(data: Record<string, unknown>): string | undefined {
  if (data.type !== 'tool_response') return undefined
  const tr = (data.content && typeof data.content === 'object' ? (data.content as Record<string, unknown>).tool_response : undefined) ?? data.tool_response
  if (tr === undefined) return undefined
  // content.tool_response 可能为字符串（直接工具输出）
  if (typeof tr === 'string' && tr.trim()) return tr.trim()
  if (typeof tr !== 'object' || tr === null) return undefined
  const raw = tr as Record<string, unknown>
  // 兼容多种字段：Coze 常见 result，部分 Agent 用 content / output / body
  const resultStr =
    (typeof raw.result === 'string' && raw.result)
    || (typeof raw.content === 'string' && raw.content)
    || (typeof raw.output === 'string' && raw.output)
    || (typeof raw.body === 'string' && raw.body)
    || (typeof raw.data === 'string' && raw.data)
    || undefined
  if (!resultStr) return undefined
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(resultStr) as Record<string, unknown>
  } catch {
    return resultStr
  }
  const dataObj = parsed.data as Record<string, unknown> | undefined
  const script = parsed.script ?? parsed.content ?? parsed.text ?? parsed.answer ?? (dataObj && typeof dataObj === 'object' ? (dataObj.content ?? dataObj.script ?? dataObj.text) : undefined)
  if (typeof script === 'string' && script) return script
  if (script && typeof script === 'object' && !Array.isArray(script)) {
    const inner = (script as Record<string, unknown>).content ?? (script as Record<string, unknown>).text
    if (typeof inner === 'string' && inner) return inner
  }
  // 待办生成：Coze 通过工具返回 {"tasks": [...]} 时，原样返回 JSON 供上游解析
  if (Array.isArray(parsed.tasks) && parsed.tasks.length > 0) return resultStr
  return undefined
}

/** 递归从对象中提取第一个 content/text/answer 字符串（兼容任意嵌套） */
function extractAnyContent(obj: unknown): string | undefined {
  if (obj === null || obj === undefined) return undefined
  if (typeof obj === 'string') return obj || undefined
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const c = extractAnyContent(item)
      if (c) return c
    }
    return undefined
  }
  if (typeof obj === 'object') {
    const o = obj as Record<string, unknown>
    for (const key of ['content', 'text', 'answer', 'delta']) {
      const v = o[key]
      if (typeof v === 'string' && v) return v
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const inner = extractAnyContent(v)
        if (inner) return inner
      }
    }
    for (const key of ['message', 'data']) {
      const inner = extractAnyContent(o[key])
      if (inner) return inner
    }
  }
  return undefined
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Coze 流式输出：使用 POST /stream_run 接口，解析 SSE 格式数据，实时 yield 正文，并处理工具调用与响应。
 * - 使用 POST /stream_run：ensureCozeStreamRunUrl 保证 URL 带 /stream_run，body 为 buildCozeStreamRunBody(message)。
 * - 解析 SSE：按行读取，识别 data: 开头的行，JSON.parse 后由 extractCozeContent 提取可展示文本。
 * - 话术/待办均为流式输出：话术流式推前端；待办由 callLLMOnce 聚合全部 chunk 后一次性解析 JSON。
 * - 工具调用和响应：function_call/tool_call/tool_response 事件不产出正文，仅 type=answer / message.delta 等的内容参与输出。
 * skipStats：由 callLLMOnce 收集时设为 true，由调用方统一记录统计，避免超时后后台流再记 success。
 */
async function* streamCozeAgent(
  url: string,
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  taskType: 'script' | 'todo' = 'script',
  skipStats = false,
  toolCallOnly = false,
  /** 流式读取超时（毫秒）；不传则用 COZE_STREAM_TIMEOUT_MS。待办且 Bot 走 tool_request→tool_response 时需更长时间 */
  streamTimeoutMs?: number
): AsyncGenerator<string, void, unknown> {
  const requestStartMs = Date.now()
  const isScript = taskType === 'script'
  // 话术/待办已由 Coze 模块化，不再注入输出约束（禁止输出分析报告等），由 Coze 侧逻辑控制
  const message =
    isScript && toolCallOnly
      ? userMessage
      : isScript
        ? systemPrompt
          ? `【系统指令】\n${systemPrompt}\n\n【用户请求】\n${userMessage}`
          : userMessage
        : systemPrompt
          ? `${systemPrompt}\n\n【用户请求】\n${userMessage}`
          : userMessage

  const bodyKind = AGENT_API_BODY ? 'agent' : (COZE_LEGACY_BODY || url.includes('coze.site') ? 'legacy' : 'agent')
  cozeDiagnosticLog('request', { messageLen: message.length, url: url.replace(/\/stream_run.*$/, '/stream_run'), taskType, bodyKind, hasAuth: !!(apiKey && String(apiKey).trim()) })

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  }
  if (apiKey && String(apiKey).trim()) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  let res: Response | null = null
  let lastErr: unknown
  const bodyOptions = isScript ? { maxTokens: COZE_SCRIPT_MAX_TOKENS } : undefined
  for (let attempt = 0; attempt <= COZE_MAX_RETRIES; attempt++) {
    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(buildCozeStreamRunBody(message, bodyOptions, url)),
      })
      debugLog(`Coze response status=${res.status} url=${url} attempt=${attempt + 1}`)
      if (res.ok) break
      const text = await res.text().catch(() => '')
      cozeDiagnosticLog('response_error', { status: res.status, bodyPreview: text.slice(0, 500) })
      debugLog('Coze non-ok body (first 500)', text.slice(0, 500))
      if (res.status >= 500 && attempt < COZE_MAX_RETRIES) {
        cozeStats.retries += 1
        await sleep(COZE_RETRY_DELAY_MS * (attempt + 1))
        continue
      }
      console.warn(`[scriptLLM] [Coze] 请求失败 status=${res.status} url=${url}`)
      if (!skipStats) cozeRecord('fail', Date.now() - requestStartMs)
      return
    } catch (e) {
      lastErr = e
      cozeDiagnosticLog('fetch_error', { error: (e as Error)?.message ?? String(e) })
      if (attempt < COZE_MAX_RETRIES) {
        cozeStats.retries += 1
        await sleep(COZE_RETRY_DELAY_MS * (attempt + 1))
        continue
      }
      console.warn('[scriptLLM] [Coze] 请求异常', (e as Error)?.message || e)
      if (!skipStats) cozeRecord('fail', Date.now() - requestStartMs)
      return
    }
  }

  if (!res?.ok || !res.body) {
    cozeDiagnosticLog('response_skip', { ok: res?.ok ?? false, hasBody: Boolean(res?.body) })
    if (!res && !skipStats) cozeRecord('fail', Date.now() - requestStartMs)
    return
  }

  const streamStartMs = Date.now()
  const responseStatus = res.status
  const responseContentType = res.headers.get('content-type') ?? ''
  const streamAbort = new AbortController()
  const effectiveStreamTimeout = streamTimeoutMs ?? COZE_STREAM_TIMEOUT_MS
  const timeoutId = setTimeout(() => streamAbort.abort(), effectiveStreamTimeout)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let dataLineCount = 0
  const maxDebugLines = 5
  let yieldedChunks = 0
  let yieldedLen = 0
  /** 0 yield 时用于诊断：记录收到的前几条 payload 的 type 与预览 */
  const emptyDiagnosticPayloads: Array<{ type: string; preview: string }> = []
  /** 无 data 行时记录原始响应前 800 字符，便于排查 Coze 实际返回格式 */
  let rawPreview = ''
  let totalBytesReceived = 0

  try {
    while (true) {
      if (streamAbort.signal.aborted) {
        const receivedTypes = emptyDiagnosticPayloads.length > 0 ? emptyDiagnosticPayloads.map((p) => p.type) : []
        const hadToolRequest = receivedTypes.includes('tool_request')
        const hadToolResponse = receivedTypes.includes('tool_response')
        console.warn(`[scriptLLM] [Coze] 流式超时（${effectiveStreamTimeout}ms），已结束`, hadToolRequest && !hadToolResponse ? '；收到 tool_request 但未收到 tool_response，请检查 Coze 侧工具是否执行成功' : '')
        cozeDiagnosticLog('stream_timeout', { effectiveStreamTimeoutMs: effectiveStreamTimeout, receivedTypes, hadToolRequest, hadToolResponse })
        if (!skipStats) cozeRecord('timeout', Date.now() - streamStartMs)
        break
      }
      const { done, value } = await reader.read()
      if (done) break
      if (value && value.length) {
        totalBytesReceived += value.length
        const decoded = decoder.decode(value, { stream: true })
        buffer += decoded
        if (rawPreview.length < 800) rawPreview += decoded.slice(0, 800 - rawPreview.length)
      }
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() || ''
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const trimmed = line.trim()
        if (!trimmed || trimmed === 'data: [DONE]') continue
        let payload: string
        if (trimmed.startsWith('data: ')) {
          payload = trimmed.slice(6).trim()
        } else if (trimmed === 'data:' && lines[i + 1] !== undefined) {
          payload = lines[i + 1].trim()
          i += 1
        } else if (trimmed.startsWith('{')) {
          payload = trimmed
        } else {
          payload = ''
        }
        if (!payload) continue
        if (dataLineCount < maxDebugLines) {
          dataLineCount += 1
          debugLog(`Coze data line #${dataLineCount}`, payload.slice(0, 400))
        }
        try {
          const data = JSON.parse(payload) as Record<string, unknown>
          if (emptyDiagnosticPayloads.length < 10) {
            const t = typeof data.type === 'string' ? data.type : (data as Record<string, unknown>).event ?? '?'
            emptyDiagnosticPayloads.push({ type: String(t), preview: payload.slice(0, 280) })
          }
          // tool 路径已废弃：本系统不再从 tool_response 产出正文，仅记录诊断。正文须由 Coze 在 answer/delta 中直接输出（见《Coze对接说明》）。
          if (data.type === 'tool_response') {
            const tr = (data.content && typeof data.content === 'object' ? (data.content as Record<string, unknown>).tool_response : undefined) ?? data.tool_response
            const trKeys = tr && typeof tr === 'object' && tr !== null ? Object.keys(tr as object) : []
            cozeDiagnosticLog('tool_response_deprecated', {
              hint: '正文须在 answer/delta 中输出，本系统已不再解析 tool_response',
              tool_response_keys: trKeys,
              preview: payload.slice(0, 360),
            })
            continue
          }
          const content = extractCozeContent(data)
          if (content) {
            yieldedChunks += 1
            yieldedLen += content.length
            yield content
          }
        } catch {
          const contentMatch = payload.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)"/)
          const textMatch = payload.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/)
          const str = contentMatch?.[1] ?? textMatch?.[1]
          if (str) {
            const unescaped = str.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
            yieldedChunks += 1
            yieldedLen += unescaped.length
            yield unescaped
          } else if (payload && !payload.startsWith('[')) {
            yieldedChunks += 1
            yieldedLen += payload.length
            yield payload
          }
        }
      }
    }
    if (!streamAbort.signal.aborted && !skipStats)
      cozeRecord('success', Date.now() - streamStartMs)
    if (buffer.trim()) {
      try {
        const data = JSON.parse(buffer) as Record<string, unknown>
        const content = extractAnyContent(data)
        if (content) {
          yieldedChunks += 1
          yieldedLen += content.length
          yield content
        }
      } catch {
        // ignore
      }
    }
  } finally {
    cozeDiagnosticLog('stream_done', { yieldedChunks, yieldedLen, aborted: streamAbort.signal.aborted })
    if (yieldedLen === 0) {
      if (emptyDiagnosticPayloads.length > 0) {
        let messageEndContentKeys: string[] | undefined
        const msgEnd = emptyDiagnosticPayloads.find((p) => p.type === 'message_end')
        if (msgEnd?.preview) {
          try {
            const parsed = JSON.parse(msgEnd.preview) as Record<string, unknown>
            const content = parsed.content
            if (content && typeof content === 'object' && !Array.isArray(content)) {
              messageEndContentKeys = Object.keys(content as Record<string, unknown>)
            }
          } catch {
            // ignore
          }
        }
        const sampleTypes = emptyDiagnosticPayloads.map((p) => p.type)
        const hasToolRequest = sampleTypes.includes('tool_request')
        let hint: string | undefined
        if (hasToolRequest) {
          hint = '检测到 tool_request；tool 路径已废弃，请将 Coze Bot 改为在 answer/delta 中直接输出正文，否则本系统无法得到结果'
          if (bodyKind === 'legacy') hint += '。当前为 legacy 体（content.query.prompt），符合《Coze 对接协议》入参要求'
        } else if (messageEndContentKeys) {
          hint = '若仅有 answer/thinking 且均为 null，请在 Coze Bot 中配置「直接回复」或确保工具返回后 Bot 输出正文'
        }
        cozeDiagnosticLog('empty_stream_payloads', {
          sampleTypes,
          samples: emptyDiagnosticPayloads,
          ...(messageEndContentKeys ? { messageEndContentKeys } : {}),
          ...(hint ? { hint } : {}),
        })
      } else {
        cozeDiagnosticLog('empty_stream_no_payloads', {
          hint: totalBytesReceived === 0 ? 'Coze 返回了 0 字节（空 body），请检查 Agent 是否要求鉴权、URL 是否支持 stream_run、或管理后台 LLM 配置中是否填写了 API Key' : 'Coze 未返回任何可解析的 data 行，请检查 SSE 格式',
          status: responseStatus,
          contentType: responseContentType,
          totalBytesReceived,
          rawPreview: rawPreview.slice(0, 600),
          bufferTail: buffer.slice(0, 300),
        })
        if (rawPreview.trimStart().startsWith('{')) {
          try {
            const errJson = JSON.parse(rawPreview.trim()) as Record<string, unknown>
            cozeDiagnosticLog('empty_stream_json_response', { code: errJson.code, msg: errJson.msg ?? errJson.message ?? errJson.error })
          } catch {
            // ignore
          }
        }
      }
    }
    clearTimeout(timeoutId)
    reader.releaseLock()
  }
}

/** OpenAI 兼容：流式 chat completions，逐块 yield */
async function* streamOpenAICompletions(
  config: ScriptLLMProviderConfig,
  options: ScriptLLMProviderOptions
): AsyncGenerator<string, void, unknown> {
  const url = buildChatCompletionsUrl(config.url)
  const model = config.model || DEFAULT_MODEL
  const body = {
    model,
    messages: [
      { role: 'system', content: options.systemPrompt },
      { role: 'user', content: options.userMessage },
    ],
    stream: true,
    temperature: 0.7,
    ...(options.maxTokens != null && options.maxTokens > 0 ? { max_tokens: options.maxTokens } : {}),
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok || !res.body) return
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed === 'data: [DONE]') continue
        if (trimmed.startsWith('data: ')) {
          try {
            const data = JSON.parse(trimmed.slice(6)) as {
              choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>
            }
            const content = data.choices?.[0]?.delta?.content
            if (typeof content === 'string' && content) yield content
          } catch {
            // 忽略单行解析错误
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/** OpenAI 兼容：一次性 chat completions */
async function callOpenAIOnce(
  config: ScriptLLMProviderConfig,
  options: ScriptLLMProviderOptions
): Promise<string> {
  const url = buildChatCompletionsUrl(config.url)
  const model = config.model || DEFAULT_MODEL
  const timeoutMs = options.timeoutMs ?? Number(process.env.LLM_ONCE_TIMEOUT_MS) ?? 25000
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: options.systemPrompt },
      { role: 'user', content: options.userMessage },
    ],
    stream: false,
    temperature: 0.5,
  }
  if (options.maxTokens != null && options.maxTokens > 0) body.max_tokens = options.maxTokens
  const ac = new AbortController()
  const timeoutId = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    })
    clearTimeout(timeoutId)
    if (!res.ok) return ''
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string }; text?: string }>
      content?: string
    }
    const content =
      data.choices?.[0]?.message?.content ??
      data.choices?.[0]?.text ??
      (typeof data.content === 'string' ? data.content : '')
    return typeof content === 'string' ? content.trim() : ''
  } catch (e: unknown) {
    clearTimeout(timeoutId)
    if ((e as { name?: string })?.name === 'AbortError') {
      console.warn(`[scriptLLM] callLLMOnce 超时（${timeoutMs}ms），已回退`)
    }
    return ''
  }
}

const cozeAgentProvider: IScriptLLMProvider = {
  id: 'coze_agent',
  stream(config, options) {
    const url = ensureCozeStreamRunUrl(config.url.replace(/\/$/, ''))
    return streamCozeAgent(
      url,
      config.apiKey,
      options.systemPrompt,
      options.userMessage,
      options.taskType ?? 'script',
      options.skipStats ?? false,
      options.toolCallOnly ?? false,
      options.timeoutMs
    )
  },
  async callOnce(config, options) {
    const url = ensureCozeStreamRunUrl(config.url.replace(/\/$/, ''))
    const onceTimeoutMs = options.timeoutMs ?? COZE_ONCE_TIMEOUT_MS
    let full = ''
    const onceStartMs = Date.now()
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('LLM_TIMEOUT')), onceTimeoutMs)
      )
      const collectPromise = (async () => {
        for await (const chunk of streamCozeAgent(
          url,
          config.apiKey,
          options.systemPrompt,
          options.userMessage,
          options.taskType ?? 'todo',
          true,
          false,
          onceTimeoutMs
        )) {
          full += chunk
        }
        return full.trim()
      })()
      const result = await Promise.race([collectPromise, timeoutPromise])
      cozeRecord('success', Date.now() - onceStartMs)
      return result
    } catch (e: unknown) {
      const durationMs = Date.now() - onceStartMs
      if ((e as { message?: string })?.message === 'LLM_TIMEOUT') {
        console.warn(`[scriptLLM] [Coze] 一次性调用超时（${onceTimeoutMs}ms），已回退`)
        cozeRecord('timeout', durationMs)
      } else {
        cozeRecord('fail', durationMs)
      }
      return full.trim() || ''
    }
  },
}

const openaiProvider: IScriptLLMProvider = {
  id: 'openai',
  stream: streamOpenAICompletions,
  callOnce: callOpenAIOnce,
}

function initBuiltinProviders(): void {
  registerScriptLLMProvider('coze_agent', cozeAgentProvider)
  registerScriptLLMProvider('openai', openaiProvider)
}
initBuiltinProviders()

/**
 * 一次性调用 LLM（非流式），返回完整回复文本。
 * 用于待办生成中的异常分析等场景，复用同一套话术 LLM 配置。
 * 未配置或请求失败时返回空字符串。
 * 通过 getScriptLLMProvider(mode) 调度，支持后续扩展其他 LLM。
 */
export async function callLLMOnce(options: ScriptLLMOptions): Promise<string> {
  const config = options.config
    ? { url: options.config.url, apiKey: options.config.apiKey, model: options.config.model }
    : getScriptLLMConfigSync()
  if (!config) {
    console.warn('[scriptLLM] callLLMOnce 未配置，跳过。请管理员在「LLM 配置」中填写 API 地址与密钥，或设置 SCRIPT_LLM_URL、SCRIPT_LLM_API_KEY 后重启。')
    return ''
  }

  const taskType = options.taskType ?? 'todo'
  const mode: LLMModeValue = taskType === 'script' ? getLLMModesSync().script : getLLMModesSync().todo
  const provider = getScriptLLMProvider(mode)
  if (!provider) {
    console.warn('[scriptLLM] callLLMOnce 未找到 provider，mode=', mode)
    return ''
  }

  const opts: ScriptLLMProviderOptions = {
    systemPrompt: options.systemPrompt,
    userMessage: options.userMessage,
    taskType,
    timeoutMs: options.timeoutMs,
    maxTokens: options.maxTokens,
    skipStats: true,
  }

  if (provider.callOnce) {
    return provider.callOnce(config, opts)
  }

  const onceTimeoutMs = options.timeoutMs ?? COZE_ONCE_TIMEOUT_MS
  let full = ''
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('LLM_TIMEOUT')), onceTimeoutMs)
  )
  const collectPromise = (async () => {
    for await (const chunk of provider.stream(config, opts)) {
      full += chunk
    }
    return full.trim()
  })()
  try {
    return await Promise.race([collectPromise, timeoutPromise])
  } catch {
    return full.trim() || ''
  }
}

/**
 * 流式话术/待办：按当前 script 模式选用已注册的 Provider，逐块 yield 正文。
 * 未配置 LLM 或未找到对应 Provider 时返回空异步迭代器。
 * 后续其他 LLM 接入：实现 IScriptLLMProvider 并 registerScriptLLMProvider，配置选用该 id 即可。
 */
export async function* streamScriptFromLLM(options: ScriptLLMOptions): AsyncGenerator<string, void, unknown> {
  const config = options.config
    ? { url: options.config.url, apiKey: options.config.apiKey, model: options.config.model }
    : getScriptLLMConfigSync()
  if (!config) return

  const mode = getLLMModesSync().script
  const provider = getScriptLLMProvider(mode)
  if (!provider) {
    console.warn('[scriptLLM] streamScriptFromLLM 未找到 provider，mode=', mode)
    return
  }

  const opts: ScriptLLMProviderOptions = {
    systemPrompt: options.systemPrompt,
    userMessage: options.userMessage,
    taskType: options.taskType ?? 'script',
    toolCallOnly: options.toolCallOnly,
    maxTokens: options.maxTokens,
    skipStats: false,
  }
  yield* provider.stream(config, opts)
}
