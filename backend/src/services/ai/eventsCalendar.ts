/**
 * AI 节日/赛事/季节日历模块
 * 负责：各地区节假日定义、即将到来的节日提醒、时间上下文（季节/气温）
 * 原属 aiTasksService.ts
 */

// ==================== 类型定义 ====================

export type EventDef = {
  name: string
  prepDays: number
  recommendation: string
  date?: string
  month?: number
  day?: number
}

// ==================== 节日计算工具 ====================

export function nextOccurrence(current: Date, month: number, day: number): Date {
  const thisYear = new Date(current.getFullYear(), month - 1, day)
  if (thisYear.getTime() > current.getTime()) return thisYear
  return new Date(current.getFullYear() + 1, month - 1, day)
}

// ==================== 各地区节日数据 (internal) ====================

const eventsByRegion: { [key: string]: EventDef[] } = {
  CN: [
    { name: '春节', month: 1, day: 29, prepDays: 20, recommendation: '准备年货、设计红包活动、春节主题直播' },
    { name: '情人节', month: 2, day: 14, prepDays: 14, recommendation: '礼品/鲜花/美妆/珠宝等品类爆发期，设计情侣礼盒、表白主题直播、限时满减' },
    { name: '元宵节', month: 2, day: 12, prepDays: 10, recommendation: '元宵主题商品、猜灯谜互动、团圆主题直播' },
    { name: '三八妇女节/女神节', month: 3, day: 8, prepDays: 14, recommendation: '美妆/服饰/珠宝/健康品类大促，女性向礼盒、女神专场、关爱主题直播' },
    { name: '母亲节', month: 5, day: 10, prepDays: 14, recommendation: '礼品/健康/家居/服饰等孝心消费高峰，母亲节礼盒、感恩主题、满赠活动' },
    { name: '618', month: 6, day: 18, prepDays: 14, recommendation: '设计满减活动、准备爆款商品、优化直播话术' },
    { name: '父亲节', month: 6, day: 15, prepDays: 14, recommendation: '男装/数码/酒类/健康品类增长点，父亲节礼盒、品质好物专场' },
    { name: '七夕', month: 8, day: 1, prepDays: 14, recommendation: '情侣礼品/美妆/珠宝/鲜花爆发，七夕限定、浪漫主题直播、双人礼盒' },
    { name: '万圣节', month: 10, day: 31, prepDays: 14, recommendation: '服饰/美妆/零食/派对用品增长，搞怪主题、限定装扮、糖果/礼包组合' },
    { name: '双11', month: 11, day: 11, prepDays: 14, recommendation: '提前备货、设计促销活动、准备直播脚本' },
    { name: '感恩节/黑五', month: 11, day: 29, prepDays: 10, recommendation: '跨境/海淘氛围浓，大促预热、爆款清单、限时秒杀' },
    { name: '双12', month: 12, day: 12, prepDays: 10, recommendation: '清理库存、设计年终促销、准备跨年活动' },
    { name: '圣诞节', month: 12, day: 25, prepDays: 20, recommendation: '礼品/美妆/服饰/食品等节日消费高峰，圣诞主题、礼盒组合、节日直播' },
  ],
  TH: [
    { name: '情人节', month: 2, day: 14, prepDays: 14, recommendation: '礼品/美妆/鲜花品类增长，情侣礼盒、浪漫主题直播' },
    { name: '宋干节', month: 4, day: 13, prepDays: 14, recommendation: '准备节日商品、设计泼水节主题活动' },
    { name: '母亲节', month: 8, day: 12, prepDays: 14, recommendation: '泰国母亲节（王后诞辰）礼品与感恩主题、家庭装与礼盒' },
    { name: '万圣节', month: 10, day: 31, prepDays: 14, recommendation: '派对/美妆/零食品类，搞怪主题、限定商品、直播互动' },
    { name: '水灯节', month: 11, day: 14, prepDays: 14, recommendation: '准备节日装饰、设计浪漫主题直播' },
    { name: '11.11大促', month: 11, day: 11, prepDays: 14, recommendation: 'TikTok/电商大促备货、促销脚本、爆款预热' },
    { name: '12.12大促', month: 12, day: 12, prepDays: 10, recommendation: '年终大促、清仓与礼品组合、直播排期' },
    { name: '圣诞节', month: 12, day: 25, prepDays: 20, recommendation: '礼品季、圣诞主题商品与直播' },
  ],
  VN: [
    { name: '情人节', month: 2, day: 14, prepDays: 14, recommendation: '礼品/美妆增长期，情侣礼盒与浪漫主题' },
    { name: '妇女节', month: 3, day: 8, prepDays: 14, recommendation: '女性向美妆/服饰/礼品大促' },
    { name: '越南国庆', month: 9, day: 2, prepDays: 10, recommendation: '国庆主题促销、本土品牌活动' },
    { name: '9.9大促', month: 9, day: 9, prepDays: 14, recommendation: '电商大促备货、满减与秒杀脚本' },
    { name: '万圣节', month: 10, day: 31, prepDays: 14, recommendation: '派对/美妆/零食品类，主题直播与限定商品' },
    { name: '11.11大促', month: 11, day: 11, prepDays: 14, recommendation: '大促备货、直播排期、促销话术' },
    { name: '12.12大促', month: 12, day: 12, prepDays: 10, recommendation: '年终促销、库存清理、礼品季' },
    { name: '圣诞节', month: 12, day: 25, prepDays: 20, recommendation: '礼品与圣诞主题直播' },
  ],
  ID: [
    { name: '情人节', month: 2, day: 14, prepDays: 14, recommendation: '礼品/美妆品类、情侣主题与礼盒' },
    { name: '开斋节', month: 3, day: 30, prepDays: 14, recommendation: '斋月/开斋节主题商品、节日礼盒、尊重当地习俗' },
    { name: '万圣节', month: 10, day: 31, prepDays: 14, recommendation: '派对/美妆/零食、主题直播与促销' },
    { name: 'Harbolnas 12.12', month: 12, day: 12, prepDays: 14, recommendation: '印尼网购节备货、大促直播、本土化促销' },
    { name: '11.11大促', month: 11, day: 11, prepDays: 14, recommendation: '电商大促、直播与短视频预热' },
    { name: '圣诞节', month: 12, day: 25, prepDays: 20, recommendation: '礼品季、圣诞主题与直播' },
  ],
  MY: [
    { name: '情人节', month: 2, day: 14, prepDays: 14, recommendation: '礼品/美妆、情侣主题与礼盒' },
    { name: '妇女节', month: 3, day: 8, prepDays: 14, recommendation: '女性向美妆/服饰大促' },
    { name: '开斋节', month: 4, day: 10, prepDays: 14, recommendation: '开斋节主题、礼品与家庭装、尊重当地习俗' },
    { name: '万圣节', month: 10, day: 31, prepDays: 14, recommendation: '派对/美妆/零食、主题直播' },
    { name: '11.11大促', month: 11, day: 11, prepDays: 14, recommendation: '大促备货、直播与满减活动' },
    { name: '12.12大促', month: 12, day: 12, prepDays: 10, recommendation: '年终促销、跨年活动' },
    { name: '圣诞节', month: 12, day: 25, prepDays: 20, recommendation: '礼品季、圣诞主题直播' },
  ],
  SG: [
    { name: '情人节', month: 2, day: 14, prepDays: 14, recommendation: '礼品/美妆、情侣礼盒与主题直播' },
    { name: '妇女节', month: 3, day: 8, prepDays: 14, recommendation: '女性向品类大促' },
    { name: '新加坡国庆', month: 8, day: 9, prepDays: 10, recommendation: '国庆主题促销、本地化直播' },
    { name: '万圣节', month: 10, day: 31, prepDays: 14, recommendation: '派对/美妆/零食、主题促销' },
    { name: '11.11大促', month: 11, day: 11, prepDays: 14, recommendation: '大促备货、直播促销' },
    { name: '12.12大促', month: 12, day: 12, prepDays: 10, recommendation: '年终大促、圣诞季预热' },
    { name: '圣诞节', month: 12, day: 25, prepDays: 20, recommendation: '礼品季、圣诞主题直播' },
  ],
  PH: [
    { name: '情人节', month: 2, day: 14, prepDays: 14, recommendation: '礼品/美妆/鲜花、情侣主题与礼盒' },
    { name: '万圣节', month: 10, day: 31, prepDays: 14, recommendation: '派对/美妆/零食、搞怪主题与限定' },
    { name: '11.11大促', month: 11, day: 11, prepDays: 14, recommendation: '大促备货、直播与促销' },
    { name: '12.12大促', month: 12, day: 12, prepDays: 10, recommendation: '年终促销、圣诞前冲刺' },
    { name: '圣诞节', month: 12, day: 25, prepDays: 20, recommendation: '圣诞主题商品、礼品组合、节日直播' },
  ],
}

