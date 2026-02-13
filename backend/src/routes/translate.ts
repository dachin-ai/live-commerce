/**
 * 内置翻译：不依赖 LLM，使用免费翻译 API 将待办等内容翻译为当前界面语言。
 * 用于「生成时只写一种语言 + 按需翻译展示」，避免为多语言重复调用 LLM。
 */

import express from 'express'
import { authenticate, AuthRequest } from '../middleware/auth'
import { translateText, translateLongText, TranslateQuotaError, TRANSLATE_QUOTA_MESSAGE } from '../utils/translate'

const router = express.Router()

/**
 * POST /api/translate
 * Body: { text: string, targetLang: string, sourceLang?: string }
 * 返回: { translatedText: string }
 */
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const { text, targetLang, sourceLang } = req.body
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'text is required' })
    }
    const translatedText = await translateText(text, targetLang || 'en', sourceLang)
    res.json({ translatedText })
  } catch (e: any) {
    console.error('[translate]', e)
    if (e instanceof TranslateQuotaError || e?.code === 'QUOTA_EXCEEDED') {
      return res.status(429).json({ error: TRANSLATE_QUOTA_MESSAGE, code: 'QUOTA_EXCEEDED' })
    }
    res.status(500).json({ error: 'Translation failed' })
  }
})

/**
 * POST /api/translate/long
 * Body: { text: string, targetLang: string, sourceLang?: string }
 * 返回: { translatedText: string }
 * 用于话术等长文本，按段落分批翻译。
 */
router.post('/long', authenticate, async (req: AuthRequest, res) => {
  try {
    const { text, targetLang, sourceLang } = req.body
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'text is required' })
    }
    const translatedText = await translateLongText(text, targetLang || 'en', sourceLang || 'zh-CN')
    res.json({ translatedText })
  } catch (e: any) {
    console.error('[translate/long]', e)
    const isQuota = e instanceof TranslateQuotaError || e?.code === 'QUOTA_EXCEEDED'
      || /limit|quota|429|too many|rate|forbidden|403/i.test(String(e?.message ?? ''))
    res.status(isQuota ? 429 : 500).json({
      error: isQuota ? TRANSLATE_QUOTA_MESSAGE : (e?.message?.slice(0, 120) ?? 'Translation failed'),
      code: isQuota ? 'QUOTA_EXCEEDED' : undefined,
    })
  }
})

export default router
