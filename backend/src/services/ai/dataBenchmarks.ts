/**
 * AI 行业基准数据模块
 * 负责：品类基准转化率、客单价基准、时段推荐、店铺成长阶段、数据来源说明
 * 原属 aiTasksService.ts
 */

// ==================== 时段推荐 ====================

export function getRecommendedTimeSlot(categories: string[], region?: string, targetAudience?: string): string {
  const categoryTimeSlots: { [key: string]: { time: string; reason: string } } = {
    '服饰鞋包': { time: '19:00-22:00', reason: '下班后购物高峰，女性用户活跃' },
    '女装': { time: '19:30-22:30', reason: '女性用户晚间浏览高峰，转化率高' },
    '男装': { time: '20:00-22:00', reason: '男性用户晚间休闲时段' },
    '美妆个护': { time: '20:00-23:00', reason: '晚间护肤、化妆教程观看高峰' },
    '面部护肤': { time: '20:00-23:00', reason: '晚间护肤习惯，女性用户活跃' },
    '彩妆': { time: '19:00-22:00', reason: '下班后化妆教程需求旺盛' },
    '食品健康': { time: '10:00-12:00, 18:00-20:00', reason: '早午餐前和晚餐时段，食品购买欲强' },
    '休闲零食': { time: '15:00-17:00, 20:00-22:00', reason: '下午茶和晚间零食时段' },
    '生鲜': { time: '08:00-10:00, 17:00-19:00', reason: '早市和晚市买菜高峰' },
    '亲子生活': { time: '10:00-12:00, 19:00-21:00', reason: '妈妈群体上午和晚间带娃时段' },
    '母婴': { time: '10:00-12:00, 20:00-22:00', reason: '宝妈上午休息和晚间哄睡后时段' },
    '童装': { time: '10:00-12:00, 19:00-21:00', reason: '妈妈群体购物高峰' },
    '家居家电': { time: '20:00-22:00', reason: '晚间家庭决策时段' },
    '家电': { time: '20:00-22:00', reason: '晚间家庭成员共同决策' },
    '3C数码': { time: '20:00-23:00', reason: '男性用户晚间数码产品研究高峰' },
    '手机': { time: '20:00-23:00', reason: '晚间数码爱好者活跃时段' },
    '电脑': { time: '20:00-23:00', reason: '晚间技术讨论和购买决策时段' },
    '运动户外': { time: '18:00-20:00, 21:00-23:00', reason: '下班后运动和晚间运动后休息时段' },
    '运动服饰': { time: '18:00-20:00', reason: '下班后运动装备购买高峰' },
    '珠宝文玩': { time: '20:00-22:00', reason: '高客单价商品，晚间决策时段' },
    '珠宝': { time: '20:00-22:00', reason: '高价值商品，需要充足时间决策' },
    '虚拟商品': { time: '19:00-23:00', reason: '晚间游戏充值和会员购买高峰' },
    '游戏充值': { time: '20:00-23:00', reason: '晚间游戏时段，充值需求旺盛' },
    '宠物食品': { time: '19:00-22:00', reason: '晚间宠物主人休闲购物时段' },
    '宠物用品': { time: '19:00-22:00', reason: '晚间宠物主人浏览高峰' },
  }

  const audienceTimeSlots: { [key: string]: { time: string; reason: string } } = {
    '25-45岁女性': { time: '19:00-22:00', reason: '下班后和晚间家务后休闲时段' },
    '18-35岁年轻人': { time: '19:00-23:00', reason: '年轻人晚间活跃时段' },
    '中年人': { time: '19:00-21:00', reason: '晚饭后休闲时段' },
    '大众市场': { time: '19:00-22:00', reason: '晚间黄金时段，覆盖最广泛人群' },
    '学生': { time: '19:00-22:00', reason: '晚自习后休闲时段' },
    '上班族': { time: '19:00-22:00', reason: '下班后休闲购物时段' },
    '宝妈': { time: '10:00-12:00, 20:00-22:00', reason: '上午休息和晚间哄睡后时段' },
    '宠物主': { time: '19:00-22:00', reason: '晚间遛狗后休闲时段' },
  }

  const regionAdjustment: { [key: string]: { offset: string; note: string } } = {
    '曼谷': { offset: '(当地时间)', note: '泰国时区GMT+7' },
    '泰国': { offset: '(当地时间)', note: '泰国时区GMT+7' },
    'Thailand': { offset: '(local time)', note: 'Thailand GMT+7' },
  }

  let recommendedTime = ''
  let reason = ''
  let dataSource = ''

  for (const category of categories) {
    if (categoryTimeSlots[category]) {
      recommendedTime = categoryTimeSlots[category].time
      reason = categoryTimeSlots[category].reason
      dataSource = `基于「${category}」品类大盘数据`
      break
    }
  }

  if (!recommendedTime && targetAudience) {
    for (const key in audienceTimeSlots) {
      if (targetAudience.includes(key)) {
        recommendedTime = audienceTimeSlots[key].time
        reason = audienceTimeSlots[key].reason
        dataSource = `基于「${key}」受众画像`
        break
      }
    }
  }

  if (!recommendedTime) {
    recommendedTime = '19:00-22:00'
    reason = '晚间黄金时段，覆盖最广泛人群'
    dataSource = '基于全平台大盘数据'
  }

  let regionNote = ''
  if (region) {
    for (const key in regionAdjustment) {
      if (region.includes(key)) {
        regionNote = ` ${regionAdjustment[key].offset}`
        break
      }
    }
  }

  return `建议时间段：${recommendedTime}${regionNote}（${dataSource}：${reason}）`
}

