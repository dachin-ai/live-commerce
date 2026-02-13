/**
 * 直播话术生成提示词模板
 * 按话术类型 + 语言生成专业化提示词
 * 重点：生成直接可用的话术，而非模板占位符
 */

import { buildFullSalesScript } from './fullSalesScript'
import { getDefaultScriptPhrasesForLang } from './loadScriptRulesConfig'
import type { ScriptType } from './scriptGeneration'

export interface ScriptContentParams {
  productName: string
  /** 产品 SKU（可选） */
  productSku?: string
  price?: string
  features?: string
  targetAudience?: string
  addressTerm?: string
  painPointsHint?: string
  promoCopy?: string
  /** 平台标识，用于完整流程话术中的售后是否口播晒单返现等 */
  platform?: string
}

/** 构建话术内容（基于类型 + 语言 + 产品信息） */
export function buildScriptContent(
  scriptType: ScriptType,
  language: string,
  params: ScriptContentParams
): string {
  if (scriptType === 'full-sales') {
    return buildFullSalesScript({
      ...params,
      platform: params.platform,
    })
  }
  if (language === 'zh-CN') return buildChineseScript(scriptType, params)
  if (language === 'en-US') return buildEnglishScript(scriptType, params)
  if (language === 'th-TH') return buildThaiScript(scriptType, params)
  return buildChineseScript('interaction', params)
}

