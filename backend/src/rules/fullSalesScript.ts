/**
 * 完整销售流程话术生成
 * 基于用户提供的转化漏斗逻辑：圈人群-塑品-打消顾虑-利益点-售后-逼单
 */

import { platformDisallowsReviewCashback } from './platformCompliance'
import { getDefaultScriptPhrase } from './loadScriptRulesConfig'

const ZH = 'zh-CN'

export interface FullSalesParams {
  productName: string
  price?: string
  features?: string
  addressTerm?: string
  painPointsHint?: string
  promoCopy?: string
  targetAudience?: string
  /** 平台标识，用于售后话术是否口播晒单返现等（部分平台禁止） */
  platform?: string
}

type ProductType = 'pet' | 'beauty' | 'food' | 'fashion' | 'home' | 'digital' | 'general'

/** 产品特点与品类明显不符时（如猫笼却填美妆成分），用品类默认卖点，避免话术错位 */
function resolveFeaturesForProduct(productName: string, productType: ProductType, features?: string): string {
  const raw = (features || '').trim()
  if (!raw) return productType === 'pet' ? '安全好清洗、耐用' : productType === 'beauty' ? '温和好用' : '高品质'
  const isBeautyTerms = /烟酰胺|美白|淡斑|保湿|精华|面膜|护肤|成分/i.test(raw)
  const isPet = productType === 'pet'
  const isBeauty = productType === 'beauty'
  if (isPet && isBeautyTerms) return '安全好清洗、耐用、不伤宠物'
  if (isBeauty && !isBeautyTerms && /如\s*:/.test(raw)) return '温和好用、成分靠谱'
  return raw
}

/** 构建完整销售流程话术（中文） */
export function buildFullSalesScript(params: FullSalesParams): string {
  const { productName, price, features, addressTerm, painPointsHint, promoCopy, platform } = params
  const hasPrice = price != null && String(price).trim() !== ''
  const priceNum = hasPrice ? parseInt(String(price).replace(/[^0-9]/g, ''), 10) : 0
  const originalPrice = priceNum > 0 ? Math.floor(priceNum * 2.8) : 0
  const saveMoney = originalPrice - priceNum
  const audience = addressTerm || '家人们'
  const painHint = painPointsHint || '好用、实惠、品质靠谱'
  const productType = detectProductType(productName)
  const featuresText = resolveFeaturesForProduct(productName, productType, features)

  const step1 = generateStep1_TargetAndNeed(productName, productType, audience, painHint)
  const step2 = generateStep2_SellingPoints(productName, productType, featuresText)
  const step3 = generateStep3_HandleDoubts(productName, productType)
  const step4 = generateStep4_Benefits(productName, hasPrice, priceNum, originalPrice, saveMoney, promoCopy)
  const step5 = generateStep5_AfterSales(productName, platform)
  const step6 = generateStep6_Closing(productName, hasPrice, priceNum, featuresText, promoCopy)

  return `【完整销售流程话术 · 5-10分钟】

※ 以下每一步标题下方整段即为成品话术稿，无小标题、无分条，可直接照念。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
第一步：圈人群 + 塑品（建议 20-30 秒）· 成品话术稿
━━━━━━━━━━━━━━━━━━━━━━━━━━━

${step1}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
第二步：卖点提炼（建议 25-35 秒）· 成品话术稿
━━━━━━━━━━━━━━━━━━━━━━━━━━━

${step2}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
第三步：打消顾虑（建议 20-30 秒）· 成品话术稿
━━━━━━━━━━━━━━━━━━━━━━━━━━━

${step3}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
第四步：利益点（建议 20-30 秒）· 成品话术稿
━━━━━━━━━━━━━━━━━━━━━━━━━━━

${step4}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
第五步：售后保障（建议 10-15 秒）· 成品话术稿
━━━━━━━━━━━━━━━━━━━━━━━━━━━

${step5}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
第六步：逼单（建议 15-20 秒）· 成品话术稿
━━━━━━━━━━━━━━━━━━━━━━━━━━━

${step6}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 使用建议
━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. 以上每步均为成品稿，可直接照念或稍作口语化调整
2. 可循环播放：塑品-打消顾虑-营销-售后-逼单
3. 第二步卖点建议做成手卡或KT板举起展示；可结合商品评论深挖卖点
4. 第三步需实时回复公屏问题，灵活穿插
5. 第四步赠品与折扣请按实际活动修改
6. 整个流程约5-10分钟，可拆分使用各环节`
}

function detectProductType(productName: string): ProductType {
  const name = productName.toLowerCase()
  if (name.includes('猫') || name.includes('宠') || name.includes('狗') || name.includes('pet')) return 'pet'
  if (name.includes('护肤') || name.includes('美白') || name.includes('精华') || name.includes('面膜') || name.includes('美妆')) return 'beauty'
  if (name.includes('食品') || name.includes('零食') || name.includes('茶') || name.includes('咖啡')) return 'food'
  if (name.includes('衣') || name.includes('服装') || name.includes('鞋') || name.includes('包')) return 'fashion'
  if (name.includes('家居') || name.includes('电器') || name.includes('厨具')) return 'home'
  if (name.includes('数码') || name.includes('手机') || name.includes('电脑')) return 'digital'
  return 'general'
}

