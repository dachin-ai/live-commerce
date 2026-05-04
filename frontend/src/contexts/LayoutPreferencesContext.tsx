/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, ReactNode } from 'react'

export interface LayoutPreferences {
  showStoreList: boolean
  showStats: boolean
  showTaskList: boolean
  showAIFeatures: boolean
  showChart: boolean
  storeListCols: number
  statsCols: number
  taskListCols: number
  showIcons: boolean
}

const defaultPreferences: LayoutPreferences = {
  showStoreList: true,
  showStats: true,
  showTaskList: true,
  showAIFeatures: true,
  showChart: true,
  storeListCols: 3,
  statsCols: 6,
  taskListCols: 3,
  showIcons: true,
}

const STORAGE_KEY = 'layoutPreferences'

function loadPreferences(): LayoutPreferences {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      return {
        ...defaultPreferences,
        ...parsed,
        storeListCols: Math.max(1, Math.min(12, parsed.storeListCols ?? defaultPreferences.storeListCols)),
        statsCols: Math.max(1, Math.min(12, parsed.statsCols ?? defaultPreferences.statsCols)),
        taskListCols: Math.max(1, Math.min(12, parsed.taskListCols ?? defaultPreferences.taskListCols)),
      }
    }
  } catch (e) {
    console.warn('加载布局偏好失败:', e)
  }
  return defaultPreferences
}

interface LayoutPreferencesContextType {
  preferences: LayoutPreferences
  setPreferences: (patch: Partial<LayoutPreferences>) => void
  resetPreferences: () => void
}

const LayoutPreferencesContext = createContext<LayoutPreferencesContextType | undefined>(undefined)

export function LayoutPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferencesState] = useState<LayoutPreferences>(loadPreferences)

  const setPreferences = (patch: Partial<LayoutPreferences>) => {
    setPreferencesState((prev) => {
      const updated = { ...prev, ...patch }
      if (updated.storeListCols !== undefined) {
        updated.storeListCols = Math.max(1, Math.min(12, updated.storeListCols))
      }
      if (updated.statsCols !== undefined) {
        updated.statsCols = Math.max(1, Math.min(12, updated.statsCols))
      }
      if (updated.taskListCols !== undefined) {
        updated.taskListCols = Math.max(1, Math.min(12, updated.taskListCols))
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
      } catch (e) {
        console.warn('保存布局偏好失败:', e)
      }
      return updated
    })
  }

  const resetPreferences = () => {
    setPreferencesState(defaultPreferences)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch (e) {
      console.warn('重置布局偏好失败:', e)
    }
  }

  return (
    <LayoutPreferencesContext.Provider value={{ preferences, setPreferences, resetPreferences }}>
      {children}
    </LayoutPreferencesContext.Provider>
  )
}

export function useLayoutPreferences() {
  const ctx = useContext(LayoutPreferencesContext)
  if (ctx === undefined) {
    throw new Error('useLayoutPreferences must be used within LayoutPreferencesProvider')
  }
  return ctx
}
