import express from 'express'
import { authenticate, AuthRequest } from '../middleware/auth'
import { dbAll, dbRun, dbGet, dbTransaction } from '../db'
import { BadRequestError } from '../utils/errors'
import { randomUUID as uuid } from 'crypto'
import { clearCache } from '../middleware/cache'

const router = express.Router()
router.use(authenticate)

// ─── 1. 直播场次深度分析 ─────────────────────────────────────────────
// GET /api/tt-bi/live-performance
router.get('/live-performance', async (req: AuthRequest, res, next) => {
  try {
    const { storeId, dateFrom, dateTo, compareDateFrom, compareDateTo } = req.query as Record<string, string>
    if (!storeId) throw new BadRequestError('请选择店铺')

    const buildFilter = (from?: string, to?: string) => {
      const c = ['storeId = ?']; const p: unknown[] = [storeId]
      // 使用场次级 DATE(startTime) 过滤（非批次级 dateFrom/dateTo）
      if (from) { c.push('DATE(startTime) >= ?'); p.push(from) }
      if (to) { c.push('DATE(startTime) <= ?'); p.push(to) }
      return { where: c.join(' AND '), params: p }
    }
    const cur = buildFilter(dateFrom, dateTo)
    const cmp = compareDateFrom ? buildFilter(compareDateFrom, compareDateTo) : null

    const querySummary = (where: string, params: unknown[]) =>
      dbGet<Record<string, number>>(
        `SELECT COUNT(*) AS totalSessions,
          COALESCE(SUM(grossRevenue),0) AS totalGmv,
          COALESCE(SUM(itemsSold),0) AS totalItemsSold,
          COALESCE(SUM(ordersPaid),0) AS totalOrders,
          COALESCE(SUM(views),0) AS totalViews,
          COALESCE(SUM(viewers),0) AS totalViewers,
          COALESCE(SUM(likes),0) AS totalLikes,
          COALESCE(SUM(comments),0) AS totalComments,
          COALESCE(SUM(shares),0) AS totalShares,
          COALESCE(SUM(newFollowers),0) AS totalNewFollowers,
          COALESCE(AVG(
            CASE WHEN gmvPerHour > 0 THEN gmvPerHour
                 WHEN durationSeconds > 0 THEN ROUND(grossRevenue / (durationSeconds / 3600.0))
                 ELSE NULL END
          ), 0) AS avgGmvPerHour,
          COALESCE(AVG(
            CASE WHEN orderCvr > 0 THEN orderCvr
                 WHEN COALESCE(viewers,0) > 0 THEN ROUND(ordersPaid * 100.0 / viewers, 4)
                 WHEN COALESCE(views,0) > 0 THEN ROUND(ordersPaid * 100.0 / views, 4)
                 ELSE NULL END
          ), 0) AS avgOrderCvr,
          COALESCE(AVG(
            CASE WHEN engagementRate > 0 THEN engagementRate
                 WHEN COALESCE(views,0) > 0 THEN ROUND((COALESCE(likes,0)+COALESCE(comments,0)+COALESCE(shares,0)) * 100.0 / views, 4)
                 ELSE NULL END
          ), 0) AS avgEngagementRate,
          COALESCE(AVG(
            CASE WHEN ctr > 0 THEN ctr
                 WHEN COALESCE(productImpressions,0) > 0 AND COALESCE(productClicks,0) > 0
                      THEN ROUND(productClicks * 100.0 / productImpressions, 4)
                 ELSE NULL END
          ), 0) AS avgCtr,
          COALESCE(SUM(durationSeconds),0) AS totalDurationSec
        FROM tt_live_sessions WHERE ${where}`, params
      )

    const queryTrend = (where: string, params: unknown[]) =>
      dbAll<Record<string, unknown>>(
        `SELECT DATE(startTime) AS date, COUNT(*) AS sessions, SUM(grossRevenue) AS gmv,
          SUM(itemsSold) AS items, SUM(views) AS views,
          AVG(
            CASE WHEN gmvPerHour > 0 THEN gmvPerHour
                 WHEN durationSeconds > 0 THEN ROUND(grossRevenue / (durationSeconds / 3600.0))
                 ELSE NULL END
          ) AS avgGmvPerHour,
          AVG(
            CASE WHEN orderCvr > 0 THEN orderCvr
                 WHEN COALESCE(viewers,0) > 0 THEN ROUND(ordersPaid * 100.0 / viewers, 4)
                 WHEN COALESCE(views,0) > 0 THEN ROUND(ordersPaid * 100.0 / views, 4)
                 ELSE NULL END
          ) AS avgCvr
        FROM tt_live_sessions WHERE ${where}
        GROUP BY DATE(startTime) ORDER BY DATE(startTime)`, params
      )

    const [summary, compareSummary, topSessions, dailyTrend, compareDailyTrend] = await Promise.all([
      querySummary(cur.where, cur.params),
      cmp ? querySummary(cmp.where, cmp.params) : Promise.resolve(null),
      dbAll<Record<string, unknown>>(
        `SELECT name, startTime, grossRevenue, directGmv, itemsSold, ordersPaid,
          views, viewers, peakViewers, likes, comments, shares, durationSeconds,
          productImpressions, productClicks,
          CASE WHEN gmvPerHour > 0 THEN gmvPerHour
               WHEN durationSeconds > 0 THEN ROUND(grossRevenue / (durationSeconds / 3600.0))
               ELSE 0 END AS gmvPerHour,
          CASE WHEN orderCvr > 0 THEN orderCvr
               WHEN COALESCE(viewers,0) > 0 THEN ROUND(ordersPaid * 100.0 / viewers, 4)
               WHEN COALESCE(views,0) > 0 THEN ROUND(ordersPaid * 100.0 / views, 4)
               ELSE 0 END AS orderCvr,
          CASE WHEN engagementRate > 0 THEN engagementRate
               WHEN COALESCE(views,0) > 0 THEN ROUND((COALESCE(likes,0)+COALESCE(comments,0)+COALESCE(shares,0)) * 100.0 / views, 4)
               ELSE 0 END AS engagementRate,
          CASE WHEN ctr > 0 THEN ctr
               WHEN COALESCE(productImpressions,0) > 0 AND COALESCE(productClicks,0) > 0
                    THEN ROUND(productClicks * 100.0 / productImpressions, 4)
               ELSE 0 END AS ctr
        FROM tt_live_sessions WHERE ${cur.where}
        ORDER BY grossRevenue DESC LIMIT 50`, cur.params
      ),
      queryTrend(cur.where, cur.params),
      cmp ? queryTrend(cmp.where, cmp.params) : Promise.resolve([]),
    ])

    res.json({ summary, compareSummary, topSessions, dailyTrend, compareDailyTrend })
  } catch (error) { next(error) }
})

