import { useState, type ReactNode } from 'react'
import Sidebar from './Sidebar'

interface AppLayoutProps {
  /** 页面标题 */
  title: string
  /** 页面副标题 */
  subtitle?: string
  /** header 右侧额外内容（如 StoreSelector、按钮组） */
  headerExtra?: ReactNode
  /** 页面主体内容 */
  children: ReactNode
}

/**
 * 统一的已认证页面布局壳。
 * 包含左侧 Sidebar + 顶部 header + 主要内容区域。
 * 所有需要 Sidebar 的页面都应使用此组件，避免各自重复配置。
 */
export default function AppLayout({ title, subtitle, headerExtra, children }: AppLayoutProps) {
  const [sidebarExpanded, setSidebarExpanded] = useState(true)

  return (
    <div className="h-screen min-h-0 bg-slate-50 flex overflow-hidden">
      {/* 左侧导航栏 */}
      <Sidebar
        isExpanded={sidebarExpanded}
        onToggle={setSidebarExpanded}
      />

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col min-h-0 transition-all duration-300">
        {/* 统一顶部导航栏 — 玻璃拟态风格 */}
        <header className="glass-panel sticky top-0 z-10 border-b-0 border-l border-r-0 border-t-0 shadow-sm border-slate-200/60 !rounded-none !bg-white/70">
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-slate-900">{title}</h1>
              {subtitle && (
                <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
              )}
            </div>
            {headerExtra && (
              <div className="flex items-center gap-4">
                {headerExtra}
              </div>
            )}
          </div>
        </header>

        {/* 主要内容 */}
        <main className="flex-1 overflow-y-auto p-6 transition-all duration-300">
          {children}
        </main>
      </div>
    </div>
  )
}
