import express from 'express'
import { authenticate, AuthRequest } from '../middleware/auth'
import { dbAll } from '../db'
import { BadRequestError } from '../utils/errors'

const router = express.Router()
router.use(authenticate)

// 允许查询的表及其可选字段白名单（防SQL注入）
const TABLE_FIELDS: Record<string, string[]> = {
  tt_live_sessions: [
    'name','startTime','durationSeconds','grossRevenue','directGmv','itemsSold',
    'customers','avgPrice','ordersPaid','gmvPer1kShows','gmvPer1kViews',
    'views','viewers','peakViewers','newFollowers','avgViewDurationSec',
    'likes','comments','shares','productImpressions','productClicks','ctr','ctor',
    'gmvPerHour','revenuePerViewer','orderCvr','engagementRate',
    'dateFrom','dateTo','currency'
  ],
  tt_ad_sessions: [
    'liveName','launchedTime','status','campaignName','campaignId',
    'adType','advertiserType','contentType',
    'cost','netCost','skuOrders','skuOrdersShop','costPerOrder',
    'grossRevenue','grossRevenueShop','roi',
    'liveViews','costPerLiveView','views10s','costPer10sView','liveFollows',
    'dateFrom','dateTo','currency'
  ],
  tt_store_products: [
    'productId','productName','viewers','views','uniqueClicks','clicks',
    'skuOrders','customers','addToCartUsers','clicksAddToCart','gmv',
    'viewToPaidRate','viewToClickRate','clickToCartRate','clickToPaidRate','cartToPaidRate',
    'contentGmv','channelType','weekTag','dateFrom','dateTo','currency'
  ],
  tt_product_details: [
    'productId','productName','totalRevenue','commission','unitsSold',
    'channelType','dateFrom','dateTo','currency'
  ],
  tt_video_sessions: [
    'creatorName','creatorId','videoInfo','videoId','publishedAt','products',
    'videoViews','likes','comments','shares','newFollowers','videoToLiveClicks',
    'productImpressions','productClicks','uniqueCustomers','orders','itemsSold',
    'grossRevenue','gpm','attributedGmv','ctr','videoToLiveRate','videoFinishRate',
    'clickToOrderRate','mark','dateFrom','dateTo','currency'
  ],
}


const AGGREGATE_FNS = ['SUM','AVG','COUNT','MIN','MAX'] as const

function validateField(table: string, field: string): boolean {
  return TABLE_FIELDS[table]?.includes(field) ?? false
}

/**
 * POST /api/tt-analytics/query
 * 灵活查询接口
 * Body: {
 *   table: 'tt_live_sessions' | 'tt_ad_sessions' | ...,
 *   storeId: string,
 *   dateFrom?: string,
 *   dateTo?: string,
 *   select: string[],           // 要返回的字段
 *   aggregates?: { fn: 'SUM'|'AVG'|..., field: string, alias: string }[],
 *   groupBy?: string[],
 *   orderBy?: { field: string, dir: 'ASC'|'DESC' },
 *   limit?: number
 * }
 */
