/**
 * 话术表单草稿工具
 * - 从 localStorage 恢复/保存草稿
 * - 话术语言映射
 * - LLM 配置错误识别
 */

import type { ScriptLanguage, BundleItem, ScriptFormState } from '../components/ai/types'
import { SCRIPT_FORM_STORAGE_KEY } from '../components/ai/types'

// ==================== 草稿恢复 ====================

type ScriptDraft = Partial<
  ScriptFormState & {
    productTypeTab: 'single' | 'bundle'
    coreFeatures: string
    secondaryFeatures: string
    afterSalesInfo: string
    competitorLink: string
    bundleName: string
    bundleTotalPrice: string
    bundleFeaturesText: string
    bundleItems: BundleItem[]
  }
>

export function loadScriptFormDraft(): ScriptDraft {
  try {
    const raw = localStorage.getItem(SCRIPT_FORM_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const allowed: string[] = [
      'productName',
      'productSku',
      'price',
      'features',
      'coreFeatures',
      'secondaryFeatures',
      'targetAudience',
      'country',
      'scriptType',
      'promoCopy',
      'afterSalesInfo',
      'competitorLink',
      'bundleName',
      'bundleTotalPrice',
      'bundleFeaturesText',
    ]
    const out: Record<string, unknown> = {}
    for (const key of allowed) {
      if (parsed[key] != null && typeof parsed[key] === 'string') out[key] = parsed[key] as string
    }
    if (parsed.productTypeTab === 'single' || parsed.productTypeTab === 'bundle') out.productTypeTab = parsed.productTypeTab
    if (Array.isArray(parsed.bundleItems)) {
      const safeItems: BundleItem[] = []
      for (const it of parsed.bundleItems as unknown[]) {
        if (!it || typeof it !== 'object') continue
        const o = it as Record<string, unknown>
        const id = typeof o.id === 'string' && o.id.trim() ? o.id : crypto.randomUUID()
        const name = typeof o.name === 'string' ? o.name : ''
        const price = typeof o.price === 'string' ? o.price : ''
        const sku = typeof o.sku === 'string' ? o.sku : ''
        const features = typeof o.features === 'string' ? o.features : ''
        const quantity = typeof o.quantity === 'number' && Number.isFinite(o.quantity) ? Math.max(1, Math.floor(o.quantity)) : 1
        const role = o.role === 'core' ? 'core' : 'tool'
        safeItems.push({ id, name, price, sku, features, quantity, role } as BundleItem)
      }
      out.bundleItems = safeItems.slice(0, 30)
    }
    if (
      parsed.scriptType &&
      ![
        'full-sales',
        'segment-audience',
        'segment-product',
        'segment-concerns',
        'segment-benefits',
        'segment-after-sales',
        'segment-closing',
      ].includes(parsed.scriptType as string)
    ) delete out.scriptType
    return out as ScriptDraft
  } catch {
    return {}
  }
}

// ==================== 草稿保存 ====================

export function saveScriptFormDraft(form: Record<string, unknown>) {
  try {
    localStorage.setItem(SCRIPT_FORM_STORAGE_KEY, JSON.stringify(form))
  } catch {
    // ignore
  }
}

// ==================== 语言映射 ====================

/** 话术生成使用全局界面语言（与侧边栏一致），仅支持 zh-CN / en-US / th-TH */
export function scriptLanguageFromLocale(locale: string): ScriptLanguage {
  const l = (locale || '').toLowerCase()
  if (l.startsWith('th')) return 'th-TH'
  if (l.startsWith('en')) return 'en-US'
  return 'zh-CN'
}

// ==================== 错误识别 ====================

/** 超时/网络等错误不应误导为「去配 LLM」；仅在文案像权限/未配置时才展示管理员排障指引 */
export function scriptErrorLooksLikeLlmConfigIssue(message: string): boolean {
  const m = String(message || '')
  return /权限|未配置|LLM|密钥|api\s*key|access\s*denied|403|SCRIPT_LLM|配置\s*LLM/i.test(m)
}

// ==================== 价格解析 ====================

export function parsePriceToNumber(raw: string): number | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const n = Number(s.replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? n : null
}
