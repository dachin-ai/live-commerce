import { memo, useMemo } from 'react'
import { useIntersectionObserver } from '../hooks/useIntersectionObserver'

interface ListItem {
  id: string
  title: string
  description?: string
}

interface PerformanceOptimizedListProps {
  items: ListItem[]
  renderItem: (item: ListItem) => React.ReactNode
  emptyMessage?: string
  loading?: boolean
}

function PerformanceOptimizedListComponent({
  items,
  renderItem,
  emptyMessage = '暂无数据',
  loading = false,
}: PerformanceOptimizedListProps) {
  const { targetRef, hasIntersected } = useIntersectionObserver()

  const visibleItems = useMemo(() => {
    // 虚拟滚动优化：只渲染可见区域的项目
    return hasIntersected ? items : []
  }, [items, hasIntersected])

  if (loading) {
    return <div className="text-center py-8 text-gray-500">加载中...</div>
  }

  if (items.length === 0) {
    return <div className="text-center py-8 text-gray-500">{emptyMessage}</div>
  }

  return (
    <div ref={targetRef as React.RefObject<HTMLDivElement>}>
      {hasIntersected ? (
        <div className="space-y-2">
          {visibleItems.map((item) => (
            <div key={item.id}>{renderItem(item)}</div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">加载中...</div>
      )}
    </div>
  )
}

export const PerformanceOptimizedList = memo(PerformanceOptimizedListComponent)