router.post('/query', async (req: AuthRequest, res, next) => {
  try {
    const { table, storeId, dateFrom, dateTo, select, aggregates, groupBy, orderBy, limit } = req.body

    if (!table || !TABLE_FIELDS[table]) throw new BadRequestError('无效的数据表: ' + table)
    if (!storeId) throw new BadRequestError('请选择店铺')

    // 构建 SELECT
    const selectParts: string[] = []
    for (const f of (select || [])) {
      if (!validateField(table, f)) throw new BadRequestError('非法字段: ' + f)
      selectParts.push(f)
    }
    for (const agg of (aggregates || [])) {
      if (!AGGREGATE_FNS.includes(agg.fn)) throw new BadRequestError('非法聚合函数: ' + agg.fn)
      if (!validateField(table, agg.field)) throw new BadRequestError('非法字段: ' + agg.field)
      const alias = (agg.alias || `${agg.fn}_${agg.field}`).replace(/[^a-zA-Z0-9_]/g, '')
      selectParts.push(`${agg.fn}(${agg.field}) AS ${alias}`)
    }
    if (selectParts.length === 0) selectParts.push('*')

    // WHERE — 使用 OVERLAP 语义（只要批次日期与查询范围有交集即纳入）
    const conditions = ['storeId = ?']
    const params: unknown[] = [storeId]
    if (dateFrom) { conditions.push('dateTo >= ?'); params.push(dateFrom) }
    if (dateTo) { conditions.push('dateFrom <= ?'); params.push(dateTo) }

    // GROUP BY
    let groupClause = ''
    if (groupBy?.length) {
      for (const g of groupBy) { if (!validateField(table, g)) throw new BadRequestError('非法分组字段: ' + g) }
      groupClause = ' GROUP BY ' + groupBy.join(', ')
    }

    // ORDER BY — S6: 同 GROUP BY 一样必须通过白名单校验
    let orderClause = ''
    if (orderBy?.field) {
      const sanitized = orderBy.field.replace(/[^a-zA-Z0-9_]/g, '')
      if (!validateField(table, sanitized)) throw new BadRequestError('非法排序字段: ' + sanitized)
      const dir = orderBy.dir === 'ASC' ? 'ASC' : 'DESC'
      orderClause = ` ORDER BY ${sanitized} ${dir}`
    }

    const lim = Math.min(Math.max(1, limit || 500), 5000)
    const sql = `SELECT ${selectParts.join(', ')} FROM ${table} WHERE ${conditions.join(' AND ')}${groupClause}${orderClause} LIMIT ?`
    params.push(lim)

    const rows = await dbAll<Record<string, unknown>>(sql, params)
    res.json({ rows, total: rows.length, sql: process.env.NODE_ENV === 'development' ? sql : undefined })
  } catch (error) { next(error) }
})

/**
 * GET /api/tt-analytics/live-summary
 * 直播数据汇总
 */
router.get('/live-summary', async (req: AuthRequest, res, next) => {
  try {
    const { storeId, dateFrom, dateTo } = req.query as Record<string, string>
    if (!storeId) throw new BadRequestError('请选择店铺')

    const conditions = ['storeId = ?']
    const params: unknown[] = [storeId]
    // OVERLAP: session's range overlaps with [dateFrom, dateTo]
    if (dateFrom) { conditions.push('dateTo >= ?'); params.push(dateFrom) }
    if (dateTo) { conditions.push('dateFrom <= ?'); params.push(dateTo) }

    const rows = await dbAll<Record<string, unknown>>(
      `SELECT 
        COUNT(*) as totalSessions,
        SUM(grossRevenue) as totalRevenue,
        SUM(directGmv) as totalDirectGmv,
        SUM(itemsSold) as totalItemsSold,
        SUM(ordersPaid) as totalOrders,
        SUM(views) as totalViews,
        SUM(viewers) as totalViewers,
        AVG(avgPrice) as avgPrice,
        SUM(likes) as totalLikes,
        SUM(comments) as totalComments,
        SUM(shares) as totalShares,
        SUM(newFollowers) as totalNewFollowers,
        AVG(ctr) as avgCtr,
        AVG(ctor) as avgCtor,
        SUM(durationSeconds) as totalDurationSec
      FROM tt_live_sessions WHERE ${conditions.join(' AND ')}`, params
    )
    res.json(rows[0] || {})
  } catch (error) { next(error) }
})

/**
 * GET /api/tt-analytics/ad-summary
 * 广告 ROI 汇总
 */
router.get('/ad-summary', async (req: AuthRequest, res, next) => {
  try {
    const { storeId, dateFrom, dateTo } = req.query as Record<string, string>
    if (!storeId) throw new BadRequestError('请选择店铺')

    const conditions = ['storeId = ?']
    const params: unknown[] = [storeId]
    // OVERLAP semantics
    if (dateFrom) { conditions.push('dateTo >= ?'); params.push(dateFrom) }
    if (dateTo) { conditions.push('dateFrom <= ?'); params.push(dateTo) }

    const rows = await dbAll<Record<string, unknown>>(
      `SELECT 
        COUNT(*) as totalCampaigns,
        SUM(cost) as totalCost,
        SUM(netCost) as totalNetCost,
        SUM(grossRevenue) as totalRevenue,
        SUM(skuOrders) as totalOrders,
        CASE WHEN SUM(cost) > 0 THEN ROUND(SUM(grossRevenue) / SUM(cost), 2) ELSE 0 END as overallRoi,
        CASE WHEN SUM(skuOrders) > 0 THEN ROUND(SUM(cost) / SUM(skuOrders), 2) ELSE 0 END as avgCostPerOrder,
        SUM(liveViews) as totalLiveViews,
        SUM(views10s) as total10sViews,
        SUM(liveFollows) as totalFollows
      FROM tt_ad_sessions WHERE ${conditions.join(' AND ')}`, params
    )
    res.json(rows[0] || {})
  } catch (error) { next(error) }
})