function generateStep1_TargetAndNeed(
  productName: string,
  productType: ProductType,
  audience: string,
  painPointsHint: string
): string {
  const useCustomPain = painPointsHint && painPointsHint !== '好用、实惠、品质靠谱'
  let needType1: string
  let needType2: string
  let productBasic: string
  if (productType === 'pet') {
    needType1 = '想给主子最好的生活，让它健康快乐每一天'
    needType2 = useCustomPain ? painPointsHint : '家里主子的用品不够好，总担心影响它健康'
    productBasic = `今天给大家带来这款${productName}，专门为养宠家庭设计的！`
  } else if (productType === 'beauty') {
    needType1 = '想要拥有光滑透亮的好皮肤，自信满满'
    needType2 = '皮肤暗沉、毛孔粗大，每天照镜子都不满意'
    productBasic = `今天给大家带来这款${productName}，你们的皮肤救星来了！`
  } else if (productType === 'food') {
    needType1 = '想吃得健康又美味，不用担心热量和添加剂'
    needType2 = '办公室零食要么不健康，要么不好吃，每天下午茶都很纠结'
    productBasic = `今天给大家带来这款${productName}，健康零食的天花板！`
  } else if (productType === 'fashion') {
    needType1 = '想穿得好看又舒服，走到哪都有回头率'
    needType2 = '衣柜满满但总觉得没衣服穿，好看的太贵，便宜的质量差'
    productBasic = `今天给大家带来这款${productName}，时尚达人的必备单品！`
  } else if (productType === 'home') {
    needType1 = '想让家里更温馨舒适，提升生活品质'
    needType2 = '家里东西不顺手，每次用都觉得不方便'
    productBasic = `今天给大家带来这款${productName}，让你的家升级！`
  } else {
    needType1 = '想要提升生活品质，让每一天都过得更好'
    needType2 = useCustomPain ? painPointsHint : '现在用的产品不够好，总觉得有改善空间'
    productBasic = `今天给大家带来这款${productName}，品质生活的选择！`
  }
  return `${audience}，今天这款特别适合你们！你们是不是也想${needType1}？还是说现在正为${needType2}发愁？${productBasic}接下来我重点说几个大家最关心的——为什么值得买、怎么选、买了放心不。`
}

/** 第二步：用场景/痛点带出卖点，避免干巴巴罗列，增强代入感 */
function generateStep2_SellingPoints(productName: string, productType: ProductType, featuresText: string): string {
  if (productType === 'pet') {
    return `很多铲屎官最怕啥？笼子难洗、猫一啃就坏、还怕材质不安全。大家看这款${productName}：${featuresText}，好清洗、不藏污纳垢，材质安全猫啃也不怕，主子用得放心你也省心。耐用不易坏，一个能用好几年，省钱；颜值还高，拍照发朋友圈都好看。高意向的家人们，你们最需要的就是这个——安全、好打理、用得久。`
  }
  if (productType === 'beauty') {
    return `很多姐妹是不是这样：试了一堆产品，要么没效果要么刺激？这款${productName}，${featuresText}，温和不刺激，很多用户反馈一周左右就能看到变化。大牌同厂、成分靠谱，价格只要专柜的三分之一；质地清爽不油腻，夏天也能用。高意向的家人们，想要好皮肤又怕踩雷的，可以重点看这里。`
  }
  if (productType === 'food') {
    return `下午饿了又怕胖、零食不健康？这款${productName}，${featuresText}，0添加健康又好吃，很多在减肥的姐妹也放心囤。独立包装，办公室、出差带着都方便；口味多选，总有一款适合你。高意向的家人们，想解馋又不想有负担的，就是它了。`
  }
  return `大家是不是也遇到过：同类产品太多不知道选哪个、怕买回来不好用？这款${productName}，${featuresText}，品质有保证，用过都说好。性价比高、设计顺手、耐用不是一次性的，高意向的家人们可以重点看——要的就是好用、省心、用得久。`
}

