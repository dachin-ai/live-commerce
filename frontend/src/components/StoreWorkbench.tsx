import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Radio, ShoppingBag, Megaphone, BarChart3, Plus, ExternalLink,
  Upload, Store as StoreIcon, ChevronDown, Circle, Pencil,
  TrendingUp, Target, Zap,
} from 'lucide-react'
import { useStore } from '../contexts/StoreContext'
import { useStores, type Store } from '../services/stores'
import { useLivePerformance, useAdMatrix } from '../services/ttBi'

// Minimal store shape used internally (avoids createdAt requirement)
type StoreMin = { id: string; name?: string | null; platform?: string | null; status?: string | null }

// ─── Helpers ──────────────────────────────────────────────────────────
function fmt(n: number | undefined | null) {
  if (n == null) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}w`
  return Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 0 })
}

function getLast7Days() {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 6)
  const pad = (n: number) => String(n).padStart(2, '0')
  const f = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return { dateFrom: f(from), dateTo: f(to) }
}

// ─── Channel definitions ───────────────────────────────────────────────
type ChannelId = 'live' | 'shop' | 'ads' | 'general'

interface Channel {
  id: ChannelId
  label: string
  icon: typeof Radio
  color: string
  activeClass: string
  platforms: string[]
}

const CHANNELS: Channel[] = [
  {
    id: 'live',
    label: '直播',
    icon: Radio,
    color: 'text-blue-600',
    activeClass: 'bg-blue-600 text-white shadow-sm shadow-blue-200',
    platforms: ['抖音', 'TikTok', '快手', '小红书'],
  },
  {
    id: 'shop',
    label: '商品卡',
    icon: ShoppingBag,
    color: 'text-emerald-600',
    activeClass: 'bg-emerald-600 text-white shadow-sm shadow-emerald-200',
    platforms: ['抖音', 'TikTok'],
  },
  {
    id: 'ads',
    label: '广告投流',
    icon: Megaphone,
    color: 'text-amber-600',
    activeClass: 'bg-amber-500 text-white shadow-sm shadow-amber-200',
    platforms: ['抖音', 'TikTok', '淘宝', '天猫', '京东', '快手'],
  },
  {
    id: 'general',
    label: '工作计划',
    icon: Target,
    color: 'text-slate-600',
    activeClass: 'bg-slate-600 text-white shadow-sm',
    platforms: ['淘宝', '天猫', '京东', '小红书', '其他'],
  },
]

function getChannelsForPlatform(platform: string): Channel[] {
  const available = CHANNELS.filter(ch => ch.platforms.includes(platform))
  return available.length > 0 ? available : CHANNELS.filter(ch => ch.id === 'general')
}

// ─── Platform badge ────────────────────────────────────────────────────
const PLATFORM_BADGE: Record<string, string> = {
  '抖音':  'bg-gradient-to-r from-pink-500 to-cyan-400 text-white',
  'TikTok':'bg-black text-white',
  '快手':  'bg-orange-500 text-white',
  '小红书':'bg-red-500 text-white',
  '淘宝':  'bg-orange-500 text-white',
  '天猫':  'bg-red-600 text-white',
  '京东':  'bg-red-700 text-white',
}

// ─── Quick Stats: Live ─────────────────────────────────────────────────
function LiveQuickStats({ storeId, dateFrom, dateTo }: {
  storeId: string; dateFrom: string; dateTo: string
}) {
  const { data, isLoading } = useLivePerformance(storeId, dateFrom, dateTo)
  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-14 bg-slate-100 animate-pulse rounded-xl" />
        ))}
      </div>
    )
  }
  if (!data?.summary || data.summary.totalSessions === 0) {
    return (
      <div className="p-3 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center">
        <p className="text-xs text-slate-400">近7天暂无直播数据</p>
      </div>
    )
  }
  const s = data.summary
  const stats = [
    { label: 'GMV', value: `¥${fmt(s.totalGmv)}`, color: 'bg-blue-50 border-blue-100', text: 'text-blue-800', icon: TrendingUp },
    { label: '场次', value: `${s.totalSessions}场`, color: 'bg-violet-50 border-violet-100', text: 'text-violet-800', icon: Radio },
    { label: '转化率', value: `${(s.avgOrderCvr ?? 0).toFixed(2)}%`, color: 'bg-emerald-50 border-emerald-100', text: 'text-emerald-800', icon: Zap },
  ]
  return (
    <div className="grid grid-cols-3 gap-2">
      {stats.map(st => {
        const Icon = st.icon
        return (
          <div key={st.label} className={`p-2.5 ${st.color} border rounded-xl text-center`}>
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Icon className={`w-3 h-3 ${st.text} opacity-70`} />
              <span className="text-[10px] text-slate-500">{st.label}</span>
            </div>
            <div className={`text-sm font-bold ${st.text}`}>{st.value}</div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Quick Stats: Ads ──────────────────────────────────────────────────
function AdsQuickStats({ storeId, dateFrom, dateTo }: {
  storeId: string; dateFrom: string; dateTo: string
}) {
  const { data, isLoading } = useAdMatrix(storeId, dateFrom, dateTo)
  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-14 bg-slate-100 animate-pulse rounded-xl" />
        ))}
      </div>
    )
  }
  if (!data?.overall || data.overall.totalPlans === 0) {
    return (
      <div className="p-3 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center">
        <p className="text-xs text-slate-400">近7天暂无广告数据</p>
      </div>
    )
  }
  const ov = data.overall
  const roi = ov.overallRoi ?? 0
  const roiColor = roi >= 2 ? 'text-emerald-700 bg-emerald-50 border-emerald-100'
    : roi >= 1 ? 'text-blue-700 bg-blue-50 border-blue-100'
    : 'text-red-700 bg-red-50 border-red-100'
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="p-2.5 bg-amber-50 border border-amber-100 rounded-xl text-center">
        <div className="text-[10px] text-slate-500 mb-0.5">花费</div>
        <div className="text-sm font-bold text-amber-800">¥{fmt(ov.totalCost)}</div>
      </div>
      <div className={`p-2.5 border rounded-xl text-center ${roiColor}`}>
        <div className="text-[10px] text-slate-500 mb-0.5">ROI</div>
        <div className="text-sm font-bold">{roi.toFixed(2)}</div>
      </div>
      <div className="p-2.5 bg-violet-50 border border-violet-100 rounded-xl text-center">
        <div className="text-[10px] text-slate-500 mb-0.5">计划数</div>
        <div className="text-sm font-bold text-violet-800">{ov.totalPlans}</div>
      </div>
    </div>
  )
}

// ─── Channel Content ───────────────────────────────────────────────────
function ChannelContent({ channel, store, dateFrom, dateTo, onUploadStore, onNavigate }: {
  channel: ChannelId
  store: StoreMin
  dateFrom: string
  dateTo: string
  onUploadStore?: (s: Store) => void
  onNavigate: () => void
}) {
  const isTikTok = store.platform === '抖音' || store.platform === 'TikTok'

  if (channel === 'live') {
    return (
      <div className="space-y-3">
        {isTikTok
          ? <LiveQuickStats storeId={store.id} dateFrom={dateFrom} dateTo={dateTo} />
          : (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500">
              直播数据分析目前支持 抖音 / TikTok 平台。
            </div>
          )
        }
        <div className="flex gap-2">
          {isTikTok && (
            <button
              onClick={() => onUploadStore?.(store as unknown as Store)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              上传场次数据
            </button>
          )}
          <button
            onClick={onNavigate}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg font-medium transition-colors"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            进入直播分析
            <ExternalLink className="w-3 h-3 opacity-70" />
          </button>
        </div>
      </div>
    )
  }

  if (channel === 'shop') {
    return (
      <div className="space-y-3">
        <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
          <div className="flex items-center gap-2 mb-1.5">
            <ShoppingBag className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-semibold text-emerald-700">商品卡运营</span>
          </div>
          <p className="text-xs text-emerald-600 leading-relaxed">
            商品卡数据来源于产品概览 Excel 导出，请定期上传以追踪突涨/突跌商品。
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onUploadStore?.(store as unknown as Store)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            上传产品数据
          </button>
          <button
            onClick={onNavigate}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-lg font-medium transition-colors"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            商品雷达
            <ExternalLink className="w-3 h-3 opacity-70" />
          </button>
        </div>
      </div>
    )
  }

  if (channel === 'ads') {
    return (
      <div className="space-y-3">
        {isTikTok
          ? <AdsQuickStats storeId={store.id} dateFrom={dateFrom} dateTo={dateTo} />
          : (
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 text-xs text-amber-700">
              广告数据请通过上传功能导入后查看。
            </div>
          )
        }
        <div className="flex gap-2">
          {isTikTok && (
            <button
              onClick={() => onUploadStore?.(store as unknown as Store)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs bg-amber-50 text-amber-600 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              上传广告数据
            </button>
          )}
          <button
            onClick={onNavigate}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs rounded-lg font-medium transition-colors"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            广告矩阵
            <ExternalLink className="w-3 h-3 opacity-70" />
          </button>
        </div>
      </div>
    )
  }

  // general
  return (
    <div className="space-y-3">
      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
        <div className="flex items-center gap-2 mb-1.5">
          <Target className="w-4 h-4 text-slate-500" />
          <span className="text-xs font-semibold text-slate-600">工作计划</span>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          使用任务列表管理当前店铺的工作计划与跟进事项。
        </p>
      </div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────
interface StoreWorkbenchProps {
  onUploadStore?: (store: Store) => void
}

export default function StoreWorkbench({ onUploadStore }: StoreWorkbenchProps) {
  const navigate = useNavigate()
  const { selectedStore, setSelectedStore } = useStore()
  const [activeChannel, setActiveChannel] = useState<ChannelId>('live')
  const [showStoreList, setShowStoreList] = useState(false)

  const { dateFrom, dateTo } = useMemo(() => getLast7Days(), [])

  const { data: storeData } = useStores({ limit: 50, light: true })
  const stores = (storeData?.items ?? []) as Store[]

  const platform = selectedStore?.platform ?? '其他'
  const channels = getChannelsForPlatform(platform)
  const validChannel: ChannelId = channels.find(ch => ch.id === activeChannel)
    ? activeChannel
    : (channels[0]?.id ?? 'general')

  const activeChannelDef = channels.find(ch => ch.id === validChannel)

  if (!selectedStore) {
    return (
      <div className="card text-center py-10 space-y-4">
        <StoreIcon className="w-12 h-12 text-slate-200 mx-auto" />
        <div>
          <p className="text-sm font-medium text-slate-700">尚未选择店铺</p>
          <p className="text-xs text-slate-400 mt-1">选择或创建店铺以开始渠道工作台</p>
        </div>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('openCreateStoreModal'))}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          创建店铺
        </button>
      </div>
    )
  }

  return (
    <div className="card space-y-4">
      {/* ── Store header ── */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-bold text-slate-900 text-base truncate">{selectedStore.name}</h2>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${PLATFORM_BADGE[platform] ?? 'bg-slate-500 text-white'}`}>
              {platform}
            </span>
            <Circle className={`w-2 h-2 flex-shrink-0 ${selectedStore.status === 'active' ? 'text-green-400 fill-green-400' : 'text-slate-300 fill-slate-300'}`} />
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">近 7 天渠道数据</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('openEditStoreModal', { detail: selectedStore }))}
            title="编辑店铺信息"
            className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowStoreList(v => !v)}
            title="切换店铺"
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showStoreList ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Store list dropdown ── */}
      {showStoreList && (
        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="max-h-44 overflow-y-auto">
            {stores.map(store => (
              <button
                key={store.id}
                onClick={() => { setSelectedStore(store); setShowStoreList(false) }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors border-b border-slate-100 last:border-0 ${
                  selectedStore.id === store.id
                    ? 'bg-blue-50 text-blue-700'
                    : 'hover:bg-slate-50 text-slate-800'
                }`}
              >
                <Circle className={`w-1.5 h-1.5 flex-shrink-0 ${store.status === 'active' ? 'fill-green-400 text-green-400' : 'fill-slate-300 text-slate-300'}`} />
                <span className="text-sm flex-1 truncate">{store.name}</span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${PLATFORM_BADGE[store.platform ?? ''] ?? 'bg-slate-100 text-slate-500'}`}>
                  {store.platform}
                </span>
              </button>
            ))}
          </div>
          <div className="p-2 bg-slate-50 border-t border-slate-200">
            <button
              onClick={() => { window.dispatchEvent(new CustomEvent('openCreateStoreModal')); setShowStoreList(false) }}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              <Plus className="w-3.5 h-3.5" />
              新建店铺
            </button>
          </div>
        </div>
      )}

      {/* ── Channel tabs ── */}
      {channels.length > 1 && (
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {channels.map(channel => {
            const Icon = channel.icon
            const isActive = validChannel === channel.id
            return (
              <button
                key={channel.id}
                onClick={() => setActiveChannel(channel.id)}
                className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                  isActive ? channel.activeClass : `text-slate-500 hover:text-slate-700`
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{channel.label}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Divider with channel label */}
      {activeChannelDef && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-px bg-slate-100" />
          <span className={`text-[11px] font-medium ${activeChannelDef.color}`}>
            {activeChannelDef.label}渠道
          </span>
          <div className="flex-1 h-px bg-slate-100" />
        </div>
      )}

      {/* ── Channel content ── */}
      <ChannelContent
        channel={validChannel}
        store={selectedStore as unknown as Store}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onUploadStore={onUploadStore as ((s: StoreMin) => void) | undefined}
        onNavigate={() => navigate('/analysis')}
      />
    </div>
  )
}
