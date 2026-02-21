import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import AnalysisPage from './pages/AnalysisPage'
import ToolsPage from './pages/ToolsPage'
import WorkflowPage from './pages/WorkflowPage'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Profile from './pages/Profile'
import AdminPanel from './pages/AdminPanel'
import LLMPage from './pages/LLMPage'
import FeedbackManagement from './pages/FeedbackManagement'
import MessageCenter from './pages/MessageCenter'
import ProtectedRoute from './components/ProtectedRoute'
import { getCurrentUserRole } from './services/auth'
import { StoreProvider } from './contexts/StoreContext'
import { LayoutPreferencesProvider } from './contexts/LayoutPreferencesContext'
import { ToastProvider } from './contexts/ToastContext'
import { LanguageProvider } from './contexts/LanguageContext'

function App() {
  try {
    // 确保在渲染前检查关键依赖
    if (typeof window === 'undefined') {
      return <div>加载中...</div>
    }
    
    return (
      <Router>
        <LanguageProvider>
        <ToastProvider>
        <LayoutPreferencesProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route
            path="/workflow"
            element={
              <ProtectedRoute>
                {(getCurrentUserRole() === 'admin' || getCurrentUserRole() === 'manager') ? (
                  <StoreProvider>
                    <WorkflowPage />
                  </StoreProvider>
                ) : (
                  <Navigate to="/" replace />
                )}
              </ProtectedRoute>
            }
          />
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
              {(getCurrentUserRole() === 'admin' || getCurrentUserRole() === 'manager') ? (
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
              {(getCurrentUserRole() === 'admin' || getCurrentUserRole() === 'manager') ? (
                <AdminPanel />
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
              {(getCurrentUserRole() === 'admin' || getCurrentUserRole() === 'manager') ? (
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
        </LayoutPreferencesProvider>
        </ToastProvider>
        </LanguageProvider>
      </Router>
    )
  } catch (error) {
    console.error('App 渲染错误:', error)
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">应用启动失败</h1>
          <p className="text-gray-700 mb-4">请检查浏览器控制台获取详细错误信息</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            刷新页面
          </button>
        </div>
      </div>
    )
  }
}

export default App