// ─── 2. 广告计划矩阵分析 ─────────────────────────────────────────────
// GET /api/tt-bi/ad-matrix
router.get('/ad-matrix', async (req: AuthRequest, res, next) => {
  try {
    const { storeId, dateFrom, dateTo, compareDateFrom, compareDateTo } = req.query as Record<string, string>
    if (!storeId) throw new BadRequestError('请选择店铺')

    const buildFilter = (from?: string, to?: string) => {
      const c = ['storeId = ?']; const p: unknown[] = [storeId]
      if (from) { c.push('dateTo >= ?'); p.push(from) }
      if (to) { c.push('dateFrom <= ?'); p.push(to) }
      return { where: c.join(' AND '), params: p }
    }
    const cur = buildFilter(dateFrom, dateTo)
    const cmp = compareDateFrom ? buildFilter(compareDateFrom, compareDateTo) : null
    const where = cur.where
    const params = cur.params

    const queryOverall = (w: string, p: unknown[]) =>
      dbGet<Record<string, number>>(
        `SELECT COALESCE(SUM(cost),0) AS totalCost,
          COALESCE(SUM(grossRevenue),0) AS totalRevenue,
          COALESCE(SUM(skuOrders),0) AS totalOrders,
          CASE WHEN SUM(cost)>0 THEN ROUND(SUM(grossRevenue)/SUM(cost),2) ELSE 0 END AS overallRoi,
          COUNT(*) AS totalPlans
        FROM tt_ad_sessions WHERE ${w}`, p
      )

    // 按广告计划分组
    const byCampaign = await dbAll<Record<string, unknown>>(
      `SELECT campaignName,
        SUM(cost) AS cost, SUM(grossRevenue) AS revenue,
        SUM(skuOrders) AS orders,
        CASE WHEN SUM(cost)>0 THEN ROUND(SUM(grossRevenue)/SUM(cost),2) ELSE 0 END AS roi,
        SUM(liveViews) AS views, SUM(liveFollows) AS follows,
        COUNT(*) AS planCount
      FROM tt_ad_sessions WHERE ${where}
      GROUP BY campaignName ORDER BY cost DESC LIMIT 50`, params
    )

    // 按直播间分组（定位哪个直播间的投放效率最高）
    const byLive = await dbAll<Record<string, unknown>>(
      `SELECT liveName,
        SUM(cost) AS cost, SUM(grossRevenue) AS revenue,
        SUM(skuOrders) AS orders,
        CASE WHEN SUM(cost)>0 THEN ROUND(SUM(grossRevenue)/SUM(cost),2) ELSE 0 END AS roi,
        COUNT(*) AS planCount
      FROM tt_ad_sessions WHERE ${where}
      GROUP BY liveName ORDER BY revenue DESC LIMIT 30`, params
    )

    // 按 status 分组（定位不同状态的计划分布）
    const byStatus = await dbAll<Record<string, unknown>>(
      `SELECT status, COUNT(*) AS count, SUM(cost) AS cost, SUM(grossRevenue) AS revenue
      FROM tt_ad_sessions WHERE ${where}
      GROUP BY status ORDER BY cost DESC`, params
    )

    const [overall, compareOverall] = await Promise.all([
      queryOverall(cur.where, cur.params),
      cmp ? queryOverall(cmp.where, cmp.params) : Promise.resolve(null),
    ])

    res.json({ overall, compareOverall, byCampaign, byLive, byStatus })
  } catch (error) { next(error) }
})

