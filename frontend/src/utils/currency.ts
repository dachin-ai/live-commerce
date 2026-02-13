/**
 * 人民币对多国货币：展示与换算
 * 基准：1 人民币(CNY) = rateToCny 单位外币（如 1 CNY = 5 THB）
 * 数值为店铺货币时：value_cny = value_store / rateToCny(store)
 * 显示为某币种时：value_display = value_cny * rateToCny(display)
 */

export interface CurrencyOption {
  code: string
  name: string
  symbol: string
  /** 1 人民币 = rateToCny 单位该货币 */
  rateToCny: number
}

/** 人民币对多国：1 CNY = rateToCny 单位该货币（参考汇率） */
export const CURRENCIES: CurrencyOption[] = [
  { code: 'CNY', name: '人民币', symbol: '¥', rateToCny: 1 },
  { code: 'USD', name: '美元', symbol: '$', rateToCny: 0.14 },
  { code: 'THB', name: '泰铢', symbol: '฿', rateToCny: 5 },
  { code: 'VND', name: '越南盾', symbol: '₫', rateToCny: 3500 },
  { code: 'IDR', name: '印尼盾', symbol: 'Rp', rateToCny: 2200 },
  { code: 'MYR', name: '林吉特', symbol: 'RM', rateToCny: 0.65 },
  { code: 'SGD', name: '新加坡元', symbol: 'S$', rateToCny: 0.19 },
  { code: 'HKD', name: '港币', symbol: 'HK$', rateToCny: 1.1 },
  { code: 'TWD', name: '新台币', symbol: 'NT$', rateToCny: 4.4 },
  { code: 'PHP', name: '菲律宾比索', symbol: '₱', rateToCny: 8 },
  { code: 'MMK', name: '缅元', symbol: 'K', rateToCny: 280 },
  { code: 'KHR', name: '瑞尔', symbol: '៛', rateToCny: 580 },
  { code: 'LAK', name: '基普', symbol: '₭', rateToCny: 2400 },
  { code: 'BND', name: '文莱元', symbol: 'B$', rateToCny: 0.19 },
]

const byCode = new Map(CURRENCIES.map((c) => [c.code, c]))

export function getCurrencyByCode(code: string): CurrencyOption | undefined {
  return byCode.get(code) ?? (code === 'CNY' ? CURRENCIES[0] : undefined)
}

export function getDisplaySymbol(code: string): string {
  return getCurrencyByCode(code)?.symbol ?? '¥'
}

/** 将「来自 fromCode 的金额」换算为「toCode 的金额」 */
export function convertAmount(amount: number, fromCode: string, toCode: string): number {
  if (fromCode === toCode) return amount
  const from = getCurrencyByCode(fromCode)
  const to = getCurrencyByCode(toCode)
  if (!from || !to) return amount
  const cny = amount / from.rateToCny
  return cny * to.rateToCny
}

/** 展示用选项：店铺货币(store) + 人民币 + 多国 */
export function getDisplayOptions(storeCurrencyCode?: string): { value: string; label: string }[] {
  const store = storeCurrencyCode ? getCurrencyByCode(storeCurrencyCode) : null
  const base = [{ value: 'store', label: store ? `店铺货币 (${store.symbol} ${storeCurrencyCode})` : '店铺货币' }]
  const rest = CURRENCIES.filter((c) => c.code !== storeCurrencyCode).map((c) => ({
    value: c.code,
    label: `${c.name} (${c.symbol} ${c.code})`,
  }))
  return [...base, ...rest]
}