/**
 * GET /api/tt-analytics/product-funnel
 * 产品转化漏斗（店铺产品数据）
 */
router.get('/product-funnel', async (req: AuthRequest, res, next) => {
  try {
    const { storeId, dateFrom, dateTo, limit } = req.query as Record<string, string>
    if (!storeId) throw new BadRequestError('请选择店铺')

    const conditions = ['storeId = ?']
    const params: unknown[] = [storeId]
    // OVERLAP semantics
    if (dateFrom) { conditions.push('dateTo >= ?'); params.push(dateFrom) }
    if (dateTo) { conditions.push('dateFrom <= ?'); params.push(dateTo) }

    const lim = Math.min(Number(limit) || 20, 100)
    params.push(lim)

    const rows = await dbAll<Record<string, unknown>>(
      `SELECT productId, productName, viewers, views, clicks, uniqueClicks,
        skuOrders, customers, addToCartUsers, gmv,
        viewToPaidRate, viewToClickRate, clickToCartRate, clickToPaidRate, cartToPaidRate, contentGmv
      FROM tt_store_products WHERE ${conditions.join(' AND ')}
      ORDER BY gmv DESC LIMIT ?`, params
    )
    res.json(rows)
  } catch (error) { next(error) }
})

/**
 * GET /api/tt-analytics/product-enriched
 * 增强产品视图：LEFT JOIN 店铺产品数据 + 产品明细，按 productId 合并
 * 弥补产品明细(tt_product_details)字段稀少的问题
 */
router.get('/product-enriched', async (req: AuthRequest, res, next) => {
  try {
    const { storeId, dateFrom, dateTo, limit } = req.query as Record<string, string>
    if (!storeId) throw new BadRequestError('请选择店铺')

    const spConditions = ['sp.storeId = ?']
    const pdConditions = ['pd.storeId = ?']
    const params: unknown[] = [storeId, storeId]
    if (dateFrom) {
      // OVERLAP: sp.dateTo >= queryFrom AND sp.dateFrom <= queryTo
      spConditions.push('sp.dateTo >= ?'); pdConditions.push('pd.dateTo >= ?')
      params.push(dateFrom, dateFrom)
    }
    if (dateTo) {
      spConditions.push('sp.dateFrom <= ?'); pdConditions.push('pd.dateFrom <= ?')
      params.push(dateTo, dateTo)
    }

    const lim = Math.min(Number(limit) || 50, 200)
    params.push(lim)

    const rows = await dbAll<Record<string, unknown>>(
      `SELECT
        sp.productId,
        sp.productName,
        sp.viewers,
        sp.views,
        sp.clicks,
        sp.skuOrders,
        sp.customers,
        sp.addToCartUsers,
        sp.gmv                                          AS storeGmv,
        sp.viewToPaidRate,
        sp.viewToClickRate,
        sp.clickToCartRate,
        sp.clickToPaidRate,
        sp.cartToPaidRate,
        sp.contentGmv,
        -- 产品明细补充字段
        COALESCE(pd.totalRevenue, 0)                    AS detailRevenue,
        COALESCE(pd.commission, 0)                      AS detailCommission,
        COALESCE(pd.unitsSold, 0)                       AS detailUnitsSold,
        -- 合并最优 GMV（明细有则用明细，否则用店铺数据）
        COALESCE(NULLIF(pd.totalRevenue, 0), sp.gmv)    AS bestGmv,
        -- 派生：佣金率
        CASE WHEN COALESCE(pd.totalRevenue, 0) > 0
          THEN ROUND(pd.commission * 100.0 / pd.totalRevenue, 2)
          ELSE 0 END                                    AS commissionRate
      FROM tt_store_products sp
      LEFT JOIN (
        SELECT productId, SUM(totalRevenue) AS totalRevenue,
               SUM(commission) AS commission, SUM(unitsSold) AS unitsSold
        FROM tt_product_details
        WHERE ${pdConditions.join(' AND ')}
        GROUP BY productId
      ) pd ON sp.productId = pd.productId
      WHERE ${spConditions.join(' AND ')}
      ORDER BY bestGmv DESC
      LIMIT ?`, params
    )
    res.json(rows)
  } catch (error) { next(error) }
})