// ==================== 数据来源说明 ====================

export function getDataSourceByPlatform(platform?: string): string {
  const p = (platform || '').trim()
  if (p === 'TikTok') return 'TikTok平台2024-2025年Q4大盘数据'
  if (p === '抖音') return '抖音平台2024-2025年Q4大盘数据'
  if (p === '快手') return '快手平台2024-2025年Q4大盘数据'
  if (p === '淘宝' || p === '天猫') return '淘宝/天猫平台2024-2025年Q4大盘数据'
  if (p === '京东') return '京东平台2024-2025年Q4大盘数据'
  if (p) return `${p}平台2024-2025年Q4大盘数据`
  return '行业大盘数据'
}

// ==================== 转化率基准 ====================

export function getConversionRateBenchmark(
  categories: string[],
  minPrice?: number,
  maxPrice?: number,
  platform?: string
): { rate: number; comparison: string } {
  const categoryBenchmarks: { [key: string]: number } = {
    '服饰鞋包': 3.5,
    '女装': 4.0,
    '男装': 3.2,
    '美妆个护': 5.0,
    '面部护肤': 5.5,
    '彩妆': 4.8,
    '食品健康': 4.5,
    '休闲零食': 6.0,
    '生鲜': 3.8,
    '亲子生活': 4.2,
    '母婴': 4.5,
    '童装': 3.8,
    '家居家电': 2.5,
    '家电': 2.2,
    '3C数码': 2.0,
    '手机': 1.8,
    '电脑': 1.5,
    '运动户外': 3.0,
    '珠宝文玩': 1.5,
    '珠宝': 1.2,
    '虚拟商品': 8.0,
    '游戏充值': 10.0,
    '宠物食品': 4.5,
    '宠物用品': 3.8,
  }

  const avgPrice = minPrice && maxPrice ? (minPrice + maxPrice) / 2 : null
  let priceAdjustment = 1.0
  let priceNote = ''

  if (avgPrice !== null) {
    if (avgPrice < 50) {
      priceAdjustment = 1.3
      priceNote = '，低价商品（<50元）基准上调30%'
    } else if (avgPrice < 200) {
      priceAdjustment = 1.0
      priceNote = '，中低价商品（50-200元）'
    } else if (avgPrice < 500) {
      priceAdjustment = 0.8
      priceNote = '，中高价商品（200-500元）基准下调20%'
    } else {
      priceAdjustment = 0.6
      priceNote = '，高价商品（>500元）基准下调40%'
    }
  }

  let baseBenchmark = 3.5
  let categoryName = '全平台'

  for (const category of categories) {
    if (categoryBenchmarks[category]) {
      baseBenchmark = categoryBenchmarks[category]
      categoryName = category
      break
    }
  }

  const finalBenchmark = parseFloat((baseBenchmark * priceAdjustment).toFixed(1))
  const dataSource = getDataSourceByPlatform(platform)
  const comparison = `低于「${categoryName}」品类基准 ${finalBenchmark}%${priceNote}（数据来源：${dataSource}）`

  return { rate: finalBenchmark, comparison }
}

