import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface GenerateTasksContextType {
  /** 正在生成待办的店铺 ID，null 表示未在生成 */
  generatingStoreId: string | null
  /** 开始生成：传入店铺 ID */
  setGenerating: (storeId: string | null) => void
}

const GenerateTasksContext = createContext<GenerateTasksContextType | undefined>(undefined)

export function GenerateTasksProvider({ children }: { children: ReactNode }) {
  const [generatingStoreId, setGeneratingStoreId] = useState<string | null>(null)

  const setGenerating = useCallback((storeId: string | null) => {
    setGeneratingStoreId(storeId)
  }, [])

  return (
    <GenerateTasksContext.Provider value={{ generatingStoreId, setGenerating }}>
      {children}
    </GenerateTasksContext.Provider>
  )
}

export function useGenerateTasks(): GenerateTasksContextType {
  const ctx = useContext(GenerateTasksContext)
  if (!ctx) {
    throw new Error('useGenerateTasks must be used within GenerateTasksProvider')
  }
  return ctx
}
