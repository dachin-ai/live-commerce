/**
 * 多套 AI 工具配置：CRUD、用户选择、按工具 ID 取配置供调用。
 * 与 scriptLLMConfig 并存：scriptLLMConfig 为旧版单套配置（环境变量/ system_config 单条）；
 * 本模块为 llm_tools 表 + 用户偏好 selectedLlmToolId，调用时按「用户选择的工具 ID」取 URL/Key。
 * 支持按功能映射：feature_llm_mapping 指定 script/tasks/anomaly 各自使用的工具 ID。
 */

import crypto from 'crypto'
import { dbRun, dbGet, dbAll } from '../db'
import { getScriptLLMConfigSync } from './scriptLLMConfig'

const SYS_KEY_DEFAULT_TOOL_ID = 'llm_tool_default_id'
const SYS_KEY_FEATURE_LLM_MAPPING = 'feature_llm_mapping'

export type FeatureId = 'script' | 'tasks' | 'anomaly' | 'video'

export interface LlmToolRecord {
  id: string
  name: string
  url: string
  api_key: string
  model: string | null
  sort_order: number
  createdAt: string
  updatedAt: string
}

/** 对外展示用（不含 api_key） */
export interface LlmToolPublic {
  id: string
  name: string
  url: string
  model: string | null
  sort_order: number
}

/** 调用 LLM 时使用的配置（与 ScriptLLMConfig 一致） */
export interface LlmToolConfig {
  url: string
  apiKey: string
  model?: string
}

/** 列表：仅返回公开字段，不暴露 api_key */
export async function listLlmTools(): Promise<LlmToolPublic[]> {
  const rows = await dbAll<LlmToolRecord>(
    'SELECT id, name, url, api_key, model, sort_order, createdAt, updatedAt FROM llm_tools ORDER BY sort_order ASC, createdAt ASC'
  )
  return (rows || []).map((r) => ({
    id: r.id,
    name: r.name,
    url: r.url,
    model: r.model ?? null,
    sort_order: r.sort_order ?? 0,
  }))
}

/** 按 ID 获取完整配置（含 api_key），仅后端调用 LLM 时使用 */
export async function getLlmToolConfigById(toolId: string): Promise<LlmToolConfig | null> {
  const row = await dbGet<LlmToolRecord>(
    'SELECT id, name, url, api_key, model FROM llm_tools WHERE id = ?',
    [toolId]
  )
  if (!row || !row.url?.trim() || !row.api_key?.trim()) return null
  return {
    url: row.url.trim(),
    apiKey: row.api_key.trim(),
    model: row.model?.trim() || undefined,
  }
}

/** 系统默认工具 ID（system_config 或第一套） */
export async function getDefaultToolId(): Promise<string | null> {
  const row = await dbGet<{ value: string }>('SELECT value FROM system_config WHERE key = ?', [SYS_KEY_DEFAULT_TOOL_ID])
  const id = row?.value?.trim()
  if (id) {
    const exists = await dbGet<{ id: string }>('SELECT id FROM llm_tools WHERE id = ?', [id])
    if (exists) return id
  }
  const first = await dbGet<{ id: string }>('SELECT id FROM llm_tools ORDER BY sort_order ASC, createdAt ASC LIMIT 1')
  return first?.id ?? null
}

/** 设置系统默认工具 ID（仅写入 system_config） */
export async function setDefaultToolId(toolId: string): Promise<void> {
  const now = new Date().toISOString()
  await dbRun(
    "INSERT INTO system_config (key, value, updatedAt) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updatedAt = ?",
    [SYS_KEY_DEFAULT_TOOL_ID, toolId, now, toolId, now]
  )
}

/** 用户选中的工具 ID（存在 user_preferences.preferences.selectedLlmToolId） */
export async function getUserSelectedToolId(userId: string): Promise<string | null> {
  const row = await dbGet<{ preferences: string }>('SELECT preferences FROM user_preferences WHERE userId = ?', [userId])
  if (!row?.preferences) return null
  try {
    const prefs = JSON.parse(row.preferences) as { selectedLlmToolId?: string }
    const id = prefs?.selectedLlmToolId?.trim()
    if (!id) return null
    const exists = await dbGet<{ id: string }>('SELECT id FROM llm_tools WHERE id = ?', [id])
    return exists ? id : null
  } catch {
    return null
  }
}

/** 设置用户选中的工具 ID */
export async function setUserSelectedToolId(userId: string, toolId: string | null): Promise<void> {
  const prefsRow = await dbGet<{ id: string; preferences: string }>(
    'SELECT id, preferences FROM user_preferences WHERE userId = ?',
    [userId]
  )
  const now = new Date().toISOString()
  const prefs: Record<string, unknown> = prefsRow?.preferences ? JSON.parse(prefsRow.preferences) : {}
  if (toolId === null) {
    delete prefs.selectedLlmToolId
  } else {
    prefs.selectedLlmToolId = toolId
  }
  const json = JSON.stringify(prefs)
  if (prefsRow) {
    await dbRun('UPDATE user_preferences SET preferences = ?, updatedAt = ? WHERE userId = ?', [json, now, userId])
  } else {
    await dbRun(
      'INSERT INTO user_preferences (id, userId, preferences, updatedAt) VALUES (?, ?, ?, ?)',
      [crypto.randomUUID(), userId, json, now]
    )
  }
}

