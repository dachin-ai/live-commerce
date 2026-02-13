import express from 'express'

const router = express.Router()

// 国家列表：中国 + 东南亚等（仅国家，无区域子级）
const countries = [
  { id: '中国', name: '中国' },
  { id: '中国香港', name: '中国香港' },
  { id: '中国台湾', name: '中国台湾' },
  { id: '泰国', name: '泰国' },
  { id: '越南', name: '越南' },
  { id: '印度尼西亚', name: '印度尼西亚' },
  { id: '马来西亚', name: '马来西亚' },
  { id: '新加坡', name: '新加坡' },
  { id: '菲律宾', name: '菲律宾' },
  { id: '缅甸', name: '缅甸' },
  { id: '柬埔寨', name: '柬埔寨' },
  { id: '老挝', name: '老挝' },
  { id: '文莱', name: '文莱' },
  { id: '其他', name: '其他' },
]

// 按国家返回货币（接口仍用 region 参数名，前端传 country 即可）
const countryCurrencyMap: Record<string, { currency: string; symbol: string; code: string }> = {
  '中国': { currency: '人民币', symbol: '¥', code: 'CNY' },
  '中国香港': { currency: '港币', symbol: 'HK$', code: 'HKD' },
  '中国台湾': { currency: '新台币', symbol: 'NT$', code: 'TWD' },
  '泰国': { currency: '泰铢', symbol: '฿', code: 'THB' },
  '越南': { currency: '越南盾', symbol: '₫', code: 'VND' },
  '印度尼西亚': { currency: '印尼盾', symbol: 'Rp', code: 'IDR' },
  '马来西亚': { currency: '林吉特', symbol: 'RM', code: 'MYR' },
  '新加坡': { currency: '新加坡元', symbol: 'S$', code: 'SGD' },
  '菲律宾': { currency: '菲律宾比索', symbol: '₱', code: 'PHP' },
  '缅甸': { currency: '缅元', symbol: 'K', code: 'MMK' },
  '柬埔寨': { currency: '瑞尔', symbol: '៛', code: 'KHR' },
  '老挝': { currency: '基普', symbol: '₭', code: 'LAK' },
  '文莱': { currency: '文莱元', symbol: 'B$', code: 'BND' },
  '其他': { currency: '人民币', symbol: '¥', code: 'CNY' },
}

/** 获取国家对应货币（query 传 region=国家名，兼容原“区域”叫法）；返回带 country 便于前端校验 */
router.get('/currency', async (req, res) => {
  try {
    const { region } = req.query
    const countryOrRegion = typeof region === 'string' && region.trim() ? region.trim() : '中国'
    const currencyInfo = countryCurrencyMap[countryOrRegion] || {
      currency: '人民币',
      symbol: '¥',
      code: 'CNY',
    }
    res.json({ ...currencyInfo, country: countryOrRegion })
  } catch (error) {
    console.error('获取货币信息失败:', error)
    res.status(500).json({ error: '获取货币信息失败' })
  }
})

/** 获取国家列表（中国 + 东南亚等） */
router.get('/countries', async (_req, res) => {
  try {
    res.json(countries)
  } catch (error) {
    console.error('获取国家列表失败:', error)
    res.status(500).json({ error: '获取国家列表失败' })
  }
})

/** 兼容旧接口：按国家返回“区域”列表，现仅国家无区域，返回 [国家名] */
router.get('/', async (req, res) => {
  try {
    const raw = req.query.country
    const country = typeof raw === 'string' && raw.trim() ? raw.trim() : '中国'
    const hasCountry = countries.some(c => c.id === country)
    res.json(hasCountry ? [country] : ['中国'])
  } catch (error) {
    console.error('获取区域列表失败:', error)
    res.status(500).json({ error: '获取区域列表失败' })
  }
})

export default router
