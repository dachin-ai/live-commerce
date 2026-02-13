import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'
import './i18n'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5分钟
      gcTime: 10 * 60 * 1000, // 10分钟（v5 原 cacheTime）
      retry: false, // 禁用自动重试，避免错误被隐藏
    },
  },
})

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('找不到 root 元素')
}

try {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </ErrorBoundary>
    </React.StrictMode>,
  )
} catch (error) {
  console.error('应用初始化失败:', error)
  rootElement.innerHTML = `
    <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f3f4f6;">
      <div style="text-align: center; max-width: 500px; padding: 2rem;">
        <h1 style="font-size: 1.5rem; font-weight: bold; color: #dc2626; margin-bottom: 1rem;">应用启动失败</h1>
        <p style="color: #374151; margin-bottom: 1rem;">请检查浏览器控制台获取详细错误信息</p>
        <button onclick="window.location.reload()" style="padding: 0.5rem 1rem; background: #2563eb; color: white; border-radius: 0.5rem; border: none; cursor: pointer;">
          刷新页面
        </button>
      </div>
    </div>
  `
}