/**
 * GET /api/tt-analytics/cross-analysis
 * 跨表联合分析：广告 vs 有机流量
 */
router.get('/cross-analysis', async (req: AuthRequest, res, next) => {
  try {
    const { storeId, dateFrom, dateTo } = req.query as Record<string, string>
    if (!storeId) throw new BadRequestError('请选择店铺')

    const conditions = ['ls.storeId = ?']
    const adConditions = ['storeId = ?']
    const params: unknown[] = [storeId]
    const adParams: unknown[] = [storeId]
    // OVERLAP semantics for both tables
    if (dateFrom) {
      conditions.push('ls.dateTo >= ?'); params.push(dateFrom)
      adConditions.push('dateTo >= ?'); adParams.push(dateFrom)
    }
    if (dateTo) {
      conditions.push('ls.dateFrom <= ?'); params.push(dateTo)
      adConditions.push('dateFrom <= ?'); adParams.push(dateTo)
    }

    const rows = await dbAll<Record<string, unknown>>(
      `SELECT 
        ls.name as liveName,
        ls.startTime,
        ls.grossRevenue as organicRevenue,
        ls.views as organicViews,
        ls.itemsSold,
        COALESCE(ad.totalCost, 0) as adCost,
        COALESCE(ad.adRevenue, 0) as adRevenue,
        COALESCE(ad.adRoi, 0) as adRoi,
        COALESCE(ad.adViews, 0) as adViews
      FROM tt_live_sessions ls
      LEFT JOIN (
        SELECT liveName,
          SUM(cost) as totalCost,
          SUM(grossRevenue) as adRevenue,
          CASE WHEN SUM(cost) > 0 THEN ROUND(SUM(grossRevenue)/SUM(cost),2) ELSE 0 END as adRoi,
          SUM(liveViews) as adViews
        FROM tt_ad_sessions 
        WHERE ${adConditions.join(' AND ')}
        GROUP BY liveName
      ) ad ON ls.name = ad.liveName
      WHERE ${conditions.join(' AND ')}
      ORDER BY ls.grossRevenue DESC
      LIMIT 50`, [...adParams, ...params]
    )
    res.json(rows)
  } catch (error) { next(error) }
})

/**
 * GET /api/tt-analytics/video-summary
 * 短视频数据汇总
 */
router.get('/video-summary', async (req: AuthRequest, res, next) => {
  try {
    const { storeId, dateFrom, dateTo } = req.query as Record<string, string>
    if (!storeId) throw new BadRequestError('请选择店铺')

    const conditions = ['storeId = ?']
    const params: unknown[] = [storeId]
    if (dateFrom) { conditions.push('dateTo >= ?'); params.push(dateFrom) }
    if (dateTo) { conditions.push('dateFrom <= ?'); params.push(dateTo) }

    const rows = await dbAll<Record<string, unknown>>(
      `SELECT
        COUNT(*) as totalVideos,
        SUM(videoViews) as totalVideoViews,
        SUM(likes) as totalLikes,
        SUM(comments) as totalComments,
        SUM(shares) as totalShares,
        SUM(newFollowers) as totalNewFollowers,
        SUM(productImpressions) as totalProductImpressions,
        SUM(productClicks) as totalProductClicks,
        SUM(orders) as totalOrders,
        SUM(itemsSold) as totalItemsSold,
        SUM(grossRevenue) as totalGrossRevenue,
        SUM(attributedGmv) as totalAttributedGmv,
        AVG(ctr) as avgCtr,
        AVG(videoFinishRate) as avgFinishRate,
        AVG(clickToOrderRate) as avgClickToOrderRate
      FROM tt_video_sessions WHERE ${conditions.join(' AND ')}`, params
    )
    res.json(rows[0] || {})
  } catch (error) { next(error) }
})

export default router
