import { useTranslation } from 'react-i18next'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  TooltipProps,
} from 'recharts'

interface ChartData {
  date: string
  value: number
  label?: string
  rawDate?: string
}

interface ChartProps {
  data: ChartData[]
  type?: 'line' | 'bar'
  dataKey?: string
  color?: string
  height?: number
  /** 图例/系列名称（不传则用 analysis.gmvLegend） */
  name?: string
  /** 金额等数值的格式化，用于 Tooltip 显示，如 (v) => `¥${v.toLocaleString('zh-CN')}` */
  valueFormatter?: (value: number) => string
}

function formatDefaultValue(value: number): string {
  return typeof value === 'number' && !isNaN(value)
    ? `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '0'
}

export default function Chart({
  data,
  type = 'line',
  dataKey = 'value',
  color = '#0ea5e9',
  height = 300,
  name: nameProp,
  valueFormatter = formatDefaultValue,
}: ChartProps) {
  const { t } = useTranslation()
  const name = nameProp ?? t('analysis.gmvLegend')
  const dateLabelText = t('analysis.dateLabel')
  const ChartComponent = type === 'line' ? LineChart : BarChart

  const renderTooltip = (props: TooltipProps<number, string>) => {
    const { active, payload } = props
    if (!active || !payload?.length) return null
    const item = payload[0].payload
    const valueDate = (item as { rawDate?: string }).rawDate || item.date || ''
    const value = payload[0].value
    const displayValue = typeof value === 'number' ? valueFormatter(value) : String(value)
    return (
      <div
        style={{
          backgroundColor: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '8px 12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}
      >
        <div className="text-sm text-slate-700">
          <span className="font-medium">{dateLabelText}：</span>
          {valueDate}
        </div>
        <div className="text-sm text-slate-700 mt-0.5">
          <span className="font-medium">{name}：</span>
          {displayValue}
        </div>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ChartComponent data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="date"
          stroke="#6b7280"
          fontSize={12}
          tickLine={false}
        />
        <YAxis stroke="#6b7280" fontSize={12} tickLine={false} />
        <Tooltip content={renderTooltip} />
        <Legend />
        {type === 'line' ? (
          <Line type="monotone" dataKey={dataKey} name={name} stroke={color} fill={color} strokeWidth={2} />
        ) : (
          <Bar dataKey={dataKey} name={name} fill={color} />
        )}
      </ChartComponent>
    </ResponsiveContainer>
  )
}