// ─── 3. 商品雷达（周环比异动） ────────────────────────────────────────
// GET /api/tt-bi/product-radar
router.get('/product-radar', async (req: AuthRequest, res, next) => {
  try {
    const { storeId, currentWeekFrom, currentWeekTo, prevWeekFrom, prevWeekTo } = req.query as Record<string, string>
    if (!storeId) throw new BadRequestError('请选择店铺')

    // 如果没有传日期范围，使用默认近14天拆成两段
    let cwFrom = currentWeekFrom, cwTo = currentWeekTo
    let pwFrom = prevWeekFrom, pwTo = prevWeekTo
    if (!cwFrom || !cwTo || !pwFrom || !pwTo) {
      const now = new Date()
      // 使用本地时区格式，避免 UTC 凌晨时 toISOString() 返回昨天
      cwTo   = now.toLocaleDateString('sv-SE')
      const d7 = new Date(now); d7.setDate(d7.getDate() - 7)
      cwFrom = d7.toLocaleDateString('sv-SE')
      const prev = new Date(d7); prev.setDate(prev.getDate() - 1)
      pwTo   = prev.toLocaleDateString('sv-SE')
      const d14 = new Date(now); d14.setDate(d14.getDate() - 14)
      pwFrom = d14.toLocaleDateString('sv-SE')
    }

    // 本周数据 (OVERLAP)
    const currentWeek = await dbAll<Record<string, unknown>>(
      `SELECT productId, productName,
        SUM(views) AS views, SUM(clicks) AS clicks,
        SUM(skuOrders) AS orders, SUM(gmv) AS gmv,
        SUM(addToCartUsers) AS carts
      FROM tt_store_products
      WHERE storeId = ? AND dateTo >= ? AND dateFrom <= ?
      GROUP BY productId`, [storeId, cwFrom, cwTo]
    )

    // 上周数据 (OVERLAP)
    const prevWeek = await dbAll<Record<string, unknown>>(
      `SELECT productId,
        SUM(views) AS views, SUM(clicks) AS clicks,
        SUM(skuOrders) AS orders, SUM(gmv) AS gmv,
        SUM(addToCartUsers) AS carts
      FROM tt_store_products
      WHERE storeId = ? AND dateTo >= ? AND dateFrom <= ?
      GROUP BY productId`, [storeId, pwFrom, pwTo]
    )

    const prevMap = new Map(prevWeek.map(p => [p.productId, p]))

    const r = (n: number | null) => n !== null ? Math.round(n * 100) / 100 : null
    const pct = (cur: number, prev: number) => prev > 0 ? ((cur - prev) / prev) * 100 : null

    const radar = currentWeek.map((cur: any) => {
      const prev: any = prevMap.get(cur.productId) || { views: 0, clicks: 0, orders: 0, gmv: 0, carts: 0 }
      const cGmv = Number(cur.gmv), pGmv = Number(prev.gmv)
      const cOrders = Number(cur.orders), pOrders = Number(prev.orders)
      const cViews = Number(cur.views), pViews = Number(prev.views)
      const cClicks = Number(cur.clicks), pClicks = Number(prev.clicks)
      const cCarts = Number(cur.carts), pCarts = Number(prev.carts)
      return {
        productId: cur.productId,
        productName: cur.productName,
        // 当期绝对值
        currentGmv: cGmv, currentOrders: cOrders, currentViews: cViews,
        currentClicks: cClicks, currentCarts: cCarts,
        // 对比期绝对值（供 PeriodCompareTable 使用）
        prevGmv: pGmv, prevOrders: pOrders, prevViews: pViews,
        prevClicks: pClicks, prevCarts: pCarts,
        // 环比变化率
        gmvChange: r(pct(cGmv, pGmv)), ordersChange: r(pct(cOrders, pOrders)),
        viewsChange: r(pct(cViews, pViews)), clicksChange: r(pct(cClicks, pClicks)),
        cartsChange: r(pct(cCarts, pCarts)),
      }
    })

    // 排序：突涨 Top5 / 突跌 Top5
    const rising = [...radar].filter(r => r.gmvChange !== null).sort((a, b) => (b.gmvChange ?? 0) - (a.gmvChange ?? 0)).slice(0, 10)
    const falling = [...radar].filter(r => r.gmvChange !== null).sort((a, b) => (a.gmvChange ?? 0) - (b.gmvChange ?? 0)).slice(0, 10)

    res.json({
      period: { current: { from: cwFrom, to: cwTo }, previous: { from: pwFrom, to: pwTo } },
      rising,
      falling,
      all: radar
    })
  } catch (error) { next(error) }
})

// ─── 4. 目标管理 ─────────────────────────────────────────────────────
// GET /api/tt-bi/targets?storeId=...&month=YYYY-MM
router.get('/targets', async (req: AuthRequest, res, next) => {
  try {
    const { storeId, month } = req.query as Record<string, string>
    if (!storeId) throw new BadRequestError('请选择店铺')
    const conds = ['storeId = ?']
    const params: unknown[] = [storeId]
    if (month) { conds.push('month = ?'); params.push(month) }
    const rows = await dbAll<Record<string, unknown>>(
      `SELECT * FROM tt_targets WHERE ${conds.join(' AND ')} ORDER BY month DESC, metric`, params
    )
    res.json(rows)
  } catch (error) { next(error) }
})