function buildChineseScript(scriptType: ScriptType, params: ScriptContentParams): string {
  const { productName, price, features, addressTerm, painPointsHint, promoCopy } = params
  const audience = addressTerm || '家人们'
  const painHint = painPointsHint || '好用、实惠、品质靠谱'
  const phrases = getDefaultScriptPhrasesForLang('zh-CN')
  const priceText = price && String(price).trim() ? `只要${price}` : phrases.noPricePlaceholder['zh-CN']
  const rankHint = phrases.interactionRankHint['zh-CN']

  if (scriptType === 'interaction') {
    return `【人群互动话术 · 20-40秒】以下为可直接念的成品话术稿。

家人们，来晚了的扣1！今天给大家带来${productName}，${priceText}！

谁家里用过${productName}的？评论区扣666告诉我，好不好用你们说了算！

${audience}，有没有正在为${painHint}发愁的？点个❤️让我看到你们！

喜欢的赶紧点关注，点小黄车，我们直播间${priceText}，市面上找不到这个价！

评论区扣"要"，${rankHint}

别犹豫，现在就下单，我们${productName}${features ? `是${features}的` : '品质保证'}，用过的都说好！`
  }

  if (scriptType === 'scenario') {
    const scenarioPriceText = price && String(price).trim() ? price : '不到一顿饭钱'
    const featuresText = features || '高品质材质'
    const painHintForScene = painPointsHint || '主子的健康与卫生、用品耐用好打理'
    let scenario: string
    let painPoint: string
    let solution: string
    if (/猫|宠|狗|笼/.test(productName)) {
      scenario = `${audience}，你们是不是也有这样的烦恼？\n${painHintForScene}？`
      painPoint = `家里主子多了，卫生和空间都是问题；笼子要结实、好清理，还要安全不伤猫。塑料的容易啃坏，铁丝的又怕锈……`
      solution = `今天给大家带来这款${productName}！\n${featuresText}，耐用好清洗、不藏污纳垢，主子用得放心，你也省心！\n而且${scenarioPriceText}，给主子最好的，咱们当铲屎官的一点都不心疼！`
    } else if (/护肤|美白|精华|面膜/.test(productName)) {
      scenario = `${audience}，早上起床照镜子，是不是发现脸色暗沉、毛孔粗大？\n熬夜加班、压力大，皮肤状态越来越差？`
      painPoint = `每天化妆遮瑕，卸妆后又打回原形……\n试了好多产品，要么没效果，要么刺激皮肤，钱花了不少，皮肤问题还是没解决！`
      solution = `今天给大家带来这款${productName}！\n${featuresText}，温和不刺激，用了一周就能看到变化！\n${scenarioPriceText}，比大牌便宜一半，效果却不输！`
    } else if (/食品|零食|茶|咖啡/.test(productName)) {
      scenario = `${audience}，下午三点是不是又饿又困？\n办公室抽屉里的零食要么不健康，要么不好吃？`
      painPoint = `想吃点东西提提神，又怕长胖、又怕不卫生……\n外卖点多了不健康，自己做又没时间，真是太难了！`
      solution = `今天给大家带来这款${productName}！\n${featuresText}，健康又美味，解馋不长胖！\n${scenarioPriceText}，办公室囤一箱，随时来一口，幸福感爆棚！`
    } else {
      scenario = `${audience}，你们是不是也在找这样一款产品？\n好用、实惠、品质还有保障？`
      painPoint = `市面上产品太多，不知道选哪个好……\n有的便宜但质量不行，有的质量好但价格太贵，真是太难选了！`
      solution = `今天给大家带来这款${productName}！\n${featuresText}，品质有保证，价格还实惠！\n${scenarioPriceText}，这个价格真的找不到第二家了！`
    }
    const scenarioOne = scenario.replace(/\n/g, '')
    const painOne = painPoint.replace(/\n/g, ' ')
    const solutionOne = solution.replace(/\n/g, ' ')
    return `【场景化塑品话术 · 30-60秒】以下每部分均为可直接念的成品话术稿。

━━ 第一部分：场景代入（建议前15秒）· 成品话术稿 ━━
${scenarioOne}

━━ 第二部分：痛点描述（建议15-30秒）· 成品话术稿 ━━
${painOne}

━━ 第三部分：产品即解决方案（建议30-50秒）· 成品话术稿 ━━
${solutionOne}

━━ 第四部分：效果展示+行动召唤（建议最后10秒）· 成品话术稿 ━━
你们看，这是用户的真实反馈：用了一周真的不一样了！早该买了，之前浪费了好多钱！推荐给朋友，朋友也说好！今天直播间${scenarioPriceText}，点击下方小黄车，库存不多，手慢无！`
  }

  if (scriptType === 'promotion') {
    const hasPrice = price != null && String(price).trim() !== ''
    const priceNum = hasPrice ? parseInt(String(price).replace(/[^0-9]/g, ''), 10) : 0
    const originalPrice = priceNum > 0 ? Math.floor(priceNum * 2.5) : 0
    const saveMoney = originalPrice - priceNum
    const featuresText = features || '高品质'
    const giftLine = phrases.defaultGiftLine['zh-CN']
    const deadlineLine = phrases.defaultDeadlineLine['zh-CN']
    const part1 = hasPrice
      ? `${audience}，划重点！今天的价格你们一定要听好了！我们${productName}，市场价${originalPrice}元，大品牌专柜价甚至要${Math.floor(originalPrice * 1.5)}元！但是！今天直播间，只要${price}！只要${price}！这是什么概念？直接省${saveMoney}元，相当于打${Math.floor((priceNum / originalPrice) * 10)}折！`
      : `${audience}，划重点！今天直播间${priceText}，具体看小黄车/详情页！我们${productName}，${featuresText}，这个品质你们在外面很难找到！`
    const part2 = promoCopy && promoCopy.trim() ? `${promoCopy.trim()}\n\n${featuresText}，这个品质这个价格，你们在外面很难找到！` : `${giftLine}\n\n${featuresText}，这个品质这个价格，你们在外面很难找到！`
    const part3 = `${deadlineLine}库存有限，现在已经有人在抢了，你还在犹豫什么？`
    const part4 = `你们看，已经有很多家人下单了！评论区都在说早买早享受、这个价格真的值、已经回购好几次了！赶紧点小黄车，手慢真的无！明天你再来问我，我只能说对不起，恢复原价了！`
    return `【促销活动话术 · 20-40秒】以下每部分均为可直接念的成品话术稿。

━━ 第一部分：限时特价（建议前10秒）· 成品话术稿 ━━
${part1}

━━ 第二部分：超值福利（建议10-20秒）· 成品话术稿 ━━
${part2}

━━ 第三部分：限时限量（建议20-30秒）· 成品话术稿 ━━
${part3}

━━ 第四部分：真实数据+立即行动（建议最后10秒）· 成品话术稿 ━━
${part4}`
  }

  if (scriptType === 'closing') {
    const closingPriceText = price && String(price).trim() ? price : phrases.noPricePlaceholder['zh-CN']
    const featuresText = features || '品质保证'
    const giftLine = promoCopy && promoCopy.trim() ? promoCopy.trim() : phrases.defaultGiftLine['zh-CN']
    const part1 = `注意！注意！库存不多了！优惠倒计时，最后几分钟就结束了，结束后恢复原价！`
    const part2 = `今天下单的家人，${giftLine}明天就没了，明天就是原价，而且没有赠品！你现在下单省的钱，够你吃一顿火锅了！`
    const part3 = `有人问这个价格是真的吗？你们看，我们店铺大量好评、评分很高，假的能有这么多好评？有人问包邮吗？包邮！全国包邮，48小时到货！有人问不好用怎么办？7天无理由退换，运费我们出，零风险！`
    const part4 = `${featuresText}，${closingPriceText}，还在等什么？现在，马上，立刻点击小黄车，一键下单！不要犹豫，不要纠结，点小黄车，最简单的一步，马上拥有！3、2、1，下单！`
    const hasPromo = promoCopy != null && promoCopy.trim() !== ''
    if (hasPromo) {
      return `【逼单技巧话术 · 15-30秒】以下每部分均为可直接念的成品话术稿。您填写的营销方案将作为第一部分。

━━ 第一部分：本场营销方案（您填写的内容）· 成品话术稿 ━━
${promoCopy!.trim()}

━━ 第二部分：最后机会（建议前5秒）· 成品话术稿 ━━
${part1}

━━ 第三部分：最后价值（建议5-15秒）· 成品话术稿 ━━
${part2}

━━ 第四部分：打消顾虑（建议15-20秒）· 成品话术稿 ━━
${part3}

━━ 第五部分：立即下单（建议20-30秒）· 成品话术稿 ━━
${part4}`
    }
    return `【逼单技巧话术 · 15-30秒】以下每部分均为可直接念的成品话术稿。

━━ 第一部分：最后机会（建议前5秒）· 成品话术稿 ━━
${part1}

━━ 第二部分：最后价值（建议5-15秒）· 成品话术稿 ━━
${part2}

━━ 第三部分：打消顾虑（建议15-20秒）· 成品话术稿 ━━
${part3}

━━ 第四部分：立即下单（建议20-30秒）· 成品话术稿 ━━
${part4}`
  }

  return buildChineseScript('interaction', params)
}

