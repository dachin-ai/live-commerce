export type TFunctionLike = (key: string, opts?: { defaultValue?: string; fallback?: string }) => string

// 注意：这里的 id 是系统内部“国家/地区”标识（当前为中文），用于与后端/数据库对齐。
// UI 展示时必须走 i18n，否则会出现英文界面里仍显示中文国家名。
const COUNTRY_KEY_BY_ID: Record<string, string> = {
  '中国': 'regions.countries.china',
  '中国香港': 'regions.countries.hongKongChina',
  '中国台湾': 'regions.countries.taiwanChina',
  '印度': 'regions.countries.india',
  '泰国': 'regions.countries.thailand',
  '越南': 'regions.countries.vietnam',
  '印度尼西亚': 'regions.countries.indonesia',
  '马来西亚': 'regions.countries.malaysia',
  '新加坡': 'regions.countries.singapore',
  '菲律宾': 'regions.countries.philippines',
  '缅甸': 'regions.countries.myanmar',
  '柬埔寨': 'regions.countries.cambodia',
  '老挝': 'regions.countries.laos',
  '文莱': 'regions.countries.brunei',
  '其他': 'regions.countries.other',
}

export function getCountryLabel(t: TFunctionLike, id: string): string {
  const key = COUNTRY_KEY_BY_ID[id]
  if (!key) return id
  const v = t(key, { defaultValue: id }) as unknown
  return typeof v === 'string' && v.trim() ? v : id
}

