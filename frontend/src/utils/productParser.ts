export function parseProductText(text: string) {
  const result = {
    productName: '',
    price: '',
    coreFeatures: '',
    competitorLink: '',
    afterSalesInfo: '',
  }

  // Helper to extract a single line value
  const extractLine = (regex: RegExp) => {
    const match = text.match(regex)
    return match ? match[1].trim() : ''
  }

  // 1. Extract Product Name: e.g. "品名：freemir 24cm车亮卷边煎锅"
  result.productName = extractLine(/(?:品名|产品名称|商品名称)[：:\s]+([^\n]+)/)

  // 2. Extract Price (if available) -> there isn't a direct price field in the provided sample, but we add standard match just in case
  result.price = extractLine(/(?:价格|单价|售价)[：:\s]+([^\n]+)/)

  // 3. Extract Core Features: typically from "产品卖点：" until "使用小贴士：" or "英文描述" or another major section
  // Since the user's template contains "产品卖点：1... 2...", we can match the block
  const featuresMatch = text.match(/(?:产品卖点|核心卖点|性能描述|产品特点)[：:\s]*\n*([\s\S]*?)(?=\n[^\n]+[：:]|\n\n|使用小贴士|售后|英文描述|$)/)
  if (featuresMatch) {
    result.coreFeatures = featuresMatch[1].trim()
  }

  // 4. Extract After Sales Info/Usage Tips: from "使用小贴士：" until next section or end
  const usageTipsMatch = text.match(/(?:使用小贴士|使用说明|售后说明|注意事项)[：:\s]*\n*([\s\S]*?)(?=\n[^\n]+[：:]|\n\n|英文描述|$)/)
  if (usageTipsMatch) {
    result.afterSalesInfo = usageTipsMatch[1].trim()
  }

  return result
}
