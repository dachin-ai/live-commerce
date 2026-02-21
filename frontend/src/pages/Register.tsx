import { Link } from 'react-router-dom'
import { UserPlus } from 'lucide-react'

export default function Register() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-400 rounded-full mb-4">
          <UserPlus className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">注册账号</h1>
        <p className="text-gray-600 mb-6">系统内测期，暂不支持</p>
        <Link
          to="/login"
          className="inline-block text-blue-600 hover:underline font-medium"
        >
          返回登录
        </Link>
      </div>
    </div>
  )
}