// POST /api/tt-bi/targets — 保存/更新目标
router.post('/targets', async (req: AuthRequest, res, next) => {
  try {
    const { storeId, month, metric, targetValue, note } = req.body
    if (!storeId || !month || !metric) throw new BadRequestError('缺少必填参数')

    // UPSERT：与 generate 端点保持一致，消除并发竞态
    const id = uuid()
    await dbRun(
      `INSERT INTO tt_targets (id, storeId, month, metric, targetValue, note, isAiGenerated)
       VALUES (?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(storeId, month, metric) DO UPDATE
       SET targetValue = excluded.targetValue, note = excluded.note, isAiGenerated = 0`,
      [id, storeId, month, metric, targetValue, note || null]
    )

    // 清除后端 LRU 缓存，确保前端 invalidateQueries 能拿到最新数据
    clearCache('/api/tt-bi/targets')
    clearCache('/api/tt-bi/results')
    res.json({ id, upserted: true })
  } catch (error) { next(error) }
})

// POST /api/tt-bi/targets/generate — AI 一键生成基准目标（质效双驱动）
router.post('/targets/generate', async (req: AuthRequest, res, next) => {
  try {
    const { storeId, month } = req.body
    if (!storeId || !month) throw new BadRequestError('缺少必填参数')

    // 取过去60天历史数据，提取质量指标（比30天更稳定）
    const liveStats = await dbGet<Record<string, number>>(
      `SELECT
        COALESCE(SUM(grossRevenue),0) AS totalGmv,
        COALESCE(SUM(ordersPaid),0) AS totalOrders,
        COUNT(*) AS sessions,
        COALESCE(AVG(
          CASE
            WHEN orderCvr > 0 THEN orderCvr
            WHEN COALESCE(viewers,0) > 0 THEN ROUND(ordersPaid * 100.0 / viewers, 4)
            WHEN COALESCE(views,0) > 0 THEN ROUND(ordersPaid * 100.0 / views, 4)
            ELSE NULL
          END
        ), 0) AS avgCvr
      FROM tt_live_sessions
      WHERE storeId = ? AND DATE(startTime) >= date(?, '-60 days')`,
      [storeId, month + '-01']
    )

    const adStats = await dbGet<Record<string, number>>(
      `SELECT
        COALESCE(SUM(cost),0) AS totalCost,
        COALESCE(SUM(grossRevenue),0) AS totalAdRevenue
      FROM tt_ad_sessions
      WHERE storeId = ? AND dateFrom >= date(?, '-60 days')`,
      [storeId, month + '-01']
    )

    // 近期高位基准：取前25%场次的场均GMV（已证明可达的高位，而非被低效场次拉低的均值）
    const peakStats = await dbGet<Record<string, number>>(
      `SELECT COALESCE(AVG(grossRevenue), 0) AS p75GmvPerSession
       FROM (
         SELECT grossRevenue FROM tt_live_sessions
         WHERE storeId = ? AND DATE(startTime) >= date(?, '-60 days')
         ORDER BY grossRevenue DESC
         LIMIT MAX(1, CAST((
           SELECT COUNT(*) * 0.25 FROM tt_live_sessions
           WHERE storeId = ? AND DATE(startTime) >= date(?, '-60 days')
         ) AS INT))
       )`,
      [storeId, month + '-01', storeId, month + '-01']
    )

    // ─── 基准指标提取 ──────────────────────────────────────────────────
    const sessions         = liveStats?.sessions ?? 0
    const totalGmv         = liveStats?.totalGmv ?? 0
    const totalOrders      = liveStats?.totalOrders ?? 0
    const avgCvr           = +(liveStats?.avgCvr ?? 0).toFixed(4)
    const avgGmvPerSession = sessions > 0 ? Math.round(totalGmv / sessions) : 0
    const p75GmvPerSession = Math.round(peakStats?.p75GmvPerSession ?? avgGmvPerSession)
    const totalAdCost      = adStats?.totalCost ?? 0
    const totalAdRevenue   = adStats?.totalAdRevenue ?? 0
    const historicalRoi    = totalAdCost > 0 ? +(totalAdRevenue / totalAdCost).toFixed(2) : 0

    // ─── 目标算法：边际效益递减 + 边界约束模型 ─────────────────────
    // 同一绝对改善量在不同基数下难度不同；越接近极限值，边际成本越高

    // 场次目标：有人力天花板（月≤60场），频次越高增速应越保守
    const SESSION_CAP = 60
    const sessionRate = sessions < 5  ? 0.20 :   // 极低频，增长空间大
                        sessions < 10 ? 0.15 :
                        sessions < 20 ? 0.10 :
                        sessions < 30 ? 0.05 : 0.03  // 高频，趋近人力天花板
    const targetSessions = Math.min(SESSION_CAP, Math.max(1, Math.round(sessions * (1 + sessionRate))))
    const nearSessionCap = targetSessions >= SESSION_CAP * 0.9

    // 场均GMV效率目标：以近期高位（前25%场次均值）为优先基准
    // 高位场次="你已证明能做到的"，目标是把优秀表现变为常态，而非从低点出发
    const hasSignificantPeak = p75GmvPerSession > avgGmvPerSession * 1.10
    const baseGmvPerSession  = hasSignificantPeak ? p75GmvPerSession : avgGmvPerSession
    const gmvRate = baseGmvPerSession < 10000  ? 0.10 :
                    baseGmvPerSession < 50000  ? 0.07 :
                    baseGmvPerSession < 200000 ? 0.05 :
                    baseGmvPerSession < 500000 ? 0.03 : 0.02
    // 已切换到高位基准时，在高位之上的进一步改善率收窄至2%（不能要求每次都超越最好表现）
    const effectiveGmvRate   = hasSignificantPeak ? Math.min(gmvRate, 0.02) : gmvRate
    const targetGmvPerSession = Math.round(baseGmvPerSession * (1 + effectiveGmvRate))
    const targetGmv           = targetSessions * targetGmvPerSession  // 推导，非独立增量

    // CVR目标：自然天花板5%，间距收敛模型
    const CVR_CEILING = 5.0
    const cvrGap   = Math.max(0, CVR_CEILING - avgCvr)
    const cvrAlpha = avgCvr < 1 ? 0.15 :
                     avgCvr < 2 ? 0.10 :
                     avgCvr < 3 ? 0.07 :
                     avgCvr < 4 ? 0.05 : 0.03
    const targetCvr    = +(Math.min(CVR_CEILING, avgCvr + cvrGap * cvrAlpha)).toFixed(2)
    const targetOrders = Math.round(totalOrders * (1 + cvrAlpha))

    // ROI目标：绝对值+0.10，极高ROI（>5）建议降门槛扩量
    const ROI_FLOOR = 1.5
    const roiOverSaturated = historicalRoi > 5.0
    const targetRoi = roiOverSaturated
      ? +Math.max(ROI_FLOOR, historicalRoi * 0.95).toFixed(2)
      : +Math.max(ROI_FLOOR, historicalRoi + 0.10).toFixed(2)

    // 广告花费：从ROI目标反推预算上限
    const adRevenueRatio = totalGmv > 0 && totalAdRevenue > 0 ? totalAdRevenue / totalGmv : 0.2
    const targetAdSpend  = targetRoi > 0
      ? Math.round(targetGmv * adRevenueRatio / targetRoi)
      : Math.round(totalAdCost * 1.05)

    const N = (n: number) => n.toLocaleString('zh-CN')
    const targetList = [
      { metric: 'gmv',          value: targetGmv,
        note: `分解：${targetSessions}场 × 场均¥${N(targetGmvPerSession)}${hasSignificantPeak ? `（高位基准¥${N(p75GmvPerSession)}+${(effectiveGmvRate*100).toFixed(0)}%）` : `（均値基准+${(effectiveGmvRate*100).toFixed(0)}%）`}` },
      { metric: 'orders',       value: targetOrders,
        note: `CVR间距收敛：目标${targetCvr}%（当前${avgCvr.toFixed(2)}%，收敛天花板${CVR_CEILING}%）` },
      { metric: 'sessions',     value: targetSessions,
        note: `增速${(sessionRate*100).toFixed(0)}%（当前${sessions}场）${nearSessionCap ? '，⚠️接近月度天花板60场' : '，可手动调整'}` },
      { metric: 'gmvPerSession', value: targetGmvPerSession,
        note: hasSignificantPeak
          ? `高位基准¥${N(p75GmvPerSession)}（前25%场次均値）+${(effectiveGmvRate*100).toFixed(0)}%，全均値¥${N(avgGmvPerSession)}，目标是把优秀表现变为常态`
          : `均値基准¥${N(avgGmvPerSession)}+${(effectiveGmvRate*100).toFixed(0)}%（高位与均値接近，表现稳定）` },
      { metric: 'cvr',          value: targetCvr,
        note: `间距收敛至天花板${CVR_CEILING}%，当前${avgCvr.toFixed(2)}%，本期收敛${(cvrAlpha*100).toFixed(0)}%间距` },
      { metric: 'adRoi',        value: targetRoi,
        note: roiOverSaturated
          ? `历史ROI${historicalRoi.toFixed(2)}>5，投放量严重不足，建议降低门槛扩大曝光`
          : `历史${historicalRoi.toFixed(2)}基础上+0.10（绝对值，避免高基数虚高）` },
      { metric: 'adSpend',      value: targetAdSpend,
        note: `ROI≥${targetRoi}反推最大预算（广告GMV贡献率${(adRevenueRatio*100).toFixed(0)}%）` },
    ]

    // 事务化批量 UPSERT —— 消除 7×2 串行 I/O，中途失败时全部回滚
    const results: any[] = []
    await dbTransaction(async () => {
      for (const t of targetList) {
        // UPSERT：冲突时更新，无冲突时插入
        const id = uuid()
        await dbRun(
          `INSERT INTO tt_targets (id, storeId, month, metric, targetValue, isAiGenerated, note)
           VALUES (?, ?, ?, ?, ?, 1, ?)
           ON CONFLICT(storeId, month, metric) DO UPDATE
           SET targetValue = excluded.targetValue, isAiGenerated = 1, note = excluded.note`,
          [id, storeId, month, t.metric, t.value, t.note]
        )
        results.push({ metric: t.metric, value: t.value, note: t.note })
      }
    })

    // 清除后端 LRU 缓存
    clearCache('/api/tt-bi/targets')
    clearCache('/api/tt-bi/results')
    res.json({ generated: results })
  } catch (error) { next(error) }
})

