/**
 * GuideModal — 电商数据分析专家 提示词模板弹窗
 * 原 AIFeatures.tsx L1594-1639
 */

import { X } from 'lucide-react'

interface GuideModalProps {
  onClose: () => void
}

export default function GuideModal({ onClose }: GuideModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200 shrink-0">
          <h3 className="text-lg font-semibold text-gray-900">电商数据分析专家 - 交互提示词模板</h3>
          <button type="button" onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 text-sm text-gray-700 space-y-4">
          <section>
            <h4 className="font-medium text-gray-900 mb-2">👋 开场欢迎语</h4>
            <p className="whitespace-pre-wrap bg-gray-50 p-3 rounded-lg">你好！我是你的电商数据分析专家助手，专注于帮助运营团队进行数据复盘和业务优化。我可以帮助你：分析店铺数据、搜索行业信息、生成营销素材、制作专业文档、优化直播间场景、生成主播话术。请告诉我你需要什么帮助！</p>
          </section>
          <section>
            <h4 className="font-medium text-gray-900 mb-2">📦 常见使用场景</h4>
            <ul className="list-disc list-inside space-y-1 text-gray-600">
              <li>店铺数据分析（订单、用户、销售额、阶段）</li>
              <li>多维度拆解（供应链、物流、定价、渠道、营销）</li>
              <li>生成营销图片 / 海报</li>
              <li>生成专业文档（Word / Excel / PPT）</li>
              <li>直播间场景优化</li>
              <li>生成主播话术（产品+人群+痛点）</li>
              <li>搜索行业信息（平台规则、节庆、趋势、竞品）</li>
              <li>综合分析报告（多维度+报告+PPT）</li>
            </ul>
          </section>
          <section>
            <h4 className="font-medium text-gray-900 mb-2">🎯 指令模板</h4>
            <ul className="space-y-2 text-gray-600">
              <li><strong>快速分析：</strong>快速分析：[简述问题或数据]</li>
              <li><strong>深度分析：</strong>深度分析：[提供详细数据]</li>
              <li><strong>生成素材：</strong>生成：[素材类型 + 具体要求]</li>
              <li><strong>优化场景：</strong>优化场景：[图片URL] + [产品类别] + [主播风格]</li>
              <li><strong>生成话术：</strong>生成话术：产品名称、类别、特点、目标人群、价格、痛点</li>
            </ul>
          </section>
          <section>
            <h4 className="font-medium text-gray-900 mb-2">💡 最佳实践</h4>
            <p className="text-gray-600">提供完整信息（订单数、用户数、销售额、品类、阶段）；明确分析维度（如物流：配送时长、准时率、退货率）；要求具体输出（报告标题、章节、格式）；多维度结合分析（定价+内容+物流）。</p>
          </section>
          <p className="text-gray-500 text-xs border-t border-gray-100 pt-3">完整模板（含迭代优化、数据格式、话术/搜索提示词等）见项目文档：docs/电商数据分析专家-交互提示词模板.md</p>
        </div>
      </div>
    </div>
  )
}