function generateStep3_HandleDoubts(productName: string, productType: ProductType): string {
  let qa1: string
  let qa2: string
  let qa3: string
  if (productType === 'pet') {
    qa1 = '家人们问材质安全吗、有没有异味——食品级不锈钢/硅胶，无毒无味，通过质检，放心给主子用！'
    qa2 = '有的家人说我家猫狗挑食，用新碗会不会不吃？碗口设计符合宠物习惯，而且无异味，主子适应很快，评论里都说换了就用！'
    qa3 = '有不同尺寸吗？有三个尺寸可选！小号适合猫和小型犬，中号适合中型犬，大号适合大型犬，看我打在公屏上的规格表！'
  } else if (productType === 'beauty') {
    qa1 = '敏感肌会不会过敏？温和配方，敏感肌可用，我们有敏感肌测试报告，而且支持试用装，先试后买！'
    qa2 = '多久能见效？一般7-14天就能看到变化，我们有真实用户对比图，你们看这个Before跟After，效果明显！'
    qa3 = '和某某大牌比怎么样？同厂代工，成分几乎一样，但价格只要大牌的三分之一！省下的钱够你多买两瓶了！'
  } else if (productType === 'food') {
    qa1 = '保质期多久、会不会不新鲜？现货都是最新日期，保质期12个月，独立包装密封好，新鲜度有保证！'
    qa2 = '热量高吗、我在减肥？每100克只有很少卡路里，比薯片低一半！健康配方，减肥期也能吃！'
    qa3 = '口味怎么选？推荐先买经典口味，最多人回购的！喜欢尝鲜可以买混合装，每个口味都试试！'
  } else {
    qa1 = `这个${productName}质量怎么样？质量有保证，我们提供质保，评论区好评如潮，返修率极低！`
    qa2 = '和其他品牌比有什么优势？性价比最高！同样品质我们更便宜，而且服务更好！'
    qa3 = '适合我吗、我不太会用？操作超简单，随货送说明书和视频教程，不会用随时联系客服，一对一教学！'
  }
  return `好，挑几个大家最常问的说一下。公屏有问题的也可以打出来。${qa1} ${qa2} ${qa3}还有别的疑问直接公屏或评论区问，我来帮你们选。用过${productName}的家人也可以评论区说说感受，给新来的朋友参考。`
}

function generateStep4_Benefits(
  productName: string,
  hasPrice: boolean,
  priceNum: number,
  originalPrice: number,
  saveMoney: number,
  promoCopy?: string
): string {
  const defaultGift = getDefaultScriptPhrase('defaultGiftLine', ZH)
  const defaultDeadline = getDefaultScriptPhrase('defaultDeadlineLine', ZH)
  const noPricePlaceholder = getDefaultScriptPhrase('noPricePlaceholder', ZH)

  if (promoCopy && promoCopy.trim()) {
    const priceBlock = hasPrice
      ? `重点说下价格：市场价要${originalPrice}左右，今天直播间${priceNum}元，省${saveMoney}，相当于${Math.floor((priceNum / originalPrice) * 10)}折。这个价你们比一比就知道，外面很难拿到。`
      : `今天直播间${noPricePlaceholder}，具体看小黄车/详情页，欲购从速。`
    return `福利先说清楚：${promoCopy.trim()}\n\n${priceBlock}\n\n${defaultDeadline}`
  }

  if (hasPrice) {
    const discount = Math.floor((priceNum / originalPrice) * 10)
    const priceBlock = `价格直接说：市场价${originalPrice}左右，专柜更贵；今天直播间${priceNum}元，省${saveMoney}，相当于${discount}折。某宝某东同款什么价大家可以去比，我们直播间这个价真的可以。`
    return `${defaultGift}\n\n${priceBlock}\n\n${defaultDeadline}`
  }

  return `${defaultGift}\n\n今天直播间${noPricePlaceholder}，具体看小黄车/详情页！\n\n${defaultDeadline}`
}

function generateStep5_AfterSales(productName: string, platform?: string): string {
  const noReviewCashback = platform != null && platformDisallowsReviewCashback(platform)
  const cardDesc = noReviewCashback
    ? '包裹里都有售后小卡片，客服、使用说明、复购券都在上头。'
    : '包裹里都有售后小卡片，客服、使用说明、复购券都在上头。'
  return `很多家人会问：${productName}买回去不合适咋办？有质量问题呢？跟大家说清楚：不喜欢、7天无理由退，运费我们出；有质量问题直接换新，来回运费也算我们的。正品、正规售后不用愁。今天拍下明天发，包邮，一般 48 小时内到。有问题找卡片上的客服就行。${cardDesc}总之买得放心、用得安心，有问题找我。`
}

function generateStep6_Closing(productName: string, hasPrice: boolean, priceNum: number, featuresText: string, promoCopy?: string): string {
  const defaultPromo = getDefaultScriptPhrase('defaultPromoLine', ZH)
  const noPricePlaceholder = getDefaultScriptPhrase('noPricePlaceholder', ZH)
  const promoLine = promoCopy && promoCopy.trim() ? promoCopy.trim() : defaultPromo
  const priceLine = hasPrice
    ? `这款${productName}，原价${Math.floor(priceNum * 2.8)}今天${priceNum}，`
    : `这款${productName}今天${noPricePlaceholder}，`
  return `简单总结一下：${productName}，${featuresText}。${priceLine}${promoLine}支持7天无理由、有问题包换、48小时内发。库存不多了，刚已经出了不少，要的赶紧。数三个数就切下一个品了——3、2、1，点小黄车下单，手慢无。`
}