// ─── 5. 结果复盘概览 ─────────────────────────────────────────────────
// GET /api/tt-bi/results-overview
router.get('/results-overview', async (req: AuthRequest, res, next) => {
  try {
    const { storeId, month } = req.query as Record<string, string>
    if (!storeId) throw new BadRequestError('请选择店铺')

    const targetMonth = month || new Date().toLocaleDateString('sv-SE').slice(0, 7)

    // 目标数据
    const targets = await dbAll<Record<string, unknown>>(
      `SELECT metric, targetValue, note, isAiGenerated FROM tt_targets WHERE storeId = ? AND month = ?`,
      [storeId, targetMonth]
    )

    // 当月实际数据
    const monthStart = targetMonth + '-01'
    // 正确计算本月最后一天（避免硬编码 -31 导致 2 月数据越界）
    const [my, mm] = targetMonth.split('-').map(Number)
    const monthEnd = new Date(my, mm, 0).toLocaleDateString('sv-SE')  // 下个月第 0 天 = 本月最后一天

    const liveActual = await dbGet<Record<string, number>>(
      `SELECT
        COALESCE(SUM(grossRevenue),0) AS actualGmv,
        COALESCE(SUM(ordersPaid),0)   AS actualOrders,
        COUNT(*)                       AS actualSessions,
        COALESCE(AVG(
          CASE
            WHEN orderCvr > 0 THEN orderCvr
            WHEN COALESCE(viewers,0) > 0 THEN ROUND(ordersPaid * 100.0 / viewers, 4)
            WHEN COALESCE(views,0) > 0 THEN ROUND(ordersPaid * 100.0 / views, 4)
            ELSE NULL
          END
        ), 0) AS avgCvr
      FROM tt_live_sessions
      WHERE storeId = ? AND DATE(startTime) >= ? AND DATE(startTime) <= ?`,
      [storeId, monthStart, monthEnd]
    )

    const adActual = await dbGet<Record<string, number>>(
      `SELECT COALESCE(SUM(cost),0) AS actualAdSpend,
        COALESCE(SUM(grossRevenue),0) AS adRevenue
      FROM tt_ad_sessions
      WHERE storeId = ? AND dateTo >= ? AND dateFrom <= ?`,
      [storeId, monthStart, monthEnd]
    )

    // 店铺产品数据（商品卡渠道的GMV，OVERLAP）
    const shopTabActual = await dbGet<Record<string, number>>(
      `SELECT COALESCE(SUM(gmv),0) AS shopTabGmv,
        COALESCE(SUM(skuOrders),0) AS shopTabOrders
      FROM tt_store_products
      WHERE storeId = ? AND dateTo >= ? AND dateFrom <= ?
        AND (channelType = 'SHOP_TAB' OR channelType IS NULL)`,
      [storeId, monthStart, monthEnd]
    )

    // 月度走势（多个月的历史趋势）— 用 startTime 取实际场次月份，而非批次 dateFrom
    const monthlyTrend = await dbAll<Record<string, unknown>>(
      `SELECT
        SUBSTR(startTime, 1, 7) AS month,
        SUM(grossRevenue) AS gmv,
        SUM(ordersPaid) AS orders,
        COUNT(*) AS sessions
      FROM tt_live_sessions
      WHERE storeId = ? AND startTime != ''
      GROUP BY SUBSTR(startTime, 1, 7)
      ORDER BY month DESC LIMIT 12`, [storeId]
    )

    const targetMap = Object.fromEntries(targets.map(t => [t.metric as string, t.targetValue as number]))
    const targetNotes: Record<string, { note: string | null; isAiGenerated: boolean }> = Object.fromEntries(
      targets.map(t => [t.metric as string, { note: (t.note as string | null), isAiGenerated: !!(t.isAiGenerated) }])
    )

    res.json({
      month: targetMonth,
      targets: targetMap,
      targetNotes,
      actual: (() => {
        const liveGmv  = liveActual?.actualGmv ?? 0
        const sessions = liveActual?.actualSessions ?? 0
        const adSpend  = adActual?.actualAdSpend ?? 0
        const adRevenue = adActual?.adRevenue ?? 0
        return {
          gmv: liveGmv + (shopTabActual?.shopTabGmv ?? 0),
          liveGmv,
          shopTabGmv: shopTabActual?.shopTabGmv ?? 0,
          orders: (liveActual?.actualOrders ?? 0) + (shopTabActual?.shopTabOrders ?? 0),
          liveOrders: liveActual?.actualOrders ?? 0,
          shopTabOrders: shopTabActual?.shopTabOrders ?? 0,
          sessions,
          adSpend,
          adRevenue,
          adRoi: adSpend > 0 ? Math.round((adRevenue / adSpend) * 100) / 100 : 0,
          avgCvr: +(liveActual?.avgCvr ?? 0).toFixed(2),
          gmvPerSession: sessions > 0 ? Math.round(liveGmv / sessions) : 0,
        }
      })(),
      monthlyTrend: monthlyTrend.reverse()
    })
  } catch (error) { next(error) }
})