const regionAlias: { [key: string]: string } = {
  '中国': 'CN', '中国香港': 'CN', '中国台湾': 'CN', 'CN': 'CN',
  '泰国': 'TH', '越南': 'VN', '印度尼西亚': 'ID', '马来西亚': 'MY',
  '新加坡': 'SG', '菲律宾': 'PH', '缅甸': 'TH', '柬埔寨': 'TH', '老挝': 'TH', '文莱': 'MY',
}

// ==================== 即将到来的节日 ====================

export function getUpcomingEvents(region: string, currentDate: Date): Array<{
  name: string
  date: string
  daysUntil: number
  prepDays: number
  recommendation: string
}> {
  const regionNorm = (region || '').trim()
  const regionKey = regionAlias[regionNorm] || regionNorm
  const regionEvents = eventsByRegion[regionKey] || eventsByRegion['CN']

  return regionEvents
    .map((event): { name: string; date: string; daysUntil: number; prepDays: number; recommendation: string } | null => {
      let eventDate: Date
      if (event.date) {
        eventDate = new Date(event.date)
      } else if (event.month != null && event.day != null) {
        eventDate = nextOccurrence(currentDate, event.month, event.day)
      } else {
        return null
      }
      const daysUntil = Math.ceil((eventDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24))
      if (daysUntil <= 0 || daysUntil > event.prepDays) return null
      return { name: event.name, date: eventDate.toISOString().slice(0, 10), daysUntil, prepDays: event.prepDays, recommendation: event.recommendation }
    })
    .filter((e): e is NonNullable<typeof e> => e != null)
    .sort((a, b) => a.daysUntil - b.daysUntil)
}