// ==================== 客单价基准 ====================

export function getCategoryAOVBenchmark(categories: string[]): number {
  const categoryAOVBenchmarks: { [key: string]: number } = {
    '服饰鞋包': 180,
    '女装': 150,
    '男装': 200,
    '美妆个护': 220,
    '面部护肤': 280,
    '彩妆': 160,
    '食品健康': 80,
    '休闲零食': 50,
    '生鲜': 120,
    '亲子生活': 150,
    '母婴': 200,
    '童装': 120,
    '家居家电': 500,
    '家电': 800,
    '3C数码': 1200,
    '手机': 2500,
    '电脑': 4000,
    '运动户外': 300,
    '珠宝文玩': 1500,
    '珠宝': 3000,
    '虚拟商品': 50,
    '游戏充值': 30,
    '宠物食品': 150,
    '宠物用品': 120,
  }

  for (const category of categories) {
    if (categoryAOVBenchmarks[category]) {
      return categoryAOVBenchmarks[category]
    }
  }

  return 250
}

// ==================== 品类名称/店铺级别 ====================

export function getCategoryName(categories: string[]): string {
  return categories.length > 0 ? categories[0] : '全品类'
}

export function getStoreTier(gmv: number): { name: string; targetViewers: number } {
  if (gmv < 10000) {
    return { name: '小型', targetViewers: 500 }
  } else if (gmv < 50000) {
    return { name: '中型', targetViewers: 1000 }
  } else if (gmv < 200000) {
    return { name: '大型', targetViewers: 2000 }
  } else {
    return { name: '超大型', targetViewers: 5000 }
  }
}

// ==================== 店铺成长阶段 ====================

export const STAGE_LLM_HINT = ' 建议配置话术 LLM 后点击「智能生成」获取个性化待办。'

export function getStoreStage(gmv: number, duration: number, sessions: number): {
  stage: string
  name: string
  focus: string[]
  kpi: string[]
  description: string
} {
  const estimatedSessions = sessions || Math.max(1, Math.floor(duration / 2))

  if (gmv < 10000 || estimatedSessions < 10) {
    return {
      stage: 'cold_start',
      name: '冷启动期',
      focus: ['流量获取', '数据积累', '店铺基础搭建'],
      kpi: ['观看人数', '直播场次', '粉丝增长'],
      description: '新店铺或低GMV店铺，重点是积累基础数据和粉丝',
    }
  } else if (gmv < 100000) {
    return {
      stage: 'growth',
      name: '成长期',
      focus: ['转化率提升', '客单价优化', '复购率培养'],
      kpi: ['转化率', '客单价', '回购率'],
      description: '已有一定数据基础，重点是优化运营效率',
    }
  } else {
    return {
      stage: 'mature',
      name: '成熟期',
      focus: ['品牌建设', '私域运营', '供应链优化'],
      kpi: ['品牌力', '会员数', '利润率'],
      description: '已建立稳定运营，重点是品牌价值提升',
    }
  }
}

// ==================== 规则生成：基于阶段的任务 ====================

