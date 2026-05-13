import { parseTtExcelBuffer, TtDataType } from '../utils/excelParser'
import { TtImportRepository } from '../repositories/TtImportRepository'
import { BadRequestError, NotFoundError, ForbiddenError } from '../utils/errors'

const VALID_TYPES: TtDataType[] = ['live_sessions', 'ad_sessions', 'store_products', 'product_details', 'product_overview', 'video_sessions']
const TABLE_MAP: Record<TtDataType, string> = {
  live_sessions: 'tt_live_sessions',
  ad_sessions: 'tt_ad_sessions',
  store_products: 'tt_store_products',
  product_details: 'tt_product_details',
  product_overview: 'tt_store_products', // expands into per-channel store_product rows
  video_sessions: 'tt_video_sessions',
}

export const DATA_TYPE_LABELS: Record<TtDataType, string> = {
  live_sessions: '直播数据明细',
  ad_sessions: '广告消耗明细',
  store_products: '店铺产品数据',
  product_details: '产品数据明细',
  product_overview: '全渠道商品大盘',
  video_sessions: '视频数据明细',
}

export class TtImportService {
  private repo = new TtImportRepository()

  /**
   * 解析 Excel buffer，返回预览数据（不写库）
   * 若文件无内置日期（product_details 类型常见），可传 manualDateFrom/To
   */
  async parsePreview(
    buffer: Buffer,
    fileName: string,
    manualDateFrom?: string,
    manualDateTo?: string
  ) {
    const result = parseTtExcelBuffer(buffer, fileName, manualDateFrom, manualDateTo)

    // needsDateInput: true 仅当解析器提取不到日期，且该类型没有粒度选择器接管日期录入
    // granLock 类型（ad/store_products/product_overview/product_details）由粒度选择器处理
    // live_sessions / video_sessions 的日期通常嵌入文件；提取失败时向用户发出警告
    const needsDateInput = !result.dateFrom && !result.dateTo &&
      (result.dataType === 'live_sessions' || result.dataType === 'video_sessions')

    return {
      dataType: result.dataType,
      dataTypeLabel: DATA_TYPE_LABELS[result.dataType],
      dateFrom: result.dateFrom,
      dateTo: result.dateTo,
      currency: result.currency,
      totalRows: result.rows.length,
      previewRows: result.rows.slice(0, 5),
      headers: result.headers,
      needsDateInput,
    }
  }

  /**
   * 正式写入数据库（覆盖逻辑：先删旧批次，再插新数据）
   */
  async commitImport(params: {
    buffer: Buffer
    fileName: string
    storeId: string
    importedBy: string
    dateFrom?: string
    dateTo?: string
    advertiserType?: string  // for ad_sessions: self | influencer
    adType?: string          // for ad_sessions: live | video
    contentType?: string     // for ad_sessions: live_room | short_video
    channelType?: string     // for store_products: LIVE | SHOP_TAB
  }) {
    const { buffer, fileName, storeId, importedBy } = params

    const parsed = parseTtExcelBuffer(buffer, fileName, params.dateFrom, params.dateTo)

    if (!parsed.dateFrom || !parsed.dateTo) {
      throw new BadRequestError('无法自动提取日期范围，请手动填写 dateFrom 和 dateTo')
    }

    // 广告数据：允许覆盖 advertiserType / adType / contentType
    if (parsed.dataType === 'ad_sessions' && params.advertiserType) {
      for (const row of parsed.rows) {
        row.advertiserType = params.advertiserType
        if (params.adType) row.adType = params.adType
        if (params.contentType) row.contentType = params.contentType
      }
    }

    // 店铺产品数据 / 产品明细：允许覆盖 channelType（区分直播/商品卡渠道）
    // product_overview 不在此处理：mapper 已按渠道展开各行并赋值 channelType，不得覆盖
    if ((parsed.dataType === 'store_products' || parsed.dataType === 'product_details') && params.channelType) {
      for (const row of parsed.rows) {
        row.channelType = params.channelType
      }
    }

    // 覆盖逻辑：删除同 storeId + dataType + dateRange 的旧数据
    const existing = await this.repo.findExisting(storeId, parsed.dataType, parsed.dateFrom, parsed.dateTo)
    if (existing) {
      await this.repo.deleteImport(existing.id)
    }

    // 创建新批次
    const importId = await this.repo.createImport({
      storeId,
      dataType: parsed.dataType,
      dateFrom: parsed.dateFrom,
      dateTo: parsed.dateTo,
      fileName,
      recordCount: parsed.rows.length,
      currency: parsed.currency,
      importedBy,
    })

    // product_overview 已由 mapper 展开为 store_products 行，存入 tt_store_products
    const saveType: TtDataType = parsed.dataType === 'product_overview' ? 'store_products' : parsed.dataType

    // 批量插入行数据
    await this.repo.saveRows(
      saveType,
      importId,
      storeId,
      parsed.dateFrom,
      parsed.dateTo,
      parsed.currency,
      parsed.rows
    )

    return {
      importId,
      dataType: parsed.dataType,
      dataTypeLabel: DATA_TYPE_LABELS[parsed.dataType],
      recordCount: parsed.rows.length,
      dateFrom: parsed.dateFrom,
      dateTo: parsed.dateTo,
      currency: parsed.currency,
      overwritten: !!existing,
    }
  }

  /** 导入历史列表 */
  async listHistory(storeId: string) {
    const imports = await this.repo.listImports(storeId)
    return imports.map((imp) => ({
      ...imp,
      dataTypeLabel: DATA_TYPE_LABELS[imp.dataType as TtDataType] ?? imp.dataType,
    }))
  }

  /** 回滚指定批次 */
  async rollbackImport(importId: string, userId: string, role: string) {
    const imp = await this.repo.getImport(importId)
    if (!imp) throw new NotFoundError('导入批次不存在')
    if (role !== 'admin' && role !== 'manager' && imp.importedBy !== userId) {
      throw new ForbiddenError('只能删除自己创建的导入批次')
    }
    await this.repo.deleteImport(importId)
    return { deleted: importId, recordCount: imp.recordCount }
  }

  /** 获取直播数据（用于分析） */
  async getLiveSessions(storeId: string, dateFrom?: string, dateTo?: string, limit = 1000) {
    return this.repo.queryData('tt_live_sessions', storeId, dateFrom, dateTo, limit)
  }

  /** 获取广告数据（用于分析） */
  async getAdSessions(storeId: string, dateFrom?: string, dateTo?: string, limit = 1000) {
    return this.repo.queryData('tt_ad_sessions', storeId, dateFrom, dateTo, limit)
  }

  /** 获取店铺产品数据（用于分析） */
  async getStoreProducts(storeId: string, dateFrom?: string, dateTo?: string, limit = 1000) {
    return this.repo.queryData('tt_store_products', storeId, dateFrom, dateTo, limit)
  }

  /** 获取产品明细（用于分析） */
  async getProductDetails(storeId: string, dateFrom?: string, dateTo?: string, limit = 1000) {
    return this.repo.queryData('tt_product_details', storeId, dateFrom, dateTo, limit)
  }

  /** 获取视频数据（用于分析） */
  async getVideoSessions(storeId: string, dateFrom?: string, dateTo?: string, limit = 1000) {
    return this.repo.queryData('tt_video_sessions', storeId, dateFrom, dateTo, limit)
  }
}
