import { useState, useMemo } from 'react'
import { X, Search, Users } from 'lucide-react'
import type { User } from '../services/users'

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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} aria-hidden />
      <div
        className="relative w-full max-w-md max-h-[85vh] flex flex-col bg-white rounded-xl shadow-xl border border-gray-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-multi-select-title"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            <h2 id="user-multi-select-title" className="text-lg font-semibold text-gray-900">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-3 flex-1 min-h-0 flex flex-col">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={placeholder}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">
              已选 <strong className="text-gray-700">{draftIds.length}</strong> 人
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={selectAll}
                className="text-indigo-600 hover:underline"
              >
                全选
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="text-gray-500 hover:underline"
              >
                清空
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto border border-gray-200 rounded-lg min-h-[200px]">
            <ul className="p-2 space-y-0.5">
              {filteredUsers.length === 0 ? (
                <li className="py-6 text-center text-sm text-gray-500">
                  {search.trim() ? '无匹配用户' : '暂无用户'}
                </li>
              ) : (
                filteredUsers.map((u) => (
                  <li key={u.id}>
                    <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-2 py-2">
                      <input
                        type="checkbox"
                        checked={draftIds.includes(u.id)}
                        onChange={() => toggle(u.id)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-gray-800">{u.name}</span>
                      <span className="text-xs text-gray-500 truncate">({u.email})</span>
                    </label>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  )
}