// ==================== 时间上下文 ====================

export function getTimeContext(region?: string): {
  currentSeason: 'winter' | 'spring' | 'summer' | 'autumn'
  currentMonth: number
  seasonLabel: string
  temperatureBand: '炎热' | '温暖' | '凉爽' | '寒冷' | '热带雨季' | '热带旱季'
  weatherHint: string
} {
  const now = new Date()
  const currentMonth = now.getMonth() + 1
  let currentSeason: 'winter' | 'spring' | 'summer' | 'autumn' = 'spring'
  let seasonLabel = '春季'
  if ([12, 1, 2].includes(currentMonth)) { currentSeason = 'winter'; seasonLabel = '冬季' }
  else if ([3, 4, 5].includes(currentMonth)) { currentSeason = 'spring'; seasonLabel = '春季' }
  else if ([6, 7, 8].includes(currentMonth)) { currentSeason = 'summer'; seasonLabel = '夏季' }
  else if ([9, 10, 11].includes(currentMonth)) { currentSeason = 'autumn'; seasonLabel = '秋季' }

  const regionNorm = (region || 'CN').trim()
  const tropicalRegions = ['TH', 'VN', 'ID', 'MY', 'SG', 'PH', '泰国', '越南', '印度尼西亚', '马来西亚', '新加坡', '菲律宾']
  const isTropical = tropicalRegions.some((r) => regionNorm.toUpperCase().includes(r) || regionNorm.includes(r))

  let temperatureBand: '炎热' | '温暖' | '凉爽' | '寒冷' | '热带雨季' | '热带旱季' = '温暖'
  let weatherHint: string

  if (isTropical) {
    const isRainySeason = currentMonth >= 5 && currentMonth <= 10
    const isPeakHot = currentMonth >= 3 && currentMonth <= 5
    if (isRainySeason && isPeakHot) { temperatureBand = '热带雨季'; weatherHint = '当前为热带雨季且体感偏热，防暑降温、雨具、室内/宅家场景相关品类需求上升' }
    else if (isRainySeason) { temperatureBand = '热带雨季'; weatherHint = '当前为热带雨季，雨具、除湿、室内娱乐、防霉等场景需求上升' }
    else if (currentMonth >= 12 || currentMonth <= 2) { temperatureBand = '热带旱季'; weatherHint = '当前为旱季且相对凉爽，户外与旅游、防晒、补水、轻便服饰等需求上升' }
    else { temperatureBand = '热带旱季'; weatherHint = '当前为旱季，防晒、补水、户外活动相关品类需求较好' }
  } else {
    if ([12, 1, 2].includes(currentMonth)) { temperatureBand = '寒冷'; weatherHint = '当前气温偏寒，保暖、热饮、室内场景、冬季护肤等需求上升' }
    else if ([3, 4, 5].includes(currentMonth)) { temperatureBand = '温暖'; weatherHint = '当前气温回暖，换季服饰、户外、春游、过敏防护等需求上升' }
    else if ([6, 7, 8].includes(currentMonth)) { temperatureBand = '炎热'; weatherHint = '当前气温偏高，防暑降温、冷饮、防晒、夏季服饰与空调相关需求上升' }
    else { temperatureBand = '凉爽'; weatherHint = '当前气温转凉，秋装、润燥、换季护肤、室内保暖等需求上升' }
  }

  return { currentSeason, currentMonth, seasonLabel, temperatureBand, weatherHint }
}
