/**
 * 话术 LLM 配置：支持从环境变量或数据库（管理员配置）读取；可限定为选定用户可用。
 */

import { dbGet, dbRun } from '../db'

const KEY_URL = 'script_llm_url'
const KEY_API_KEY = 'script_llm_api_key'
const KEY_MODEL = 'script_llm_model'
const KEY_ALLOWED_USER_IDS = 'script_llm_allowed_user_ids'
/** 已启用的功能 id 列表（如 ['script','tasks']）；未配置或 null 表示全部启用，兼容旧数据 */
const KEY_ENABLED_FEATURES = 'script_llm_enabled_features'
/** 按功能选择的智能体方式：coze = Coze 智能体 (stream_run)，openai = OpenAI 兼容接口 */
export const KEY_LLM_MODE_TODO = 'llm_mode_todo'
export const KEY_LLM_MODE_SCRIPT = 'llm_mode_script'

const ENV_URL = process.env.SCRIPT_LLM_URL || process.env.OPENAI_API_BASE || ''
const ENV_KEY = process.env.SCRIPT_LLM_API_KEY || process.env.OPENAI_API_KEY || ''
const ENV_MODEL = process.env.SCRIPT_LLM_MODEL || process.env.OPENAI_MODEL || ''
/** *.coze.site 时若未配 SCRIPT_LLM_API_KEY，可 fallback 到此 Key（仅用于 stream_run 鉴权，与已废除的 /api/agent 无关） */
const ENV_AGENT_KEY = process.env.AGENT_API_KEY || ''

/** 内存缓存，启动时及管理员保存后加载，供同步读取 */
let cached: { url: string; apiKey: string; model?: string } | null = null
/** 允许使用话术生成的用户 ID 列表；null 表示未配置（沿用旧逻辑视为全体可用），空数组表示仅管理员等需单独配置 */
let cachedAllowedIds: string[] | null = null
/** 已启用的功能 id（script=话术生成, tasks=智能生成待办）；null 表示全部启用 */
let cachedEnabledFeatures: string[] | null = null
/** 按功能选择的智能体方式：coze_agent=Coze Agent，openai=OpenAI 兼容；异常分析与待办共用 todo */
export type LLMModeValue = 'coze_agent' | 'openai'
let cachedModeTodo: LLMModeValue = 'coze_agent'
let cachedModeScript: LLMModeValue = 'coze_agent'

export interface ScriptLLMConfig {
  url: string
  apiKey: string
  model?: string
}

/** 从数据库读取话术 LLM 配置（不暴露给前端，仅后端使用） */
export async function getScriptLLMConfigFromDB(): Promise<ScriptLLMConfig | null> {
  const urlRow = await dbGet<{ value: string }>('SELECT value FROM system_config WHERE key = ?', [KEY_URL])
  const keyRow = await dbGet<{ value: string }>('SELECT value FROM system_config WHERE key = ?', [KEY_API_KEY])
  const modelRow = await dbGet<{ value: string }>('SELECT value FROM system_config WHERE key = ?', [KEY_MODEL])
  const url = urlRow?.value?.trim()
  const apiKey = keyRow?.value?.trim()
  const model = modelRow?.value?.trim()
  if (url && apiKey) return { url, apiKey, model: model || undefined }
  return null
}

/** 获取允许使用话术生成的用户 ID 列表；返回 null 表示“全体用户可用”（未配置或兼容旧数据） */
export async function getScriptLLMAllowedUserIds(): Promise<string[] | null> {
  const row = await dbGet<{ value: string }>('SELECT value FROM system_config WHERE key = ?', [KEY_ALLOWED_USER_IDS])
  const raw = row?.value?.trim()
  if (raw === undefined || raw === '' || raw === '*') return null
  const ids = raw.split(',').map((s) => s.trim()).filter(Boolean)
  return ids.length > 0 ? ids : null
}

/** 同步读取已缓存的允许用户列表（用于与 getScriptLLMConfigSync 同线程内校验） */
export function getScriptLLMAllowedUserIdsSync(): string[] | null {
  return cachedAllowedIds === undefined ? null : cachedAllowedIds
}

/** 从数据库读取已启用的功能 id 列表；null 表示全部启用。用于生成待办等接口，避免多进程下缓存未同步。 */
export async function getScriptLLMEnabledFeatures(): Promise<string[] | null> {
  const row = await dbGet<{ value: string }>('SELECT value FROM system_config WHERE key = ?', [KEY_ENABLED_FEATURES])
  const raw = row?.value?.trim()
  if (!raw) return null
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.map((x: unknown) => String(x).trim()).filter(Boolean) : null
  } catch {
    return null
  }
}

/** 同步读取已启用的功能 id 列表；null 表示全部启用（兼容旧数据） */
export function getScriptLLMEnabledFeaturesSync(): string[] | null {
  return cachedEnabledFeatures
}

