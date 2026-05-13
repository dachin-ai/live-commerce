import { useState, useMemo } from 'react'
import { X, Search, Users } from 'lucide-react'
import type { User } from '../services/users'
import { GlassInput } from './ui/GlassInput'
import { GlassButton } from './ui/GlassButton'

/**
 * 用户多选弹窗，用于权限配置等场景。
 * 预留：后续可扩展 permissionScope / permissionKey，以支持多类权限（如 llm | report | export）独立选择。
 */
export interface UserMultiSelectModalProps {
  open: boolean
  onClose: () => void
  users: User[]
  selectedIds: string[]
  onConfirm: (ids: string[]) => void
  title?: string
  placeholder?: string
  /** 预留：权限范围标识，便于后续迭代多维度权限（如 llm / report） */
  permissionScope?: string
}

export default function UserMultiSelectModal({
  open,
  onClose,
  users,
  selectedIds,
  onConfirm,
  title = '选择用户',
  placeholder = '搜索姓名或邮箱',
  permissionScope,
}: UserMultiSelectModalProps) {
  void permissionScope // 预留，后续可扩展多类权限独立选择
  const [search, setSearch] = useState('')
  const [draftIds, setDraftIds] = useState<string[]>(selectedIds)

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q)
    )
  }, [users, search])

  const toggle = (userId: string) => {
    setDraftIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    )
  }

  const selectAll = () => {
    setDraftIds(filteredUsers.map((u) => u.id))
  }

  const clearAll = () => {
    setDraftIds([])
  }

  const handleConfirm = () => {
    onConfirm(draftIds)
    setSearch('')
    onClose()
  }

  const handleClose = () => {
    setDraftIds(selectedIds)
    setSearch('')
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={handleClose} aria-hidden />
      <div
        className="relative w-full max-w-md max-h-[85vh] flex flex-col bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/50 animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-multi-select-title"
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-200/60">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary-600" />
            <h2 id="user-multi-select-title" className="text-lg font-bold text-slate-900">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100/50 hover:text-slate-600 transition-colors"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 flex-1 min-h-0 flex flex-col">
          <div className="relative">
            <GlassInput
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={placeholder}
              icon={<Search className="w-4 h-4" />}
            />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">
              已选 <strong className="text-slate-800">{draftIds.length}</strong> 人
            </span>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={selectAll}
                className="text-primary-600 font-medium hover:text-primary-700 transition-colors"
              >
                全选
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="text-slate-500 hover:text-slate-700 transition-colors"
              >
                清空
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto border border-slate-200/60 rounded-xl min-h-[200px] bg-white/50">
            <ul className="p-2 space-y-1">
              {filteredUsers.length === 0 ? (
                <li className="py-8 text-center text-sm text-slate-500 font-medium">
                  {search.trim() ? '无匹配用户' : '暂无用户'}
                </li>
              ) : (
                filteredUsers.map((u) => (
                  <li key={u.id}>
                    <label className="flex items-center gap-3 cursor-pointer hover:bg-slate-50/80 rounded-lg px-3 py-2.5 transition-colors">
                      <input
                        type="checkbox"
                        checked={draftIds.includes(u.id)}
                        onChange={() => toggle(u.id)}
                        className="rounded border-slate-300 text-primary-600 focus:ring-primary-500 w-4 h-4"
                      />
                      <span className="text-sm font-medium text-slate-800">{u.name}</span>
                      <span className="text-xs text-slate-500 truncate mt-0.5">({u.email})</span>
                    </label>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>

        <div className="flex justify-end gap-3 p-5 border-t border-slate-200/60 bg-slate-50/50 rounded-b-2xl">
          <GlassButton
            onClick={handleClose}
            variant="secondary"
          >
            取消
          </GlassButton>
          <GlassButton
            onClick={handleConfirm}
            variant="primary"
          >
            确定
          </GlassButton>
        </div>
      </div>
    </div>
  )
}
