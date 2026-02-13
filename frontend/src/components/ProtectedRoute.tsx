import { Navigate } from 'react-router-dom'
import { isAuthenticated } from '../services/auth'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  try {
    if (!isAuthenticated()) {
      return <Navigate to="/login" replace />
    }

    return <>{children}</>
  } catch (error) {
    console.error('ProtectedRoute 错误:', error)
    return <Navigate to="/login" replace />
  }
}
