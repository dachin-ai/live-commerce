import { LucideIcon } from 'lucide-react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { useLayoutPreferences } from '../hooks/useLayoutPreferences'

export interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  /** 指标释义（悬停显示，用于时效/GPM/人均观看时长等） */
  titleTooltip?: string
  /** 环比（上期）变化百分比，可为数字或已格式化的字符串如 "12.34%" */
  change?: number | string
  /** 同比（去年同期）变化百分比，可为数字或已格式化的字符串 */
  changeYoY?: number | string
  icon?: LucideIcon
  format?: (value: number) => string
  /** 紧凑模式：更小间距与字号 */
  compact?: boolean
  /** 突出显示：大卡片+渐变背景（核心指标用） */
  featured?: boolean
  /** 渐变色主题 */
  gradientColor?: 'blue' | 'green' | 'purple' | 'orange'
}

function ChangeSpan({ value }: { value: number | string }) {
  const num = typeof value === 'number' ? value : parseFloat(String(value).replace('%', ''))
  const isNum = typeof value === 'number'
  const up = isNum ? value >= 0 : !Number.isNaN(num) && num >= 0
  const text = typeof value === 'string' ? value : `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
  return (
    <span className={up ? 'text-green-600' : 'text-red-600'}>
      {text}
    </span>
  )
}

export default function StatCard({
  title,
  value,
  subtitle,
  titleTooltip,
  change,
  changeYoY,
  icon: Icon,
  format,
  compact = true,
  featured = false,
  gradientColor = 'blue',
}: StatCardProps) {
  const { preferences } = useLayoutPreferences()
  const formattedValue =
    typeof value === 'number' && format ? format(value) : value
  const hasChange = change !== undefined
  const hasYoY = changeYoY !== undefined
  const isChangePositive = hasChange && (typeof change === 'number' ? change >= 0 : parseFloat(String(change).replace('%', '')) >= 0)

  // 渐变色配置（对标抖店罗盘）
  const gradients = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    purple: 'from-purple-500 to-purple-600',
    orange: 'from-orange-500 to-orange-600',
  }

  if (featured) {
    return (
      <div className={`relative overflow-hidden rounded-xl shadow-lg bg-gradient-to-br ${gradients[gradientColor]} p-6 text-white`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white/90 mb-2 font-medium" title={titleTooltip}>{title}</p>
            <p className="text-3xl font-bold mb-1">{formattedValue}</p>
            {subtitle && <p className="text-xs text-white/80 mt-2">{subtitle}</p>}
            {(hasChange || hasYoY) && (
              <div className="flex items-center flex-wrap gap-x-4 mt-3 text-xs">
                {hasChange && (
                  <span className="flex items-center gap-1.5 bg-white/20 px-2 py-1 rounded-md">
                    {typeof change === 'number' ? (change >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />) : (parseFloat(String(change).replace('%', '')) >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />)}
                    <span className="text-white/90">环比</span>
                    <span className="font-semibold">{typeof change === 'string' ? change : (change >= 0 ? '+' : '') + change.toFixed(1) + '%'}</span>
                  </span>
                )}
                {hasYoY && (
                  <span className="flex items-center gap-1.5 bg-white/20 px-2 py-1 rounded-md">
                    {typeof changeYoY === 'number' ? (changeYoY >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />) : (parseFloat(String(changeYoY).replace('%', '')) >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />)}
                    <span className="text-white/90">同比</span>
                    <span className="font-semibold">{typeof changeYoY === 'string' ? changeYoY : (changeYoY >= 0 ? '+' : '') + changeYoY.toFixed(1) + '%'}</span>
                  </span>
                )}
              </div>
            )}
          </div>
          {Icon && preferences.showIcons && (
            <div className="p-3 bg-white/20 rounded-lg backdrop-blur-sm shrink-0">
              <Icon className="w-7 h-7 text-white" />
            </div>
          )}
        </div>
        {/* 装饰性背景图案 */}
        <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
      </div>
    )
  }

  return (
    <div className={`stat-card ${compact ? 'stat-card--compact' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-600 mb-0.5" title={titleTooltip}>{title}</p>
          <p className={`font-bold text-gray-900 ${compact ? 'text-lg' : 'text-2xl'}`}>{formattedValue}</p>
          {subtitle && <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p>}
          {(hasChange || hasYoY) && (
            <div className="flex items-center flex-wrap gap-x-3 mt-1.5 text-[11px]">
              {preferences.showIcons && hasChange && (isChangePositive
                ? <TrendingUp className="w-3 h-3 text-green-500 shrink-0" />
                : <TrendingDown className="w-3 h-3 text-red-500 shrink-0" />
              )}
              {hasChange && (
                <span className="flex items-center gap-1">
                  <span className="text-gray-500">环比</span>
                  <ChangeSpan value={change!} />
                </span>
              )}
              {hasYoY && (
                <span className="flex items-center gap-1">
                  <span className="text-gray-500">同比</span>
                  <ChangeSpan value={changeYoY!} />
                </span>
              )}
            </div>
          )}
        </div>
        {Icon && preferences.showIcons && (
          <div className="p-1.5 bg-primary-100 rounded-md shrink-0">
            <Icon className="w-4 h-4 text-primary-600" />
          </div>
        )}
      </div>
    </div>
  )
}
