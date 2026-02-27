import express from 'express'
import { dbRun, dbGet, dbAll } from '../db'
import { authenticate, AuthRequest } from '../middleware/auth'
import { clearCache } from '../middleware/cache'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { parseExcelBuffer, TikTokLiveData } from '../utils/excelParser'
import { logRequest } from '../utils/requestLog'

const router = express.Router()

// 所有路由都需要认证
router.use(authenticate)

// 配置文件上传
const upload = multer({
  dest: path.join(__dirname, '../../uploads/data/'),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
  fileFilter: (req, file, cb) => {
    // 只允许Excel文件
    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'application/octet-stream', // 某些浏览器可能返回这个
    ]
    
    if (allowedMimes.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls)$/i)) {
      cb(null, true)
    } else {
      cb(new Error('只支持Excel文件（.xlsx, .xls）'))
    }
  },
})

// 确保上传目录存在
const uploadsDir = path.join(__dirname, '../../uploads/data/')
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}

/**
 * 导入TikTok直播数据
 * POST /api/data-import/tiktok
 */
router.post('/tiktok', upload.single('file'), async (req: AuthRequest, res) => {
  const requestId = crypto.randomUUID()
  const startTime = Date.now()
  try {
    const { storeId } = req.body
    const file = req.file
    const userId = req.user!.userId

    if (!file) {
      return res.status(400).json({ error: '请上传Excel文件' })
    }

    if (!storeId) {
      return res.status(400).json({ error: '请指定店铺ID' })
    }

    // 验证店铺是否存在且属于当前用户
    const store = await dbGet('SELECT * FROM stores WHERE id = ?', [storeId])
    if (!store) {
      return res.status(404).json({ error: '店铺不存在' })
    }

    const { userCanAccessStore } = await import('../utils/storeAccess')
    const canAccess = await userCanAccessStore(userId, storeId, req.user!.role)
    if (!canAccess) {
      return res.status(403).json({ error: '无权访问该店铺' })
    }

    // 验证店铺平台是否为TikTok
    if (store.platform !== 'TikTok' && store.platform !== '抖音') {
      return res.status(400).json({ error: '该接口仅支持TikTok/抖音平台数据导入' })
    }

    // 读取文件并解析
    const fileBuffer = fs.readFileSync(file.path)
    const liveDataList = parseExcelBuffer(fileBuffer)

    if (liveDataList.length === 0) {
      // 删除临时文件
      fs.unlinkSync(file.path)
      return res.status(400).json({ error: 'Excel文件中没有有效数据' })
    }

    // 按 Excel 行中的日期分组，按日写入 stats，使自定义日期区间能精确汇总
    const today = new Date()
    const todayStr =
      `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const byDate = groupRowsByDate(liveDataList)
    const dates = byDate.size > 0 ? Array.from(byDate.keys()).sort() : [todayStr]
    const rowsToProcess = byDate.size > 0 ? byDate : new Map<string, TikTokLiveData[]>([[todayStr, liveDataList]])

    // 删除范围：本批写入的日期区间 + 涉及月份的「月初日」（如 2025-12-01），避免残留整月行导致两倍；支持按周/按几天/整月/季度等任意时间范围上传
    const minDate = dates[0]
    const maxDate = dates[dates.length - 1]
    const monthFirstDays = getMonthFirstDaysInRange(minDate, maxDate)
    const toDelete = await dbAll<{ id: string }>(
      monthFirstDays.length > 0
        ? `SELECT id FROM stats WHERE storeId = ? AND ( (date >= ? AND date <= ?) OR date IN (${monthFirstDays.map(() => '?').join(',')}) )`
        : 'SELECT id FROM stats WHERE storeId = ? AND date >= ? AND date <= ?',
      monthFirstDays.length > 0 ? [storeId, minDate, maxDate, ...monthFirstDays] : [storeId, minDate, maxDate]
    )
    if (toDelete && toDelete.length > 0) {
      const ids = toDelete.map((r) => r.id)
      const placeholders = ids.map(() => '?').join(',')
      await dbRun(`UPDATE data_imports SET statsId = NULL WHERE statsId IN (${placeholders})`, ids)
      await dbRun(
        monthFirstDays.length > 0
          ? `DELETE FROM stats WHERE storeId = ? AND ( (date >= ? AND date <= ?) OR date IN (${monthFirstDays.map(() => '?').join(',')}) )`
          : 'DELETE FROM stats WHERE storeId = ? AND date >= ? AND date <= ?',
        monthFirstDays.length > 0 ? [storeId, minDate, maxDate, ...monthFirstDays] : [storeId, minDate, maxDate]
      )
    }

    let firstStatsId: string | null = null
    const createdAt = new Date().toISOString()

    for (const dateForDb of dates) {
      const rows = rowsToProcess.get(dateForDb)!
      const stats = calculateStats(rows)

      const statsId = crypto.randomUUID()
      if (!firstStatsId) firstStatsId = statsId

      await dbRun(
        `INSERT INTO stats (
          id, storeId, date,
          totalGMV, totalDuration, totalViewers, activeViewers, totalInteractions, 
          totalOrders, completedOrders, 
          averageDailyDuration, rounds, 
          averageConversionRate, averageDurationPerRound, gmvPerHour,
          averageDurationPerDay, roundsPerDay,
          likes, comments, shares, follows,
          productViews, productClicks,
          clickThroughRate, interactionRate,
          createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          statsId,
          storeId,
          dateForDb,
          stats.totalGMV || 0,
          stats.totalDuration || 0,
          stats.totalViewers || 0,
          stats.activeViewers || 0,
          stats.totalInteractions || 0,
          stats.totalOrders || 0,
          stats.completedOrders || 0,
          stats.averageDailyDuration || 0,
          stats.rounds || 0,
          stats.averageConversionRate || 0,
          stats.averageDurationPerRound || 0,
          stats.gmvPerHour || 0,
          stats.averageDurationPerDay || 0,
          stats.roundsPerDay || 0,
          stats.likes || 0,
          stats.comments || 0,
          stats.shares || 0,
          stats.follows || 0,
          stats.productViews || 0,
          stats.productClicks || 0,
          stats.clickThroughRate || 0,
          stats.interactionRate || 0,
          createdAt,
          createdAt,
        ]
      )
    }

    // 同店同日只保留最新一条
    const dupes = await dbAll<{ date: string; cnt: number }>(
      `SELECT date, COUNT(*) as cnt FROM stats
       WHERE storeId = ? AND date >= ? AND date <= ?
       GROUP BY storeId, date HAVING COUNT(*) > 1`,
      [storeId, minDate, maxDate]
    )
    for (const { date } of dupes) {
      const rows = await dbAll<{ id: string }>(
        `SELECT id FROM stats WHERE storeId = ? AND date = ? ORDER BY createdAt DESC`,
        [storeId, date]
      )
      const toKeep = rows[0]
      const idsToDelete = rows.slice(1).map((r) => r.id)
      if (idsToDelete.length === 0) continue
      const placeholders = idsToDelete.map(() => '?').join(',')
      await dbRun(`UPDATE data_imports SET statsId = NULL WHERE statsId IN (${placeholders})`, idsToDelete)
      await dbRun(`DELETE FROM stats WHERE id IN (${placeholders})`, idsToDelete)
    }

    // 保存原始数据记录（关联第一条 stats 便于兼容）
    const importRecordId = crypto.randomUUID()
    await dbRun(
      `INSERT INTO data_imports (id, storeId, platform, fileName, recordCount, statsId, createdAt) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        importRecordId,
        storeId,
        'TikTok',
        file.originalname,
        liveDataList.length,
        firstStatsId,
        createdAt,
      ]
    )

    // 删除临时文件
    fs.unlinkSync(file.path)

    // 清除统计接口缓存，使导入后仪表盘能立即拿到新数据
    clearCache('/api/stats/live')

    // 返回导入结果（stats 为整表汇总摘要，便于前端展示）
    const summaryStats = calculateStats(liveDataList)
    const noDatesParsed = byDate.size === 0
    const message = noDatesParsed
      ? `成功导入 ${liveDataList.length} 条数据。未解析到表格日期（请确认有「日期」列且格式为 YYYY-MM-DD 或 Excel 日期），已按当天一条写入；自定义区间请选包含今天的日期。`
      : `成功导入 ${liveDataList.length} 条直播数据，已按表格日期写入 ${dates.length} 个统计日（${dates.slice(0, 5).join('、')}${dates.length > 5 ? '…' : ''}）`
    logRequest({
      event: 'data-import/tiktok',
      requestId,
      userId,
      storeId: storeId || undefined,
      durationMs: Date.now() - startTime,
    })
    res.json({
      success: true,
      message,
      statsDates: dates,
      stats: {
        id: firstStatsId,
        ...summaryStats,
      },
      importRecord: {
        id: importRecordId,
        fileName: file.originalname,
        recordCount: liveDataList.length,
      },
    })
  } catch (error: any) {
    logRequest({
      event: 'data-import/tiktok',
      requestId,
      userId: req.user?.userId,
      storeId: req.body?.storeId,
      durationMs: Date.now() - startTime,
      error: error?.message || '导入数据失败',
    })
    console.error('导入数据失败:', error)
    // 清理临时文件
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path)
      } catch (e) {
        console.error('清理临时文件失败:', e)
      }
    }
    res.status(500).json({
      error: '导入数据失败',
      message: error?.message || '未知错误',
    })
  }
})

/** [minDate, maxDate] 内涉及月份的「月初日」列表，如 2025-12-02～2025-12-30 → ['2025-12-01']；2025-11-15～2025-12-15 → ['2025-11-01','2025-12-01'] */
function getMonthFirstDaysInRange(minDate: string, maxDate: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(minDate) || !/^\d{4}-\d{2}-\d{2}$/.test(maxDate)) return []
  const from = new Date(minDate + 'T00:00:00')
  const to = new Date(maxDate + 'T00:00:00')
  const out: string[] = []
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1)
  const endFirst = new Date(to.getFullYear(), to.getMonth(), 1)
  while (cursor <= endFirst) {
    const y = cursor.getFullYear()
    const m = String(cursor.getMonth() + 1).padStart(2, '0')
    out.push(`${y}-${m}-01`)
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return out
}

/**
 * 将 Excel 行中的日期解析为 YYYY-MM-DD（用于按日分组）
 * 支持：Excel 序列数字、YYYY-MM-DD、YYYY/MM/DD、YYYY年M月D日、时间字符串取日期部分
 */
function parseRowDateToYYYYMMDD(raw: string | number | undefined): string | null {
  if (raw == null) return null
  // Excel 序列日期（1900-01-01 为 1）
  if (typeof raw === 'number' && !Number.isNaN(raw) && raw > 0) {
    const d = new Date((raw - 25569) * 86400 * 1000)
    if (Number.isNaN(d.getTime())) return null
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  const str = String(raw).trim()
  if (!str) return null
  const part = str.split(/\s+/)[0]
  const mSlash = part.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  const mSlashShort = part.match(/^(\d{4})[-/](\d{1,2})/)
  const mCn = part.match(/^(\d{4})年(\d{1,2})月(\d{1,2})?/)
  if (mSlash) {
    const y = mSlash[1]
    const month = String(parseInt(mSlash[2], 10)).padStart(2, '0')
    const day = String(parseInt(mSlash[3], 10)).padStart(2, '0')
    return `${y}-${month}-${day}`
  }
  if (mSlashShort) {
    const y = mSlashShort[1]
    const month = String(parseInt(mSlashShort[2], 10)).padStart(2, '0')
    return `${y}-${month}-01`
  }
  if (mCn) {
    const y = mCn[1]
    const month = String(parseInt(mCn[2], 10)).padStart(2, '0')
    const day = mCn[3] ? String(parseInt(mCn[3], 10)).padStart(2, '0') : '01'
    return `${y}-${month}-${day}`
  }
  // 兜底：浏览器/Excel 常见格式（如 DD/MM/YYYY、ISO 等）
  const parsed = new Date(part)
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear()
    const m = String(parsed.getMonth() + 1).padStart(2, '0')
    const d = String(parsed.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return null
}

/** 场次唯一键：优先直播开始时间，其次直播ID；无则返回 null（不去重） */
function getSessionDedupKey(row: TikTokLiveData): string | null {
  if (row.startTime != null && String(row.startTime).trim() !== '') return String(row.startTime).trim()
  if (row.liveId != null && String(row.liveId).trim() !== '') return `liveId:${String(row.liveId).trim()}`
  return null
}

/** 按日期分组，同日期内按直播开始时间/直播ID 唯一去重 */
function groupRowsByDate(liveDataList: TikTokLiveData[]): Map<string, TikTokLiveData[]> {
  const map = new Map<string, TikTokLiveData[]>()
  for (const d of liveDataList) {
    const dateStr = parseRowDateToYYYYMMDD(d.date)
    if (!dateStr) continue
    let list = map.get(dateStr)
    if (!list) {
      list = []
      map.set(dateStr, list)
    }
    const key = getSessionDedupKey(d)
    if (key != null && list.some((r) => getSessionDedupKey(r) === key)) continue
    list.push(d)
  }
  return map
}

/**
 * 计算统计数据
 */
function calculateStats(liveDataList: TikTokLiveData[]) {
  const stats = {
    totalGMV: 0,
    totalDuration: 0, // 总时长（小时）
    totalViewers: 0,
    activeViewers: 0, // 峰值观看人数总和
    totalInteractions: 0,
    totalOrders: 0,
    completedOrders: 0,
    rounds: liveDataList.length, // 场次
    averageDailyDuration: 0,
    averageConversionRate: 0,
    averageDurationPerRound: 0,
    gmvPerHour: 0,
    averageDurationPerDay: 0,
    roundsPerDay: 0,
    // 扩展字段：互动细分、商品、转化细分
    likes: 0,
    comments: 0,
    shares: 0,
    follows: 0,
    productViews: 0,
    productClicks: 0,
    clickThroughRate: 0,
    interactionRate: 0,
  }

  // 汇总数据（抓取 Excel 中所有 6 项：GMV、时长、观看、互动、订单、转化率 + 扩展字段）
  let sumConversionRate = 0
  let conversionRateCount = 0
  let sumClickThroughRate = 0
  let clickThroughRateCount = 0
  let sumInteractionRate = 0
  let interactionRateCount = 0
  
  liveDataList.forEach((data) => {
    stats.totalGMV += data.totalGMV || 0
    stats.totalDuration += (data.liveDuration || 0) / 60 // 转换为小时
    stats.totalViewers += data.totalViewers || 0
    stats.activeViewers += data.peakViewers || data.totalViewers || 0
    
    // 总互动：优先用「总互动」列，无则用点赞+评论+分享汇总
    const sumComponents = (data.likes ?? 0) + (data.comments ?? 0) + (data.shares ?? 0)
    const interactions = (data.totalInteractions != null ? data.totalInteractions : sumComponents) || 0
    stats.totalInteractions += interactions
    
    // 互动细分
    stats.likes += data.likes || 0
    stats.comments += data.comments || 0
    stats.shares += data.shares || 0
    stats.follows += data.follows || 0
    
    // 商品相关
    stats.productViews += data.productViews || 0
    stats.productClicks += data.productClicks || 0
    
    stats.totalOrders += data.totalOrders || 0
    stats.completedOrders += data.completedOrders || 0
    
    // 若 Excel 有「转化率」列则抓取并参与聚合
    if (data.conversionRate != null && !Number.isNaN(Number(data.conversionRate))) {
      sumConversionRate += Number(data.conversionRate)
      conversionRateCount += 1
    }
    
    // 点击率和互动率
    if (data.clickThroughRate != null && !Number.isNaN(Number(data.clickThroughRate))) {
      sumClickThroughRate += Number(data.clickThroughRate)
      clickThroughRateCount += 1
    }
    if (data.interactionRate != null && !Number.isNaN(Number(data.interactionRate))) {
      sumInteractionRate += Number(data.interactionRate)
      interactionRateCount += 1
    }
  })

  // 计算平均值
  if (stats.rounds > 0) {
    stats.averageDurationPerRound = stats.totalDuration / stats.rounds
    if (conversionRateCount > 0) {
      stats.averageConversionRate = sumConversionRate / conversionRateCount
    } else {
      stats.averageConversionRate =
        stats.totalViewers > 0
          ? (stats.completedOrders / stats.totalViewers) * 100
          : 0
    }
    // 计算平均点击率和互动率
    if (clickThroughRateCount > 0) {
      stats.clickThroughRate = sumClickThroughRate / clickThroughRateCount
    }
    if (interactionRateCount > 0) {
      stats.interactionRate = sumInteractionRate / interactionRateCount
    }
  }

  // 计算每小时GMV
  if (stats.totalDuration > 0) {
    stats.gmvPerHour = stats.totalGMV / stats.totalDuration
  }

  // 计算日均数据（假设数据覆盖的天数）
  const uniqueDates = new Set(
    liveDataList
      .map((d) => d.date)
      .filter((d) => d)
      .map((d) => d!.split(' ')[0]) // 只取日期部分
  )
  const days = Math.max(1, uniqueDates.size || 1) // 至少1天

  stats.averageDurationPerDay = stats.totalDuration / days
  stats.roundsPerDay = stats.rounds / days
  stats.averageDailyDuration = stats.averageDurationPerDay

  return stats
}

/**
 * 按店铺维度导出已上传的运营数据（CSV 或 Excel）
 * GET /api/data-import/export?format=csv|xlsx&storeId= (storeId 可选；管理员不传则导出全部，用户仅能导出自己权限下的店铺)
 * 权限：管理员看全部，普通用户仅看自己名下的店铺。
 */
router.get('/export', async (req: AuthRequest, res) => {
  try {
    const { format = 'csv', storeId: queryStoreId } = req.query
    const userId = req.user!.userId
    const isAdmin = req.user!.role === 'admin'

    const acceptFormat = String(format).toLowerCase() === 'xlsx' ? 'xlsx' : 'csv'

    let sql = `
      SELECT 
        s.id AS storeId,
        s.name AS storeName,
        st.date,
        st.totalGMV,
        st.totalDuration,
        st.totalViewers,
        st.totalOrders,
        st.totalInteractions,
        COALESCE(st.rounds, 0) AS rounds,
        COALESCE(st.averageConversionRate, 0) AS averageConversionRate,
        COALESCE(st.gmvPerHour, 0) AS gmvPerHour,
        st.createdAt AS statsCreatedAt
      FROM stats st
      INNER JOIN stores s ON st.storeId = s.id
      WHERE st.date IS NOT NULL
    `
    const params: any[] = []
    if (!isAdmin) {
      sql += ' AND (s.userId = ? OR s.id IN (SELECT storeId FROM user_store_access WHERE userId = ?))'
      params.push(userId, userId)
    }
    if (queryStoreId && typeof queryStoreId === 'string' && queryStoreId.trim()) {
      sql += ' AND st.storeId = ?'
      params.push(queryStoreId.trim())
    }
    sql += ' ORDER BY s.name, st.date ASC'

    const rows = await dbAll<Record<string, unknown>>(sql, params)
    if (rows.length === 0) {
      return res.status(404).json({ error: '当前无符合条件的数据可导出' })
    }

    const filenameBase = `运营数据-按店铺-${new Date().toISOString().slice(0, 10)}`
    if (acceptFormat === 'csv') {
      const header = ['店铺ID', '店铺名称', '日期', 'GMV', '直播时长(h)', '观看', '订单', '互动', '场次', '转化率(%)', '时均GMV', '录入时间']
      const escapeCsv = (v: unknown) => {
        const s = v == null ? '' : String(v)
        return /[,"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
      }
      const lines = [header.map(escapeCsv).join(',')]
      for (const r of rows) {
        lines.push([
          escapeCsv(r.storeId),
          escapeCsv(r.storeName),
          escapeCsv(r.date),
          escapeCsv(r.totalGMV),
          escapeCsv(r.totalDuration),
          escapeCsv(r.totalViewers),
          escapeCsv(r.totalOrders),
          escapeCsv(r.totalInteractions),
          escapeCsv(r.rounds),
          escapeCsv(r.averageConversionRate),
          escapeCsv(r.gmvPerHour),
          escapeCsv(r.statsCreatedAt),
        ].join(','))
      }
      const csv = '\uFEFF' + lines.join('\r\n')
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filenameBase)}.csv"`)
      res.send(csv)
      return
    }

    const XLSX = require('xlsx') as typeof import('xlsx')
    const sheetData = rows.map((r) => ({
      '店铺ID': r.storeId,
      '店铺名称': r.storeName,
      '日期': r.date,
      'GMV': r.totalGMV,
      '直播时长(h)': r.totalDuration,
      '观看': r.totalViewers,
      '订单': r.totalOrders,
      '互动': r.totalInteractions,
      '场次': r.rounds,
      '转化率(%)': r.averageConversionRate,
      '时均GMV': r.gmvPerHour,
      '录入时间': r.statsCreatedAt,
    }))
    const ws = XLSX.utils.json_to_sheet(sheetData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '运营数据')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filenameBase)}.xlsx"`)
    res.send(buf)
  } catch (error) {
    console.error('导出失败:', error)
    res.status(500).json({ error: '导出失败' })
  }
})

/**
 * 获取导入历史记录
 * GET /api/data-import/history
 */
router.get('/history', async (req: AuthRequest, res) => {
  try {
    const { storeId } = req.query
    const userId = req.user!.userId
    const isAdmin = req.user!.role === 'admin'

    let query = `
      SELECT di.*, s.name as storeName 
      FROM data_imports di
      LEFT JOIN stores s ON di.storeId = s.id
      WHERE 1=1
    `
    const params: any[] = []

    if (!isAdmin) {
      query += ' AND (s.userId = ? OR s.id IN (SELECT storeId FROM user_store_access WHERE userId = ?))'
      params.push(userId, userId)
    }

    if (storeId) {
      query += ' AND di.storeId = ?'
      params.push(storeId as string)
    }

    query += ' ORDER BY di.createdAt DESC LIMIT 50'

    const imports = await dbAll(query, params)
    res.json(imports)
  } catch (error) {
    console.error('获取导入历史失败:', error)
    res.status(500).json({ error: '获取导入历史失败' })
  }
})

export default router
