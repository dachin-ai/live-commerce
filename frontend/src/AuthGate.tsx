/**
 * 登录前权限确认：未登录时只加载 LoginShell，不加载完整应用（StoreProvider、Dashboard 等），
 * 提高运营用户首屏加载速度。
 */
import { lazy, Suspense } from 'react'
import { BrowserRouter as Router } from 'react-router-dom'
import { isAuthenticated } from './services/auth'
import LoginShell from './LoginShell'

const FullApp = lazy(() => import('./App'))

export default function AuthGate() {
  const isAuth = isAuthenticated()

  if (!isAuth) {
    return (
      <Router>
        <LoginShell />
      </Router>
    )
  }

  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-500">加载中...</div>}>
      <FullApp />
    </Suspense>
  )
}