function buildEnglishScript(scriptType: ScriptType, params: ScriptContentParams): string {
  const { productName, price, features, addressTerm } = params
  const audience = addressTerm || 'everyone'
  const phrases = getDefaultScriptPhrasesForLang('en-US')
  const priceText = price && String(price).trim() ? price : phrases.noPricePlaceholder['en-US']
  const rankHint = phrases.interactionRankHint['en-US']

  if (scriptType === 'interaction') {
    return `【INTERACTION SCRIPT · 20-40s】

Hey ${audience}! Drop a 1 if you just joined! 

Today I have ${productName} for you, only ${priceText}!

Who here has tried ${productName} before? Drop 666 in the comments and tell me - is it worth it? You decide!

If you are looking for this kind of product, hit that heart button so I can see you!

Tap follow, tap the cart - we have ${priceText} in our livestream, you will not find this price anywhere else!

Comment "WANT" - ${rankHint}

Do not hesitate! Order now! Our ${productName}${features ? ` is ${features}` : ' is quality guaranteed'} - customers love it!`
  }

  if (scriptType === 'scenario') {
    const scenarioAudience = audience !== 'everyone' ? audience : 'friends'
    const priceText = price || 'less than a meal'
    const featuresText = features || 'premium quality'
    let scenario: string
    let painPoint: string
    let solution: string
    if (/pet|cat|dog/i.test(productName)) {
      scenario = `${scenarioAudience}, do you have this problem too?\nYour pet's bowl is always dirty? Plastic breeds bacteria, ceramic is too heavy and breaks easily?`
      painPoint = `Every time your pet eats, you worry: Is this bowl really clean? Will it affect their health?\nPlastic bowls turn yellow and smell bad, ceramic bowls break when dropped, glass bowls are even more fragile...`
      solution = `Today I bring you ${productName}!\n${featuresText}, durable, easy to clean, no bacteria hiding - safe for your pet, easy for you!\nAnd it's only ${priceText} - giving your pet the best without breaking the bank!`
    } else if (/skincare|beauty|serum/i.test(productName)) {
      scenario = `${scenarioAudience}, do you wake up and see dull skin, large pores in the mirror?\nLate nights, stress - your skin condition getting worse?`
      painPoint = `Daily makeup to cover up, then back to square one after removal...\nTried so many products - either no effect or irritating - spent money but problems remain!`
      solution = `Today I bring you ${productName}!\n${featuresText}, gentle, no irritation - see changes in one week!\nOnly ${priceText} - half the price of luxury brands, same great results!`
    } else {
      scenario = `${scenarioAudience}, are you also looking for this kind of product?\nGood quality, affordable, reliable?`
      painPoint = `Too many options in the market - do not know which to choose...\nCheap ones have bad quality, good quality ones are too expensive - so hard to decide!`
      solution = `Today I bring you ${productName}!\n${featuresText}, quality guaranteed, affordable price!\nOnly ${priceText} - you will not find this deal anywhere else!`
    }
    return `【SCENARIO SCRIPT · 30-60s】

🎬 Scene Setup (first 15s):
${scenario}

❗ Pain Point (15-30s):
${painPoint}

✨ Solution (30-50s):
${solution}

📊 Results (50-55s):
Look at real customer feedback:
"Used it for a week, really different!"
"Should have bought this earlier, wasted so much money before!"
"Recommended to friends, they love it too!"

🛒 CTA (last 5s):
Today only ${priceText}, click the cart below, limited stock, do not miss out!`
  }

  if (scriptType === 'promotion') {
    const hasPrice = price != null && String(price).trim() !== ''
    const priceNum = hasPrice ? parseInt(String(price).replace(/[^0-9]/g, ''), 10) : 0
    const originalPrice = priceNum > 0 ? Math.floor(priceNum * 2.5) : 0
    const saveMoney = originalPrice - priceNum
    const featuresText = features || 'premium quality'
    const giftLine = phrases.defaultGiftLine['en-US']
    const deadlineLine = phrases.defaultDeadlineLine['en-US']
    const priceBlock = hasPrice
      ? `Our ${productName}, market price $${originalPrice}, brand stores charge even $${Math.floor(originalPrice * 1.5)}!\n\nBut TODAY in our livestream, only $${price}! Only $${price}!\nSave $${saveMoney} - that is ${Math.floor((1 - priceNum / originalPrice) * 100)}% off!`
      : `Our ${productName} - ${priceText} in our livestream today, check the cart or product page!\n\n${featuresText}, you will not find this quality anywhere!`
    return `【PROMOTION SCRIPT · 20-40s】

💰 Limited Time Price (first 10s):
${audience}, listen up! Today's price is incredible!
${priceBlock}

🎁 Super Value (10-20s):
And if you order today, you get:
${giftLine}
${featuresText}, this quality at this price - you will not find it anywhere!

⏰ Limited Time & Stock (20-30s):
${deadlineLine}
Limited stock, people are buying now - what are you waiting for?

📊 Real Numbers (30-35s):
Look, many customers already ordered!
Comments say "buy now enjoy now" "this price is worth it" "already repurchased"!

🛒 Act Now (last 5s):
Click the cart now, stocks running out fast! Come back tomorrow and sorry, price is back up!`
  }

  if (scriptType === 'closing') {
    const closingPriceText = price && String(price).trim() ? price : phrases.noPricePlaceholder['en-US']
    const featuresText = features || 'quality guaranteed'
    const giftLine = phrases.defaultGiftLine['en-US']
    return `【CLOSING SCRIPT · 15-30s】

⚠️ Last Chance (first 5s):
Attention! Limited stock left!
Deal countdown - only a few minutes remaining, then back to full price!

🎁 Final Value (5-15s):
Order today - ${giftLine}
Tomorrow - gone! Tomorrow - full price, no gifts!
Money you save now - enough for a nice dinner!

❓ Remove Doubts (15-20s):
Someone asks: Is this price real? Look, our shop has tons of good reviews and high ratings - can fake have that?
Someone asks: Free shipping? YES! Free nationwide shipping, 48-hour delivery!
Someone asks: What if not satisfied? 7-day returns, we pay shipping, zero risk!

🚀 Order NOW (20-25s):
${featuresText}, ${closingPriceText} - what are you waiting for?
Now, right now, immediately - click the cart, one tap order!

💥 Right Now (last 5s):
Do not hesitate, do not think - click cart, simplest step, make it yours!
3, 2, 1 - ORDER!`
  }

  return buildEnglishScript('interaction', params)
}