// ─── 6. 全渠道矩阵概览 ──────────────────────────────────────────────
// GET /api/tt-bi/omni-channel
router.get('/omni-channel', async (req: AuthRequest, res, next) => {
  try {
    const { storeId, dateFrom, dateTo, compareDateFrom, compareDateTo } = req.query as Record<string, string>
    if (!storeId) throw new BadRequestError('请选择店铺')

    const queryPeriod = async (from?: string, to?: string) => {
      // 直播场次用 DATE(startTime) 过滤（每行是独立场次，有具体开播时间）
      const liveCond = () => {
        const c: string[] = []; const p: unknown[] = []
        if (from) { c.push('DATE(startTime) >= ?'); p.push(from) }
        if (to) { c.push('DATE(startTime) <= ?'); p.push(to) }
        return { conds: c, params: p }
      }
      // 广告、商品数据用 OVERLAP（批次级数据，无每行日期）
      const dc = (pf = '') => {
        const c: string[] = []; const p: unknown[] = []
        if (from) { c.push(`${pf}dateTo >= ?`); p.push(from) }
        if (to) { c.push(`${pf}dateFrom <= ?`); p.push(to) }
        return { conds: c, params: p }
      }
      const ld = liveCond(), sd = dc(), lpd = dc(), ad = dc()

      const [liveData, shopTabData, liveProductData, adData, liveTrend, shopTrend] = await Promise.all([
        dbGet<Record<string, number>>(
          `SELECT COALESCE(SUM(grossRevenue),0) AS gmv, COALESCE(SUM(ordersPaid),0) AS orders,
            COALESCE(SUM(views),0) AS views, COUNT(*) AS sessions
          FROM tt_live_sessions
          WHERE storeId = ? ${ld.conds.length ? 'AND ' + ld.conds.join(' AND ') : ''}`,
          [storeId, ...ld.params]
        ),
        dbGet<Record<string, number>>(
          `SELECT COALESCE(SUM(gmv),0) AS gmv, COALESCE(SUM(skuOrders),0) AS orders, COALESCE(SUM(views),0) AS views
          FROM tt_store_products WHERE storeId = ? AND channelType = 'SHOP_TAB'
            ${sd.conds.length ? 'AND ' + sd.conds.join(' AND ') : ''}`,
          [storeId, ...sd.params]
        ),
        dbGet<Record<string, number>>(
          `SELECT COALESCE(SUM(gmv),0) AS gmv, COALESCE(SUM(skuOrders),0) AS orders
          FROM tt_store_products WHERE storeId = ? AND channelType = 'LIVE'
            ${lpd.conds.length ? 'AND ' + lpd.conds.join(' AND ') : ''}`,
          [storeId, ...lpd.params]
        ),
        dbGet<Record<string, number>>(
          `SELECT COALESCE(SUM(cost),0) AS adCost, COALESCE(SUM(grossRevenue),0) AS adGmv, COALESCE(SUM(skuOrders),0) AS adOrders
          FROM tt_ad_sessions WHERE storeId = ? ${ad.conds.length ? 'AND ' + ad.conds.join(' AND ') : ''}`,
          [storeId, ...ad.params]
        ),
        dbAll<Record<string, unknown>>(
          `SELECT DATE(startTime) AS date, SUM(grossRevenue) AS gmv, SUM(ordersPaid) AS orders
          FROM tt_live_sessions WHERE storeId = ? ${ld.conds.length ? 'AND ' + ld.conds.join(' AND ') : ''}
          GROUP BY DATE(startTime) ORDER BY DATE(startTime)`, [storeId, ...ld.params]
        ),
        dbAll<Record<string, unknown>>(
          `SELECT dateFrom AS date, SUM(gmv) AS gmv, SUM(skuOrders) AS orders
          FROM tt_store_products WHERE storeId = ? AND channelType = 'SHOP_TAB'
            ${sd.conds.length ? 'AND ' + sd.conds.join(' AND ') : ''}
          GROUP BY dateFrom ORDER BY dateFrom`, [storeId, ...sd.params]
        ),
      ])

      const channels = [
        { channel: 'LIVE', label: '直播',
          gmv: (liveData?.gmv ?? 0) + (liveProductData?.gmv ?? 0),
          orders: (liveData?.orders ?? 0) + (liveProductData?.orders ?? 0),
          views: liveData?.views ?? 0, sessions: liveData?.sessions ?? 0 },
        { channel: 'SHOP_TAB', label: '商品卡',
          gmv: shopTabData?.gmv ?? 0, orders: shopTabData?.orders ?? 0,
          views: shopTabData?.views ?? 0, sessions: 0 },
      ]
      const totalGmv = channels.reduce((s, c) => s + c.gmv, 0)
      const totalOrders = channels.reduce((s, c) => s + c.orders, 0)
      return {
        channels: channels.map(c => ({
          ...c,
          gmvPct: totalGmv > 0 ? Math.round(c.gmv / totalGmv * 10000) / 100 : 0,
          ordersPct: totalOrders > 0 ? Math.round(c.orders / totalOrders * 10000) / 100 : 0,
        })),
        total: { gmv: totalGmv, orders: totalOrders },
        ad: { cost: adData?.adCost ?? 0, gmv: adData?.adGmv ?? 0, orders: adData?.adOrders ?? 0 },
        trends: { live: liveTrend, shopTab: shopTrend },
      }
    }

    const [current, compare] = await Promise.all([
      queryPeriod(dateFrom, dateTo),
      compareDateFrom ? queryPeriod(compareDateFrom, compareDateTo) : Promise.resolve(null),
    ])

    res.json({ ...current, compare })
  } catch (error) { next(error) }
})

