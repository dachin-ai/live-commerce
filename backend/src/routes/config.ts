/**
 * 配置接口：话术规则等可配置项
 * 供前端或运维通过 API 读取/更新配置（配置写入 config/script-rules/*.json）
 */

import express from 'express'
import {
  loadPlatformCompliance,
  loadAudienceKeywords,
  loadCategoryPractices,
  savePlatformCompliance,
  saveAudienceKeywords,
  saveCategoryPractices,
  getConfigDir,
  type PlatformComplianceConfig,
  type AudienceKeywordsConfig,
  type CategoryPracticesConfig,
} from '../rules/loadScriptRulesConfig'
import { authenticate, AuthRequest, requireAdmin } from '../middleware/auth'

const router = express.Router()

router.use(authenticate)

/** GET /api/config/script-rules：返回当前生效的话术规则配置（用于配置工具展示） */
router.get('/script-rules', (req, res) => {
  try {
    const platformCompliance = loadPlatformCompliance()
    const audienceKeywords = loadAudienceKeywords()
    const categoryPractices = loadCategoryPractices()
    res.json({
      configDir: getConfigDir(),
      platformCompliance: platformCompliance ?? undefined,
      audienceKeywords: audienceKeywords ?? undefined,
      categoryPractices: categoryPractices ?? undefined,
      note: '未出现的键表示使用功能代码内置默认值。PUT 可写回 config/script-rules/*.json。',
    })
  } catch (e) {
    console.error('读取话术规则配置失败:', e)
    res.status(500).json({ error: '读取配置失败' })
  }
})

/** PUT /api/config/script-rules：更新话术规则配置（仅管理员；写入 JSON 文件，重启后或下次加载时生效） */
router.put('/script-rules', requireAdmin, (req: AuthRequest, res) => {
  try {
    const body = req.body as {
      platformCompliance?: PlatformComplianceConfig
      audienceKeywords?: AudienceKeywordsConfig
      categoryPractices?: CategoryPracticesConfig
    }
    const updated: string[] = []
    if (body.platformCompliance != null) {
      if (savePlatformCompliance(body.platformCompliance)) updated.push('platformCompliance')
    }
    if (body.audienceKeywords != null) {
      if (saveAudienceKeywords(body.audienceKeywords)) updated.push('audienceKeywords')
    }
    if (body.categoryPractices != null) {
      if (saveCategoryPractices(body.categoryPractices)) updated.push('categoryPractices')
    }
    res.json({
      ok: true,
      updated,
      note: '配置已写入 config/script-rules/。部分规则在下次请求时生效，建议重启后端使全部生效。',
    })
  } catch (e) {
    console.error('写入话术规则配置失败:', e)
    res.status(500).json({ error: '写入配置失败' })
  }
})

export default router
