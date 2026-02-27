/**
 * 未登录用户专属壳：仅加载登录/注册/忘记密码等公开页，不加载 StoreProvider、Dashboard 等。
 * 运营用户访问 / 时先走权限确认，未登录则只加载本壳，加快首屏。
 */
import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import { ToastProvider } from './contexts/ToastContext'

export default function LoginShell() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </ToastProvider>
  )
}