export function generateStageBasedTasks(
  stage: ReturnType<typeof getStoreStage>,
  storeInfo: any,
  currentStats: any,
  statsRecordCount: number = 99
): Array<{ title: string; description: string; priority: string; aiFeature?: string }> {
  const tasks = []

  if (stage.stage === 'cold_start') {
    const sessions = Math.max(1, Math.floor((currentStats.totalDuration || 0) / 2))
    const hasLittleHistory = statsRecordCount <= 2
    if (hasLittleHistory && sessions < 10) {
      tasks.push({
        title: '完成首月10场直播',
        description: `冷启动期，当前约 ${sessions} 场。目标首月 10 场。${STAGE_LLM_HINT}`,
        priority: 'urgent',
        aiFeature: 'schedule',
      })
    }
    if (hasLittleHistory && currentStats.totalViewers < 100) {
      tasks.push({
        title: '积累首批100个观众',
        description: `当前观众 ${currentStats.totalViewers}，目标 100。${STAGE_LLM_HINT}`,
        priority: 'urgent',
        aiFeature: 'content',
      })
    }
    const hasAudience = !!storeInfo?.targetAudience?.trim()
    const hasPositioning = !!storeInfo?.brandPositioning?.trim()
    const hasPriceRange = storeInfo?.minPrice != null || storeInfo?.maxPrice != null
    if (!hasAudience && !hasPositioning && !hasPriceRange) {
      tasks.push({
        title: '完善店铺定位和目标人群',
        description: `店铺定位信息未填。${STAGE_LLM_HINT}`,
        priority: 'normal',
        aiFeature: 'positioning',
      })
    }
  } else if (stage.stage === 'growth') {
    tasks.push({
      title: '建立数据分析周报制度',
      description: `成长期。${STAGE_LLM_HINT}`,
      priority: 'normal',
      aiFeature: 'report',
    })
    if (currentStats.totalOrders > 50) {
      tasks.push({
        title: '启动复购率提升计划',
        description: `已有订单 ${currentStats.totalOrders} 笔。${STAGE_LLM_HINT}`,
        priority: 'normal',
        aiFeature: 'crm',
      })
    }
  } else if (stage.stage === 'mature') {
    tasks.push({
      title: '建立品牌内容矩阵',
      description: `成熟期。${STAGE_LLM_HINT}`,
      priority: 'normal',
      aiFeature: 'brand',
    })
    tasks.push({
      title: '优化供应链和利润率',
      description: `成熟期，稳定运营。${STAGE_LLM_HINT}`,
      priority: 'normal',
      aiFeature: 'supply_chain',
    })
  }

  return tasks
}

// ==================== 规则生成：同比/环比任务 ====================