function buildThaiScript(scriptType: ScriptType, params: ScriptContentParams): string {
  const { productName, price, targetAudience, features, promoCopy } = params
  const phrases = getDefaultScriptPhrasesForLang('th-TH')
  const priceText = price && String(price).trim() ? price : phrases.noPricePlaceholder['th-TH']
  const rankHint = phrases.interactionRankHint['th-TH']
  if (scriptType === 'interaction') {
    const audience = targetAudience || 'ทุกคน'
    return `【การมีปฏิสัมพันธ์ · 20-40 วินาที】

สวัสดีค่ะ ${audience}! ใครเพิ่งมาพิมพ์ 1 ให้หนูด้วย!

วันนี้มี ${productName} มาแนะนำ เพียง ${priceText}!

ใครเคยใช้ ${productName} บ้างคะ? พิมพ์ 666 มาบอกหนูว่าดีไหม คุณเป็นคนตัดสินเอง!

ถ้าคุณกำลังหาสินค้าแบบนี้ กดหัวใจให้หนูเห็นหน่อยค่ะ!

กดติดตาม กดตะกร้า ราคาพิเศษ ${priceText} ในไลฟ์นี้เท่านั้น หาที่ไหนไม่ได้แน่!

คอมเมนต์ "ขอ" ${rankHint}

อย่าลังเลค่ะ สั่งเลย! ${productName} ของเรา${features ? `เป็น ${features}` : 'มีคุณภาพรับประกัน'} ลูกค้าชอบมากๆ!`
  }
  if (scriptType === 'scenario') {
    const audience = targetAudience || 'เพื่อนๆ'
    const scenarioPriceText = price && String(price).trim() ? price : 'ราคาถูกกว่าข้าวเที่ยงมื้อหนึ่ง'
    const featuresText = features || 'คุณภาพพรีเมียม'
    const scenario = `${audience} มีปัญหานี้บ้างไหมคะ?\nหาสินค้าที่ดี ราคาถูก มีคุณภาพ?`
    const painPoint = `สินค้าในตลาดเยอะมาก ไม่รู้จะเลือกอันไหนดี...\nของถูกคุณภาพไม่ดี ของดีราคาแพง เลือกยากจริงๆ!`
    const solution = `วันนี้หนูมี ${productName} มาแนะนำ!\n${featuresText} มีคุณภาพรับประกัน ราคาย่อมเยา!\nเพียง ${scenarioPriceText} ราคานี้หาที่ไหนไม่ได้จริงๆ!`
    return `【การสร้างสถานการณ์ · 30-60 วินาที】

🎬 สร้างบริบท (15 วินาทีแรก):
${scenario}

❗ จุดปวด (15-30 วินาที):
${painPoint}

✨ วิธีแก้ (30-50 วินาที):
${solution}

📊 ผลลัพธ์จริง (50-55 วินาที):
ดูรีวิวจากลูกค้าจริงนะคะ:
"ใช้แล้วหนึ่งสัปดาห์ เห็นผลชัดเจน!"
"น่าซื้อตั้งนานแล้ว เสียเงินมาเยอะ!"
"แนะนำให้เพื่อน เพื่อนก็ชอบมาก!"

🛒 เรียกการตัดสินใจ (5 วินาทีสุดท้าย):
วันนี้เพียง ${scenarioPriceText} คลิกตะกร้าด้านล่าง ของมีจำนวนจำกัด อย่าพลาดนะคะ!`
  }
  if (scriptType === 'promotion') {
    const audience = targetAudience || 'ทุกคน'
    const hasPrice = price != null && String(price).trim() !== ''
    const giftLine = phrases.defaultGiftLine['th-TH']
    const deadlineLine = phrases.defaultDeadlineLine['th-TH']
    const promoPriceText = price && String(price).trim() ? price : phrases.noPricePlaceholder['th-TH']
    const priceBlock = hasPrice
      ? `${productName} ของเรา ราคาตลาด ${Math.floor(parseInt(String(price).replace(/[^0-9]/g, ''), 10) * 2.5)} บาท!\n\nแต่วันนี้ในไลฟ์ เพียง ${price}! เพียง ${price}! ประหยัดไปเลย!`
      : `วันนี้ในไลฟ์ ${promoPriceText} - ดูที่ตะกร้าหรือหน้ารายละเอียด!\n\n${features || 'คุณภาพพรีเมียม'} ราคานี้หาที่ไหนไม่ได้จริงๆ!`
    return `【โปรโมชัน · 20-40 วินาที】

💰 ราคาพิเศษจำกัดเวลา (10 วินาทีแรก):
${audience} ฟังให้ดีนะคะ! ราคาวันนี้พิเศษมากๆ!
${priceBlock}

🎁 คุ้มค่าสุดๆ (10-20 วินาที):
และถ้าสั่งวันนี้ยังได้:
${giftLine}
${features || 'คุณภาพพรีเมียม'} ราคานี้หาที่ไหนไม่ได้จริงๆ!

⏰ จำกัดเวลาและจำนวน (20-30 วินาที):
${deadlineLine}
ของมีจำนวนจำกัด กำลังมีคนสั่งอยู่ รอไปทำไมคะ?

📊 ตัวเลขจริง (30-35 วินาที):
ดูสิคะ มีหลายคนสั่งแล้ว!
คอมเมนต์บอกว่า "ซื้อเลยคุ้มมาก" "ราคานี้คุ้มจริง" "ซื้อไปหลายรอบแล้ว"!

🛒 ตัดสินใจเลย (5 วินาทีสุดท้าย):
คลิกตะกร้าเลยค่ะ ของหมดเร็ว! พรุ่งนี้มาถามขอโทษนะคะ ราคากลับขึ้นแล้ว!`
  }
  if (scriptType === 'closing') {
    const closingPriceText = price && String(price).trim() ? price : phrases.noPricePlaceholder['th-TH']
    const giftLine = promoCopy && promoCopy.trim() ? promoCopy.trim() : phrases.defaultGiftLine['th-TH']
    return `【เทคนิคการปิดการขาย · 15-30 วินาที】

⚠️ โอกาสสุดท้าย (5 วินาทีแรก):
ระวัง! ของเหลือไม่มาก!
นับถอยหลัง เหลือเวลาอีกไม่กี่นาที หลังจากนี้ราคาเต็ม!

🎁 มูลค่าสุดท้าย (5-15 วินาที):
สั่งวันนี้ - ${giftLine}
พรุ่งนี้หมดแล้ว พรุ่งนี้ราคาเต็ม ไม่มีของแถม!
เงินที่ประหยัดได้พอกินข้าวมื้อดีๆ เลยนะ!

❓ ตอบข้อสงสัย (15-20 วินาที):
มีคนถาม: ราคานี้จริงเหรอ? ดูสิคะ ร้านเรามีรีวิวดีเยอะ คะแนนสูง ของปลอมจะมีรีวิวดีขนาดนี้ได้เหรอ?
มีคนถาม: ส่งฟรีไหม? ฟรี! ส่งฟรีทั่วประเทศ 48 ชั่วโมงถึง!
มีคนถาม: ไม่ชอบทำไง? คืนได้ 7 วัน เราจ่ายค่าส่ง ไม่มีความเสี่ยง!

🚀 สั่งเลยตอนนี้ (20-25 วินาที):
${features || 'คุณภาพรับประกัน'} ${closingPriceText} รอไปทำไมคะ?
เดี๋ยวนี้ ตอนนี้ ทันที คลิกตะกร้า สั่งได้เลย!

💥 ตอนนี้เลย (5 วินาทีสุดท้าย):
อย่าลังเล อย่าคิดมาก คลิกตะกร้า ขั้นตอนง่ายที่สุด เป็นของคุณแล้ว!
3, 2, 1 - สั่ง!`
  }
  return buildThaiScript('interaction', params)
}