/** 解析请求时的「当前生效」工具：body.toolId > 用户选择 > 系统默认；返回对应配置 */
export async function getEffectiveToolConfigForUser(
  userId: string,
  preferredToolId?: string | null
): Promise<LlmToolConfig | null> {
  let toolId: string | null = (preferredToolId && String(preferredToolId).trim()) || null
  if (!toolId) toolId = await getUserSelectedToolId(userId)
  if (!toolId) toolId = await getDefaultToolId()
  if (!toolId) return null
  return getLlmToolConfigById(toolId)
}

/** 创建一套工具（仅管理员） */
export async function createLlmTool(params: {
  name: string
  url: string
  api_key: string
  model?: string
  sort_order?: number
}): Promise<LlmToolRecord> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const name = (params.name || '未命名').trim()
  const url = (params.url || '').trim()
  const api_key = (params.api_key || '').trim()
  const model = params.model?.trim() || null
  const sort_order = params.sort_order ?? 0
  if (!url || !api_key) throw new Error('url 与 api_key 必填')
  await dbRun(
    'INSERT INTO llm_tools (id, name, url, api_key, model, sort_order, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, name, url, api_key, model, sort_order, now, now]
  )
  const row = await dbGet<LlmToolRecord>('SELECT * FROM llm_tools WHERE id = ?', [id])
  if (!row) throw new Error('创建后查询失败')
  return row
}

/** 更新一套工具（仅管理员） */
export async function updateLlmTool(
  id: string,
  params: { name?: string; url?: string; api_key?: string; model?: string; sort_order?: number }
): Promise<LlmToolRecord | null> {
  const existing = await dbGet<LlmToolRecord>('SELECT * FROM llm_tools WHERE id = ?', [id])
  if (!existing) return null
  const name = params.name !== undefined ? String(params.name).trim() : existing.name
  const url = params.url !== undefined ? String(params.url).trim() : existing.url
  const api_key = params.api_key !== undefined ? String(params.api_key).trim() : existing.api_key
  const model = params.model !== undefined ? (params.model ? String(params.model).trim() : null) : existing.model
  const sort_order = params.sort_order !== undefined ? params.sort_order : existing.sort_order
  if (!url || !api_key) throw new Error('url 与 api_key 不可为空')
  const now = new Date().toISOString()
  await dbRun(
    'UPDATE llm_tools SET name = ?, url = ?, api_key = ?, model = ?, sort_order = ?, updatedAt = ? WHERE id = ?',
    [name, url, api_key, model, sort_order, now, id]
  )
  const row = await dbGet<LlmToolRecord>('SELECT * FROM llm_tools WHERE id = ?', [id])
  return row ?? null
}

/** 删除一套工具（仅管理员） */
export async function deleteLlmTool(id: string): Promise<boolean> {
  await dbRun('DELETE FROM llm_tools WHERE id = ?', [id])
  return true
}

/** 功能 → 工具 ID 映射类型 */
export type FeatureLlmMapping = Partial<Record<FeatureId, string>>

/** 获取功能 → 工具 ID 映射 */
export async function getFeatureLlmMapping(): Promise<FeatureLlmMapping> {
  const row = await dbGet<{ value: string }>('SELECT value FROM system_config WHERE key = ?', [SYS_KEY_FEATURE_LLM_MAPPING])
  const raw = row?.value?.trim()
  if (!raw) return {}
  try {
    const obj = JSON.parse(raw)
    if (obj && typeof obj === 'object') {
      const out: FeatureLlmMapping = {}
      for (const k of ['script', 'tasks', 'anomaly', 'video']) {
        const v = obj[k]
        if (typeof v === 'string' && v.trim()) out[k as FeatureId] = v.trim()
      }
      return out
    }
  } catch {
    /* ignore */
  }
  return {}
}

/** 设置功能 → 工具 ID 映射（仅管理员） */
export async function setFeatureLlmMapping(mapping: FeatureLlmMapping): Promise<void> {
  const now = new Date().toISOString()
  const val = JSON.stringify(mapping)
  await dbRun(
    "INSERT INTO system_config (key, value, updatedAt) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updatedAt = ?",
    [SYS_KEY_FEATURE_LLM_MAPPING, val, now, val, now]
  )
}

/** 按功能获取 LLM 配置：优先从 feature_llm_mapping 取工具，无映射则回退 scriptLLMConfig */
export async function getLLMConfigForFeature(feature: FeatureId): Promise<LlmToolConfig | null> {
  const mapping = await getFeatureLlmMapping()
  const toolId = mapping[feature]?.trim()
  if (toolId) {
    const cfg = await getLlmToolConfigById(toolId)
    if (cfg) return cfg
  }
  const fallback = getScriptLLMConfigSync()
  return fallback ? { url: fallback.url, apiKey: fallback.apiKey, model: fallback.model } : null
}
