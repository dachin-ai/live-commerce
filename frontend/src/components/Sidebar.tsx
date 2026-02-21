import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { Store, Mail, BarChart3, MessageSquare, BookOpen, Heart, User, LogOut, Settings, Users, Sparkles, GitBranch, ChevronRight, ChevronLeft, Globe, Cpu } from 'lucide-react'
import { useCurrentUser, useLogout, getCurrentUserRole } from '../services/auth'
import { useLanguage } from '../contexts/LanguageContext'
import type { Locale } from '../contexts/LanguageContext'
import { useTranslation } from 'react-i18next'
import TutorialModal from './TutorialModal'
import FeedbackModal from './FeedbackModal'
import SupportAuthorModal from './SupportAuthorModal'
import { useUnreadCount } from '../services/messages'

interface SidebarProps {
  /** 可选：不传则使用全局 LanguageContext（多语言持久化） */
  language?: string
  onLanguageChange?: (lang: string) => void
  isExpanded?: boolean
  onToggle?: (expanded: boolean) => void
}

export default function Sidebar({ language: propLanguage, onLanguageChange: propOnLanguageChange, isExpanded: controlledIsExpanded, onToggle }: SidebarProps) {
  const { locale: contextLocale, setLocale: contextSetLocale } = useLanguage()
  const language = (propLanguage ?? contextLocale) as Locale
  const onLanguageChange = propOnLanguageChange ?? ((lang: string) => contextSetLocale(lang as Locale))
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { data: currentUser } = useCurrentUser()
  const logout = useLogout()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showTutorialModal, setShowTutorialModal] = useState(false)
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [showSupportAuthorModal, setShowSupportAuthorModal] = useState(false)
  const [internalExpanded, setInternalExpanded] = useState(true)
  const userRole = getCurrentUserRole()
  const { data: unreadCount = 0 } = useUnreadCount()
  const isAdmin = userRole === 'admin' || userRole === 'manager' || currentUser?.role === 'admin' || currentUser?.role === 'manager'

  const getRoleLabel = (role?: string) => {
    if (role === 'admin') return t('sidebar.roleAdmin')
    if (role === 'manager') return t('sidebar.roleManager')
    if (role === 'operator') return t('sidebar.roleOperator')
    if (role === 'viewer') return t('sidebar.roleViewer')
    return t('sidebar.roleUser')
  }

  // 使用受控或非受控模式
  const isExpanded = controlledIsExpanded !== undefined ? controlledIsExpanded : internalExpanded
  const setIsExpanded = (value: boolean) => {
    if (controlledIsExpanded !== undefined) {
      onToggle?.(value)
    } else {
      setInternalExpanded(value)
    }
  }

  const handleLogout = async () => {
    try {
      await logout.mutateAsync()
      navigate('/login')
    } catch (error) {
      console.error('登出失败:', error)
    }
  }

  return (
    <div 
      className={`bg-gray-100 border-r border-gray-200 flex flex-col h-full min-h-0 transition-all duration-300 relative z-50 shrink-0 ${
        isExpanded ? 'w-64' : 'w-16'
      }`}
    >
      {/* 标题栏：展开/收起按钮 */}
      <div className="border-b border-gray-200 shrink-0">
        {isExpanded ? (
          // 展开状态：显示用户信息 + 用户菜单按钮
          <div className="p-4 relative">
            <div className="flex items-center justify-between mb-2">
              <div className="flex-1 min-w-0">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="text-left hover:bg-gray-200 rounded px-2 py-1 -ml-2 transition-colors w-full"
                >
                  <p className="font-medium text-gray-900 truncate">{currentUser?.name || t('common.loading')}</p>
                  <p className="text-xs text-gray-500">
                    {getRoleLabel(currentUser?.role)}
                  </p>
                </button>
              </div>
              <button
                onClick={() => setIsExpanded(false)}
                className="p-1 hover:bg-gray-200 rounded transition-colors ml-2 shrink-0"
                title="收起"
              >
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
            </div>
            <p className="text-xs text-gray-500 truncate px-2">{currentUser?.email || ''}</p>
            
            {/* 用户菜单（展开状态） */}
            {showUserMenu && (
              <div className="absolute left-4 top-full mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-[60]">
                <div className="p-2">
                  <button
                    onClick={() => {
                      setShowUserMenu(false)
                      navigate('/profile')
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded"
                  >
                    <Settings className="w-4 h-4" />
                    {t('sidebar.profile')}
                  </button>
                  <button
                    onClick={() => {
                      setShowUserMenu(false)
                      navigate('/messages')
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded"
                  >
                    <Mail className="w-4 h-4" />
                    {t('sidebar.messages')}
                    {unreadCount > 0 && (
                      <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => {
                        setShowUserMenu(false)
                        navigate('/admin')
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded"
                    >
                      <Users className="w-4 h-4" />
                      {t('sidebar.userManagement')}
                    </button>
                  )}
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded mt-1"
                  >
                    <LogOut className="w-4 h-4" />
                    {t('sidebar.logout')}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          // 收起状态：显示用户图标 + 展开按钮
          <div className="p-3 flex flex-col items-center gap-2">
            <div className="relative group">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="p-2 bg-blue-100 rounded-lg hover:bg-blue-200 transition-colors"
                title="用户菜单"
              >
                <User className="w-5 h-5 text-blue-600" />
              </button>
              <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                {currentUser?.name || '用户'}
              </span>
              {showUserMenu && (
                <div className="absolute left-full ml-2 top-0 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                  <div className="p-2">
                  <button
                    onClick={() => {
                      setShowUserMenu(false)
                      navigate('/profile')
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded"
                  >
                    <Settings className="w-4 h-4" />
                    {t('sidebar.profile')}
                  </button>
                  <button
                    onClick={() => {
                      setShowUserMenu(false)
                      navigate('/messages')
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded"
                  >
                    <Mail className="w-4 h-4" />
                    {t('sidebar.messages')}
                    {unreadCount > 0 && (
                      <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => {
                        setShowUserMenu(false)
                        navigate('/admin')
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded"
                    >
                      <Users className="w-4 h-4" />
                      {t('sidebar.userManagement')}
                    </button>
                  )}
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded mt-1"
                    >
                      <LogOut className="w-4 h-4" />
                      退出登录
                    </button>
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={() => setIsExpanded(true)}
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
              title="展开侧边栏"
            >
              <ChevronRight className="w-4 h-4 text-gray-600" />
            </button>
          </div>
        )}
      </div>

      {/* 语言选择器 */}
      {isExpanded ? (
        <div className="p-4 border-b border-gray-200">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            {t('sidebar.language')}
          </label>
          <select
            value={language}
            onChange={(e) => onLanguageChange(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="zh-CN">CN 中文</option>
            <option value="en-US">EN English</option>
            <option value="th-TH">TH ภาษาไทย</option>
          </select>
        </div>
      ) : (
        <div className="px-3 py-2 border-b border-gray-200">
          <button
            onClick={() => setIsExpanded(true)}
            className="group relative p-2 hover:bg-gray-200 rounded-lg transition-colors w-full"
            title="语言"
          >
            <Globe className="w-5 h-5 text-gray-600 mx-auto" />
            <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
              语言: {language === 'zh-CN' ? '中文' : language === 'en-US' ? 'English' : 'ภาษา'}
            </span>
          </button>
        </div>
      )}

      {/* 导航菜单 */}
      <div className="flex-1 overflow-y-auto">
        {isExpanded ? (
          // 展开状态：显示完整菜单
          <div className="p-4 space-y-2">
            <button
              onClick={() => navigate('/')}
              className={`w-full flex items-center gap-3 p-2 rounded-lg ${
                location.pathname === '/'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Store className="w-5 h-5" />
              <span className="font-medium">{t('sidebar.dashboard')}</span>
            </button>
            <button
              onClick={() => navigate('/analysis')}
              className={`w-full flex items-center gap-3 p-2 rounded-lg ${
                location.pathname === '/analysis'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-200'
              }`}
            >
              <BarChart3 className="w-5 h-5" />
              <span>{t('sidebar.analysis')}</span>
            </button>
            <button
              onClick={() => navigate('/tools')}
              className={`w-full flex items-center gap-3 p-2 rounded-lg ${
                location.pathname === '/tools'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Sparkles className="w-5 h-5" />
              <span>{t('sidebar.tools')}</span>
            </button>
            <Link
              to="/messages"
              className={`w-full flex items-center gap-3 p-2 rounded-lg ${
                location.pathname === '/messages'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Mail className="w-5 h-5" />
              <span>{t('sidebar.messages')}</span>
              {unreadCount > 0 && (
                <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </Link>
            
            {/* 管理员专属功能：工作流、LLM 调用方式、用户管理、权限配置 */}
            {isAdmin && (
              <div className="pt-2 mt-2 border-t border-gray-200">
                <p className="text-xs font-medium text-gray-500 mb-2 px-2">{t('sidebar.adminSection')}</p>
                <Link
                  to="/workflow"
                  className={`w-full flex items-center gap-3 p-2 rounded-lg ${
                    location.pathname === '/workflow'
                      ? 'bg-purple-100 text-purple-700'
                      : 'text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <GitBranch className="w-5 h-5" />
                  <span>{t('sidebar.workflow')}</span>
                </Link>
                <Link
                  to="/llm"
                  className={`w-full flex items-center gap-3 p-2 rounded-lg ${
                    location.pathname === '/llm'
                      ? 'bg-purple-100 text-purple-700'
                      : 'text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <Cpu className="w-5 h-5" />
                  <span>{t('sidebar.llmModes')}</span>
                </Link>
                <Link
                  to="/admin"
                  className={`w-full flex items-center gap-3 p-2 rounded-lg ${
                    location.pathname === '/admin'
                      ? 'bg-purple-100 text-purple-700'
                      : 'text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <Users className="w-5 h-5" />
                  <span>{t('sidebar.userManagement')}</span>
                </Link>
                <Link
                  to="/admin"
                  className={`w-full flex items-center gap-3 p-2 rounded-lg ${
                    location.pathname === '/admin'
                      ? 'bg-purple-100 text-purple-700'
                      : 'text-gray-700 hover:bg-gray-200'
                  }`}
                  title={t('sidebar.permissionConfigHint', { fallback: '权限由用户管理中的角色控制' })}
                >
                  <Settings className="w-5 h-5" />
                  <span>{t('sidebar.permissionConfig')}</span>
                </Link>
                <Link
                  to="/feedback"
                  className={`w-full flex items-center gap-3 p-2 rounded-lg ${
                    location.pathname === '/feedback'
                      ? 'bg-purple-100 text-purple-700'
                      : 'text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <MessageSquare className="w-5 h-5" />
                  <span>{t('sidebar.feedbackManage')}</span>
                </Link>
              </div>
            )}
          </div>
        ) : (
          // 收起状态：只显示图标按钮
          <div className="flex flex-col items-center gap-1 py-4">
            <button
              onClick={() => navigate('/')}
              className={`group relative p-3 rounded-lg transition-colors ${
                location.pathname === '/'
                  ? 'bg-blue-100 text-blue-600'
                  : 'hover:bg-gray-200 text-gray-600'
              }`}
              title={t('sidebar.dashboard')}
            >
              <Store className="w-5 h-5" />
              <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                {t('sidebar.dashboard')}
              </span>
            </button>
            <button
              onClick={() => navigate('/analysis')}
              className={`group relative p-3 rounded-lg transition-colors ${
                location.pathname === '/analysis'
                  ? 'bg-blue-100 text-blue-600'
                  : 'hover:bg-gray-200 text-gray-600'
              }`}
              title={t('sidebar.analysis')}
            >
              <BarChart3 className="w-5 h-5" />
              <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                {t('sidebar.analysis')}
              </span>
            </button>
            <button
              onClick={() => navigate('/tools')}
              className={`group relative p-3 rounded-lg transition-colors ${
                location.pathname === '/tools'
                  ? 'bg-blue-100 text-blue-600'
                  : 'hover:bg-gray-200 text-gray-600'
              }`}
              title={t('sidebar.tools')}
            >
              <Sparkles className="w-5 h-5" />
              <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                {t('sidebar.tools')}
              </span>
            </button>
            <Link
              to="/messages"
              className={`group relative p-3 rounded-lg transition-colors ${
                location.pathname === '/messages'
                  ? 'bg-blue-100 text-blue-600'
                  : 'hover:bg-gray-200 text-gray-600'
              }`}
              title={t('sidebar.messages')}
            >
              <Mail className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[14px] h-[14px] px-0.5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
              <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                {t('sidebar.messages')}
              </span>
            </Link>
            
            {/* 管理员图标（收起状态）：工作流、LLM、用户管理、权限配置 */}
            {isAdmin && (
              <>
                <div className="w-8 h-px bg-gray-300 my-1" />
                <Link
                  to="/workflow"
                  className={`group relative p-3 rounded-lg transition-colors ${
                    location.pathname === '/workflow'
                      ? 'bg-purple-100 text-purple-600'
                      : 'hover:bg-gray-200 text-gray-600'
                  }`}
                  title={t('sidebar.workflow')}
                >
                  <GitBranch className="w-5 h-5" />
                  <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                    {t('sidebar.workflow')}
                  </span>
                </Link>
                <Link
                  to="/llm"
                  className={`group relative p-3 rounded-lg transition-colors ${
                    location.pathname === '/llm'
                      ? 'bg-purple-100 text-purple-600'
                      : 'hover:bg-gray-200 text-gray-600'
                  }`}
                  title={t('sidebar.llmModes')}
                >
                  <Cpu className="w-5 h-5" />
                  <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                    {t('sidebar.llmModes')}
                  </span>
                </Link>
                <Link
                  to="/admin"
                  className={`group relative p-3 rounded-lg transition-colors ${
                    location.pathname === '/admin'
                      ? 'bg-purple-100 text-purple-600'
                      : 'hover:bg-gray-200 text-gray-600'
                  }`}
                  title={t('sidebar.userManagement')}
                >
                  <Users className="w-5 h-5" />
                  <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                    {t('sidebar.userManagement')}
                  </span>
                </Link>
                <Link
                  to="/admin"
                  className={`group relative p-3 rounded-lg transition-colors ${
                    location.pathname === '/admin'
                      ? 'bg-purple-100 text-purple-600'
                      : 'hover:bg-gray-200 text-gray-600'
                  }`}
                  title={t('sidebar.permissionConfigHint', { fallback: '权限由用户管理中的角色控制' })}
                >
                  <Settings className="w-5 h-5" />
                  <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                    {t('sidebar.permissionConfig')}
                  </span>
                </Link>
                <Link
                  to="/feedback"
                  className={`group relative p-3 rounded-lg transition-colors ${
                    location.pathname === '/feedback'
                      ? 'bg-purple-100 text-purple-600'
                      : 'hover:bg-gray-200 text-gray-600'
                  }`}
                  title={t('sidebar.feedbackManage')}
                >
                  <MessageSquare className="w-5 h-5" />
                  <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                    {t('sidebar.feedbackManage')}
                  </span>
                </Link>
              </>
            )}
          </div>
        )}
      </div>

      {/* 底部：问题反馈、教程入口、支持作者 */}
      <div className="border-t border-gray-200 shrink-0">
        {isExpanded ? (
          <div className="p-4">
            <div className="flex items-center justify-around">
              <button
                type="button"
                onClick={() => setShowFeedbackModal(true)}
                className="p-2 hover:bg-gray-200 rounded-full"
                title={t('sidebar.feedback')}
              >
                <MessageSquare className="w-5 h-5 text-gray-600" />
              </button>
              <button
                type="button"
                onClick={() => setShowTutorialModal(true)}
                className="p-2 hover:bg-gray-200 rounded-full"
                title={t('sidebar.tutorial')}
              >
                <BookOpen className="w-5 h-5 text-gray-600" />
              </button>
              <button
                type="button"
                onClick={() => setShowSupportAuthorModal(true)}
                className="p-2 hover:bg-gray-200 rounded-full"
                title={t('sidebar.supportAuthor')}
              >
                <Heart className="w-5 h-5 text-gray-600" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 py-2">
            <button
              type="button"
              onClick={() => setShowFeedbackModal(true)}
              className="group relative p-2 hover:bg-gray-200 rounded-lg transition-colors"
              title={t('sidebar.feedback')}
            >
              <MessageSquare className="w-5 h-5 text-gray-600" />
              <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                {t('sidebar.feedback')}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setShowTutorialModal(true)}
              className="group relative p-2 hover:bg-gray-200 rounded-lg transition-colors"
              title={t('sidebar.tutorial')}
            >
              <BookOpen className="w-5 h-5 text-gray-600" />
              <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                {t('sidebar.tutorial')}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setShowSupportAuthorModal(true)}
              className="group relative p-2 hover:bg-gray-200 rounded-lg transition-colors"
              title={t('sidebar.supportAuthor')}
            >
              <Heart className="w-5 h-5 text-gray-600" />
              <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                {t('sidebar.supportAuthor')}
              </span>
            </button>
          </div>
        )}
      </div>

      {showTutorialModal && (
        <TutorialModal onClose={() => setShowTutorialModal(false)} />
      )}
      {showFeedbackModal && (
        <FeedbackModal onClose={() => setShowFeedbackModal(false)} />
      )}
      {showSupportAuthorModal && (
        <SupportAuthorModal onClose={() => setShowSupportAuthorModal(false)} />
      )}
    </div>
  )
}
