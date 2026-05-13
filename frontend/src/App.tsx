import { lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import i18n from './i18n'
// 路由懒加载，减少首屏体积（Dashboard/Login 最重，延后加载）
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Login = lazy(() => import('./pages/Login'))
const AnalysisPage = lazy(() => import('./pages/AnalysisPage'))
const ToolsPage = lazy(() => import('./pages/ToolsPage'))
const Register = lazy(() => import('./pages/Register'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const Profile = lazy(() => import('./pages/Profile'))
const PermissionConfigPage = lazy(() => import('./pages/PermissionConfigPage'))
const LLMPage = lazy(() => import('./pages/LLMPage'))
const FeedbackManagement = lazy(() => import('./pages/FeedbackManagement'))
const MessageCenter = lazy(() => import('./pages/MessageCenter'))
import ProtectedRoute from './components/ProtectedRoute'
import { getCurrentUserRole } from './services/auth'
import { StoreProvider } from './contexts/StoreContext'
import { LayoutPreferencesProvider } from './contexts/LayoutPreferencesContext'
import { ToastProvider } from './contexts/ToastContext'
import { LanguageProvider } from './contexts/LanguageContext'
import { GenerateTasksProvider } from './contexts/GenerateTasksContext'

function AppRoutes() {
  const { t } = useTranslation()
  return (
    <ToastProvider>
      <GenerateTasksProvider>
        <LayoutPreferencesProvider>
          <Suspense
            fallback={
              <div className="min-h-screen flex items-center justify-center text-slate-500 bg-slate-50">
                {t('common.loading')}
              </div>
            }
          >
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <StoreProvider>
                      <Dashboard />
                    </StoreProvider>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/analysis"
                element={
                  <ProtectedRoute>
                    <StoreProvider>
                      <AnalysisPage />
                    </StoreProvider>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/tools"
                element={
                  <ProtectedRoute>
                    <StoreProvider>
                      <ToolsPage />
                    </StoreProvider>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/tools/:toolId"
                element={
                  <ProtectedRoute>
                    <StoreProvider>
                      <ToolsPage />
                    </StoreProvider>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/llm"
                element={
                  <ProtectedRoute>
                    {getCurrentUserRole() === 'admin' || getCurrentUserRole() === 'manager' ? (
                      <LLMPage />
                    ) : (
                      <Navigate to="/" replace />
                    )}
                  </ProtectedRoute>
                }
              />
              <Route
                path="/profile"
                element={
                  <ProtectedRoute>
                    <StoreProvider>
                      <Profile />
                    </StoreProvider>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin"
                element={
                  <ProtectedRoute>
                    {getCurrentUserRole() === 'admin' || getCurrentUserRole() === 'manager' ? (
                      <Navigate to="/admin/permissions" replace />
                    ) : (
                      <Navigate to="/" replace />
                    )}
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/permissions"
                element={
                  <ProtectedRoute>
                    {getCurrentUserRole() === 'admin' || getCurrentUserRole() === 'manager' ? (
                      <PermissionConfigPage />
                    ) : (
                      <Navigate to="/" replace />
                    )}
                  </ProtectedRoute>
                }
              />
              <Route
                path="/feedback"
                element={
                  <ProtectedRoute>
                    {getCurrentUserRole() === 'admin' || getCurrentUserRole() === 'manager' ? (
                      <FeedbackManagement />
                    ) : (
                      <Navigate to="/" replace />
                    )}
                  </ProtectedRoute>
                }
              />
              <Route
                path="/messages"
                element={
                  <ProtectedRoute>
                    <MessageCenter />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </LayoutPreferencesProvider>
      </GenerateTasksProvider>
    </ToastProvider>
  )
}

function App() {
  try {
    if (typeof window === 'undefined') {
      return <div>{i18n.t('common.loading')}</div>
    }

    return (
      <Router>
        <LanguageProvider>
          <AppRoutes />
        </LanguageProvider>
      </Router>
    )
  } catch (error) {
    console.error('App 渲染错误:', error)
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-red-600 mb-4">{i18n.t('common.appRenderFailedTitle')}</h1>
          <p className="text-slate-700 mb-4">{i18n.t('common.appRenderFailedHint')}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            {i18n.t('common.reloadPage')}
          </button>
        </div>
      </div>
    )
  }
}

export default App