export function generateComparisonTasks(
  currentStats: { totalGMV: number; totalDuration: number; totalViewers: number; totalOrders: number; totalInteractions: number },
  yoyStats: { totalGMV: number; totalDuration: number; totalViewers: number; totalOrders: number; totalInteractions: number } | null,
  momStats: { totalGMV: number; totalDuration: number; totalViewers: number; totalOrders: number; totalInteractions: number } | null,
  storeInfo: any
): Array<{ title: string; description: string; priority: string; source: string }> {
  const tasks: Array<{ title: string; description: string; priority: string; source: string }> = []
  const currencySymbol = storeInfo?.currencySymbol ?? '¥'
  const region = storeInfo?.region || 'CN'
  const currencyName = region === '泰国' || region === 'TH' ? '泰铢' : region === '越南' || region === 'VN' ? '越南盾' : region === '印度尼西亚' || region === 'ID' ? '印尼盾' : region === '马来西亚' || region === 'MY' ? '马币' : region === '新加坡' || region === 'SG' ? '新币' : region === '菲律宾' || region === 'PH' ? '比索' : '人民币'

  if (yoyStats && yoyStats.totalGMV > 0) {
    const gmvChange = ((currentStats.totalGMV - yoyStats.totalGMV) / yoyStats.totalGMV) * 100
    const ordersChange = yoyStats.totalOrders > 0 ? ((currentStats.totalOrders - yoyStats.totalOrders) / yoyStats.totalOrders) * 100 : null
    const viewersChange = yoyStats.totalViewers > 0 ? ((currentStats.totalViewers - yoyStats.totalViewers) / yoyStats.totalViewers) * 100 : null

    if (gmvChange < -15) {
      tasks.push({
        title: `GMV 同比下降 ${Math.abs(gmvChange).toFixed(1)}%，需紧急优化`,
        description: `当前 GMV ${currentStats.totalGMV.toFixed(0)} ${currencyName}，去年同期 ${yoyStats.totalGMV.toFixed(0)} ${currencyName}，同比下降 ${Math.abs(gmvChange).toFixed(1)}%。建议：分析去年同期成功因素，对比当前直播内容、选品、价格策略差异，制定改进计划。`,
        priority: 'urgent',
        source: 'yoy_comparison',
      })
    } else if (gmvChange > 20) {
      tasks.push({
        title: `GMV 同比增长 ${gmvChange.toFixed(1)}%，巩固优势`,
        description: `当前 GMV ${currentStats.totalGMV.toFixed(0)} ${currencyName}，去年同期 ${yoyStats.totalGMV.toFixed(0)} ${currencyName}，同比增长 ${gmvChange.toFixed(1)}%。建议：总结本期成功经验，形成可复制的标准流程，在下月继续扩大优势。`,
        priority: 'normal',
        source: 'yoy_comparison',
      })
    }

    if (ordersChange !== null && ordersChange < -10) {
      tasks.push({
        title: `订单数同比下降 ${Math.abs(ordersChange).toFixed(1)}%，需分析转化路径`,
        description: `当前订单 ${currentStats.totalOrders} 笔，去年同期 ${yoyStats.totalOrders} 笔，同比下降 ${Math.abs(ordersChange).toFixed(1)}%。建议：检查直播间商品链接、优惠力度、主播话术转化环节，对比去年同期策略差异。`,
        priority: 'urgent',
        source: 'yoy_comparison',
      })
    }

    if (viewersChange !== null && viewersChange < -20) {
      tasks.push({
        title: `观看数同比下降 ${Math.abs(viewersChange).toFixed(1)}%，需加强引流`,
        description: `当前观看 ${currentStats.totalViewers} 人，去年同期 ${yoyStats.totalViewers} 人，同比下降 ${Math.abs(viewersChange).toFixed(1)}%。建议：增加短视频引流、优化直播预告、检查推流策略，对比去年同期流量来源。`,
        priority: 'urgent',
        source: 'yoy_comparison',
      })
    }
  }

  if (momStats && momStats.totalGMV > 0) {
    const gmvChange = ((currentStats.totalGMV - momStats.totalGMV) / momStats.totalGMV) * 100
    const ordersChange = momStats.totalOrders > 0 ? ((currentStats.totalOrders - momStats.totalOrders) / momStats.totalOrders) * 100 : null
    const viewersChange = momStats.totalViewers > 0 ? ((currentStats.totalViewers - momStats.totalViewers) / momStats.totalViewers) * 100 : null
    const durationChange = momStats.totalDuration > 0 ? ((currentStats.totalDuration - momStats.totalDuration) / momStats.totalDuration) * 100 : null
    const convCurrent = currentStats.totalViewers > 0 ? (currentStats.totalOrders / currentStats.totalViewers) * 100 : 0
    const convLast = momStats.totalViewers > 0 ? (momStats.totalOrders / momStats.totalViewers) * 100 : 0
    const convChange = convLast > 0 ? convCurrent - convLast : null
    const gmvPerHourCurrent = currentStats.totalDuration > 0 ? currentStats.totalGMV / currentStats.totalDuration : 0
    const gmvPerHourLast = momStats.totalDuration > 0 ? momStats.totalGMV / momStats.totalDuration : 0
    const gmvPerHourChange = gmvPerHourLast > 0 ? ((gmvPerHourCurrent - gmvPerHourLast) / gmvPerHourLast) * 100 : null

    if (gmvChange < -10) {
      tasks.push({
        title: `GMV 月同比下降 ${Math.abs(gmvChange).toFixed(1)}%，需快速止损`,
        description: `当前同期 GMV ${currentStats.totalGMV.toFixed(0)} ${currencyName}，上月同期 ${momStats.totalGMV.toFixed(0)} ${currencyName}，按自然日对比下降 ${Math.abs(gmvChange).toFixed(1)}%。建议：立即复盘上月同期成功场次，对比本月差异点（选品、价格、时段、话术），3 天内调整回正常水平。`,
        priority: 'urgent',
        source: 'mom_comparison',
      })
    } else if (gmvChange > 15) {
      tasks.push({
        title: `GMV 月同比增长 ${gmvChange.toFixed(1)}%，保持增长势头`,
        description: `当前同期 GMV ${currentStats.totalGMV.toFixed(0)} ${currencyName}，上月同期 ${momStats.totalGMV.toFixed(0)} ${currencyName}，按自然日对比增长 ${gmvChange.toFixed(1)}%。建议：及时总结本月增长经验，固化为标准操作流程，确保下月继续增长。`,
        priority: 'normal',
        source: 'mom_comparison',
      })
    }

    if (convChange !== null && convChange < -0.5) {
      tasks.push({
        title: `转化率月同比下降 ${Math.abs(convChange).toFixed(1)} 个百分点`,
        description: `当前同期转化率 ${convCurrent.toFixed(2)}%，上月同期 ${convLast.toFixed(2)}%，按自然日对比下降 ${Math.abs(convChange).toFixed(1)} 个百分点。建议：检查直播间商品价格竞争力、优惠活动力度、主播促单话术，对比上月同期高转化场次找差距。`,
        priority: 'urgent',
        source: 'mom_comparison',
      })
    } else if (convChange !== null && convChange > 1.0) {
      tasks.push({
        title: `转化率月同比提升 ${convChange.toFixed(1)} 个百分点，巩固优势`,
        description: `当前同期转化率 ${convCurrent.toFixed(2)}%，上月同期 ${convLast.toFixed(2)}%，按自然日对比提升 ${convChange.toFixed(1)} 个百分点。建议：总结本月转化提升的关键因素（话术、商品、促销），形成可复制的转化率优化方案。`,
        priority: 'normal',
        source: 'mom_comparison',
      })
    }

    if (ordersChange !== null && ordersChange < -15) {
      tasks.push({
        title: `订单数月同比下降 ${Math.abs(ordersChange).toFixed(1)}%`,
        description: `当前同期订单 ${currentStats.totalOrders} 笔，上月同期 ${momStats.totalOrders} 笔，按自然日对比下降 ${Math.abs(ordersChange).toFixed(1)}%。建议：2 天内分析订单下降原因（流量/转化/客单价），参考上月同期成功经验，调整选品与促销策略。`,
        priority: 'urgent',
        source: 'mom_comparison',
      })
    }

    if (viewersChange !== null && viewersChange < -20) {
      tasks.push({
        title: `观看数月同比下降 ${Math.abs(viewersChange).toFixed(1)}%，需加强引流`,
        description: `当前同期观看 ${currentStats.totalViewers} 人，上月同期 ${momStats.totalViewers} 人，按自然日对比下降 ${Math.abs(viewersChange).toFixed(1)}%。建议：增加短视频引流、优化直播预告、检查推流策略，对比上月同期流量来源。`,
        priority: 'urgent',
        source: 'mom_comparison',
      })
    } else if (viewersChange !== null && viewersChange > 30) {
      tasks.push({
        title: `观看数月同比增长 ${viewersChange.toFixed(1)}%，流量策略见效`,
        description: `当前同期观看 ${currentStats.totalViewers} 人，上月同期 ${momStats.totalViewers} 人，按自然日对比增长 ${viewersChange.toFixed(1)}%。建议：总结本月引流成功经验（短视频、预告、推流），扩大投入确保下月继续增长。`,
        priority: 'normal',
        source: 'mom_comparison',
      })
    }

    if (gmvPerHourChange !== null && gmvPerHourChange < -15) {
      tasks.push({
        title: `时均 GMV 月同比下降 ${Math.abs(gmvPerHourChange).toFixed(1)}%`,
        description: `当前同期时均 GMV ${gmvPerHourCurrent.toFixed(0)} ${currencyName}/小时，上月同期 ${gmvPerHourLast.toFixed(0)} ${currencyName}/小时，按自然日对比下降 ${Math.abs(gmvPerHourChange).toFixed(1)}%。建议：优化直播节奏与商品排期，在高峰时段集中推爆款，提升单位时间产出效率。`,
        priority: 'urgent',
        source: 'mom_comparison',
      })
    }

    if (durationChange !== null && durationChange < -20) {
      tasks.push({
        title: `直播时长月同比减少 ${Math.abs(durationChange).toFixed(1)}%`,
        description: `当前同期直播 ${currentStats.totalDuration.toFixed(1)} 小时，上月同期 ${momStats.totalDuration.toFixed(1)} 小时，按自然日对比减少 ${Math.abs(durationChange).toFixed(1)}%。建议：检查是否因人员、场地等原因导致开播减少，若是主动缩减则需提升单场产出效率。`,
        priority: 'normal',
        source: 'mom_comparison',
      })
    }
  }

  return tasks
}