/** 保存话术 LLM 配置到数据库（仅管理员可调用对应接口）；allowedUserIds 为空或未传时存为全体可用；enabledFeatures 未传或 null 表示全部功能启用 */
export async function setScriptLLMConfigInDB(
  url: string,
  apiKey: string,
  model?: string,
  allowedUserIds?: string[],
  enabledFeatures?: string[] | null
): Promise<void> {
  const u = (url || '').trim()
  const k = (apiKey || '').trim()
  const m = (model || '').trim()
  const ids = allowedUserIds && Array.isArray(allowedUserIds)
    ? allowedUserIds.map((id) => String(id).trim()).filter(Boolean)
    : null
  const allowed = ids === null ? '*' : ids.length === 0 ? '' : ids.join(',')
  const featuresVal =
    enabledFeatures === undefined || enabledFeatures === null
      ? ''
      : Array.isArray(enabledFeatures)
        ? JSON.stringify(enabledFeatures.map((s) => String(s).trim()).filter(Boolean))
        : ''
  const now = new Date().toISOString()
  await dbRun(
    `INSERT INTO system_config (key, value, updatedAt) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updatedAt = ?`,
    [KEY_URL, u, now, u, now]
  )
  await dbRun(
    `INSERT INTO system_config (key, value, updatedAt) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updatedAt = ?`,
    [KEY_API_KEY, k, now, k, now]
  )
  await dbRun(
    `INSERT INTO system_config (key, value, updatedAt) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updatedAt = ?`,
    [KEY_MODEL, m, now, m, now]
  )
  await dbRun(
    `INSERT INTO system_config (key, value, updatedAt) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updatedAt = ?`,
    [KEY_ALLOWED_USER_IDS, allowed, now, allowed, now]
  )
  await dbRun(
    `INSERT INTO system_config (key, value, updatedAt) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updatedAt = ?`,
    [KEY_ENABLED_FEATURES, featuresVal, now, featuresVal, now]
  )
}


/** 从数据库加载配置到内存缓存（启动时与管理员保存后调用） */
export async function loadScriptLLMConfigCache(): Promise<void> {
  const fromDb = await getScriptLLMConfigFromDB()
  cached = fromDb
  const raw = await dbGet<{ value: string }>('SELECT value FROM system_config WHERE key = ?', [KEY_ALLOWED_USER_IDS])
  const v = raw?.value?.trim()
  if (v === undefined || v === '*') {
    cachedAllowedIds = null
  } else if (v === '') {
    cachedAllowedIds = []
  } else {
    cachedAllowedIds = v.split(',').map((s) => s.trim()).filter(Boolean)
  }
  const featuresRow = await dbGet<{ value: string }>('SELECT value FROM system_config WHERE key = ?', [KEY_ENABLED_FEATURES])
  const fRaw = featuresRow?.value?.trim()
  if (!fRaw) {
    cachedEnabledFeatures = null
  } else {
    try {
      const arr = JSON.parse(fRaw)
      cachedEnabledFeatures = Array.isArray(arr) ? arr.map((x: unknown) => String(x).trim()).filter(Boolean) : null
    } catch {
      cachedEnabledFeatures = null
    }
  }
  const todoRow = await dbGet<{ value: string }>('SELECT value FROM system_config WHERE key = ?', [KEY_LLM_MODE_TODO])
  const scriptRow = await dbGet<{ value: string }>('SELECT value FROM system_config WHERE key = ?', [KEY_LLM_MODE_SCRIPT])
  const vTodo = todoRow?.value?.trim()
  const vScript = scriptRow?.value?.trim()
  cachedModeTodo = (vTodo === 'coze_agent' || vTodo === 'openai' ? vTodo : 'coze_agent') as LLMModeValue
  cachedModeScript = (vScript === 'coze_agent' || vScript === 'openai' ? vScript : 'coze_agent') as LLMModeValue
}

/** 同步读取当前按功能选择的智能体方式（异常分析与待办共用 todo） */
export function getLLMModesSync(): { todo: LLMModeValue; script: LLMModeValue } {
  return { todo: cachedModeTodo, script: cachedModeScript }
}

/** 保存智能体方式偏好（仅管理员）；未传的 key 不更新 */
export async function setLLMModesInDB(options: { todo?: LLMModeValue; script?: LLMModeValue }): Promise<void> {
  const now = new Date().toISOString()
  if (options.todo !== undefined) {
    await dbRun(
      'INSERT INTO system_config (key, value, updatedAt) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updatedAt = ?',
      [KEY_LLM_MODE_TODO, options.todo, now, options.todo, now]
    )
    cachedModeTodo = options.todo
  }
  if (options.script !== undefined) {
    await dbRun(
      'INSERT INTO system_config (key, value, updatedAt) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updatedAt = ?',
      [KEY_LLM_MODE_SCRIPT, options.script, now, options.script, now]
    )
    cachedModeScript = options.script
  }
}

/** 同步获取当前生效的配置：优先环境变量，其次数据库缓存；*.coze.site 时 API Key 可用 AGENT_API_KEY 兜底（Coze 发布站点鉴权） */
export function getScriptLLMConfigSync(): ScriptLLMConfig | null {
  let result: ScriptLLMConfig | null = null
  if (ENV_URL && (ENV_KEY || (ENV_URL.includes('coze.site') && ENV_AGENT_KEY))) {
    result = { url: ENV_URL, apiKey: ENV_KEY || ENV_AGENT_KEY, model: ENV_MODEL || undefined }
  } else if (cached) {
    const url = cached.url || ''
    const apiKey = (cached.apiKey && cached.apiKey.trim()) || (url.includes('coze.site') ? ENV_AGENT_KEY : '')
    result = { ...cached, apiKey: apiKey || cached.apiKey }
  } else {
    result = cached
  }
  return result
}

/** 诊断：当前配置来源，供前端展示「为何 LLM 0 条」 */
export function getScriptLLMConfigSource(): 'env' | 'db' | 'none' {
  if (ENV_URL && ENV_KEY) return 'env'
  return cached ? 'db' : 'none'
}
