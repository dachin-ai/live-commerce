import express from 'express'
import path from 'path'
import fs from 'fs'
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth'
import * as scheduler from '../workflow_engine/scheduler'
import * as state from '../workflow_engine/state_manager'
import * as outputCollector from '../workflow_engine/output_collector'
import { initStateDatabase } from '../workflow_engine/state_manager'

const router = express.Router()
router.use(authenticate)
router.use(requireAdmin) // 管理员或经理可访问工作流（与《角色与权限矩阵》一致）

/** POST /api/workflow/trigger - trigger one round (optional: roundId, roundLabel, resumeFromRoleIndex) */
router.post('/trigger', async (req: AuthRequest, res) => {
  try {
    await initStateDatabase()
    const { roundId, roundLabel, resumeFromRoleIndex } = req.body || {}
    const result = await scheduler.runOneRound({
      roundId,
      roundLabel,
      resumeFromRoleIndex:
        typeof resumeFromRoleIndex === 'number' ? Math.max(0, Math.min(5, resumeFromRoleIndex)) : undefined,
    })
    res.json(result)
  } catch (error: any) {
    console.error('工作流触发失败:', error)
    res.status(500).json({ error: error?.message || '工作流触发失败' })
  }
})

/** GET /api/workflow/rounds - list rounds (from state + outputs dir) */
router.get('/rounds', async (req: AuthRequest, res) => {
  try {
    await initStateDatabase()
    const fromState = await state.listRoundIds()
    const fromOutputs = outputCollector.listRoundLabels()
    const roundLabels = Array.from(new Set([...fromState.map((id) => (id.startsWith('round_') ? `第${id.replace('round_', '')}轮迭代` : id)), ...fromOutputs])).sort(
      (a, b) => {
        const nA = parseInt(a.replace(/\D/g, ''), 10) || 0
        const nB = parseInt(b.replace(/\D/g, ''), 10) || 0
        return nB - nA
      }
    )
    const rounds = roundLabels.map((label) => {
      const roundId = label.replace(/^第(\d+)轮迭代$/, 'round_$1')
      return { roundId, roundLabel: label }
    })
    res.json(rounds)
  } catch (error: any) {
    console.error('获取轮次列表失败:', error)
    res.status(500).json({ error: error?.message || '获取轮次列表失败' })
  }
})

/** GET /api/workflow/outputs/file?roundLabel=xxx&path=yyy - 带鉴权读取产出文件内容，避免直接链接导致未登录 */
router.get('/outputs/file', async (req: AuthRequest, res) => {
  try {
    const roundLabel = req.query.roundLabel as string
    const filePath = req.query.path as string
    if (!roundLabel || !filePath) {
      return res.status(400).json({ error: '缺少 roundLabel 或 path' })
    }
    const safePath = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '')
    if (safePath.includes('..')) {
      return res.status(400).json({ error: '非法路径' })
    }
    const dir = outputCollector.getRoundOutputDir(roundLabel)
    const fullPath = path.join(dir, safePath)
    if (!fullPath.startsWith(path.resolve(dir))) {
      return res.status(400).json({ error: '非法路径' })
    }
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
      return res.status(404).json({ error: '文件不存在' })
    }
    const content = fs.readFileSync(fullPath, 'utf-8')
    const ext = path.extname(safePath).toLowerCase()
    if (ext === '.json') {
      return res.json(JSON.parse(content))
    }
    res.json({ content })
  } catch (err: any) {
    if (err?.code === 'ENOENT') return res.status(404).json({ error: '文件不存在' })
    console.error('读取产出文件失败:', err)
    res.status(500).json({ error: err?.message || '读取失败' })
  }
})

/** GET /api/workflow/rounds/:roundId - round detail + manifest (roundId e.g. round_1) */
router.get('/rounds/:roundId', async (req: AuthRequest, res) => {
  try {
    const roundId = req.params.roundId
    const roundLabel = roundId.startsWith('round_') ? `第${roundId.replace('round_', '')}轮迭代` : roundId
    const checkpoints = await state.getCheckpointsByRound(roundId.startsWith('round_') ? roundId : `round_${roundId.replace(/\D/g, '')}`)
    const manifest = outputCollector.readManifest(roundLabel)
    res.json({
      roundId: roundId.startsWith('round_') ? roundId : `round_${roundId.replace(/\D/g, '')}`,
      roundLabel,
      checkpoints,
      manifest: manifest || { roundLabel, entries: [], updatedAt: '' },
    })
  } catch (error: any) {
    console.error('获取轮次详情失败:', error)
    res.status(500).json({ error: error?.message || '获取轮次详情失败' })
  }
})

export default router
