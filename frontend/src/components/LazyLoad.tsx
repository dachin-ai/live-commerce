import { lazy, Suspense, ComponentType } from 'react'

export function lazyLoad<P = Record<string, unknown>>(
  importFunc: () => Promise<{ default: ComponentType<P> }>,
  fallback: React.ReactNode = <div className="text-center py-8 text-slate-500">加载中...</div>
) {
  const LazyComponent = lazy(importFunc)
  return (props: P) => (
    <Suspense fallback={fallback}>
      {/* 泛型 P 与 lazy 返回的 ComponentType<P> 在 TS 下推断不兼容，运行时一致 */}
      {/* @ts-expect-error - lazy component props 与 P 推断冲突 */}
      <LazyComponent {...props} />
    </Suspense>
  )
}