// ─── 7. 短视频分析 ────────────────────────────────────────────────────
// GET /api/tt-bi/video-performance
router.get('/video-performance', async (req: AuthRequest, res, next) => {
  try {
    const { storeId, dateFrom, dateTo } = req.query as Record<string, string>
    if (!storeId) throw new BadRequestError('请选择店铺')

    // OVERLAP 语义日期过滤
    const conds: string[] = ['storeId = ?']
    const p: unknown[] = [storeId]
    if (dateFrom) { conds.push('dateTo >= ?'); p.push(dateFrom) }
    if (dateTo)   { conds.push('dateFrom <= ?'); p.push(dateTo) }
    const where = conds.join(' AND ')

    const [summary, topVideos, dailyTrend] = await Promise.all([
      // KPI 汇总
      dbGet<Record<string, number>>(`
        SELECT
          COUNT(*)                                                   AS totalVideos,
          COALESCE(SUM(videoViews), 0)                              AS totalVV,
          COALESCE(SUM(orders), 0)                                  AS totalOrders,
          COALESCE(SUM(uniqueCustomers), 0)                         AS totalBuyers,
          COALESCE(SUM(grossRevenue), 0)                            AS totalGmv,
          COALESCE(SUM(newFollowers), 0)                            AS totalNewFollowers,
          COALESCE(SUM(productImpressions), 0)                      AS totalImpressions,
          COALESCE(SUM(productClicks), 0)                           AS totalClicks,
          COALESCE(SUM(videoToLiveClicks), 0)                       AS totalVtoLClicks,
          COALESCE(AVG(CASE WHEN gpm > 0 THEN gpm
                            WHEN videoViews > 0 THEN grossRevenue * 1000.0 / videoViews
                            ELSE NULL END), 0)                       AS avgGPM,
          COALESCE(AVG(CASE WHEN ctr > 0 THEN ctr
                            WHEN productImpressions > 0 AND productClicks > 0
                                 THEN productClicks * 100.0 / productImpressions
                            ELSE NULL END), 0)                       AS avgCTR,
          COALESCE(AVG(CASE WHEN videoFinishRate > 0 THEN videoFinishRate ELSE NULL END), 0) AS avgFinishRate,
          COALESCE(AVG(CASE WHEN clickToOrderRate > 0 THEN clickToOrderRate ELSE NULL END), 0) AS avgClickToOrderRate,
          COALESCE(AVG(CASE WHEN videoToLiveRate > 0 THEN videoToLiveRate ELSE NULL END), 0)   AS avgVtoLRate
        FROM tt_video_sessions WHERE ${where}`, p),

      // 视频明细排行（按 GMV DESC，最多 50 条）
      dbAll<Record<string, unknown>>(`
        SELECT creatorName, videoInfo, videoId, publishedAt, products,
               videoViews, grossRevenue, gpm, orders, uniqueCustomers,
               productImpressions, productClicks, ctr,
               videoFinishRate, videoToLiveRate, videoToLiveClicks,
               clickToOrderRate, newFollowers, likes, comments, shares, mark
        FROM tt_video_sessions WHERE ${where}
        ORDER BY grossRevenue DESC LIMIT 50`, p),

      // 日维度趋势（按 publishedAt 日期分组）
      dbAll<Record<string, unknown>>(`
        SELECT
          SUBSTR(publishedAt, 1, 10)  AS date,
          SUM(videoViews)             AS vv,
          SUM(grossRevenue)           AS gmv,
          SUM(orders)                 AS orders,
          COUNT(*)                    AS videos
        FROM tt_video_sessions
        WHERE ${where} AND publishedAt != ''
        GROUP BY SUBSTR(publishedAt, 1, 10)
        ORDER BY date ASC`, p),
    ])

    res.json({ summary, topVideos, dailyTrend })
  } catch (err) { next(err) }
})

export default router
