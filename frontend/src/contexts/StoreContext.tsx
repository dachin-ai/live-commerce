import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useStores } from '../services/stores'

interface Store {
  id: string
  name: string
  nameTh?: string
  description?: string
  platform?: string
  status?: string
  /** 店铺货币代码，用于仪表盘与人民币对多国转换 */
  currency?: string
  currencySymbol?: string
}

interface StoreContextType {
  selectedStore: Store | null
  setSelectedStore: (store: Store | null) => void
  stores: Store[]
  isLoading: boolean
}

const StoreContext = createContext<StoreContextType | undefined>(undefined)

export function StoreProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, error } = useStores({ page: 1, limit: 50, light: true })
  const stores = data?.items ?? []
  const [selectedStore, setSelectedStoreState] = useState<Store | null>(null)

  // 从localStorage恢复选中的店铺
  useEffect(() => {
    // 如果获取店铺列表失败，不影响渲染
    if (error) {
      console.warn('获取店铺列表失败:', error)
      return
    }

    const savedStoreId = localStorage.getItem('selectedStoreId')
    if (savedStoreId && stores.length > 0) {
      const store = stores.find((s) => s.id === savedStoreId)
      if (store) {
        setSelectedStoreState(store)
      } else {
        // 如果保存的店铺不存在，选择第一个店铺
        if (stores.length > 0) {
          setSelectedStoreState(stores[0])
        }
      }
    } else if (stores.length > 0 && !selectedStore) {
      // 如果没有保存的店铺，选择第一个店铺
      setSelectedStoreState(stores[0])
    }
  }, [stores, selectedStore, error])

  const setSelectedStore = (store: Store | null) => {
    setSelectedStoreState(store)
    if (store) {
      localStorage.setItem('selectedStoreId', store.id)
    } else {
      localStorage.removeItem('selectedStoreId')
    }
  }

  return (
    <StoreContext.Provider
      value={{
        selectedStore,
        setSelectedStore,
        stores,
        isLoading,
      }}
    >
      {children}
    </StoreContext.Provider>
  )
}

export function useStore() {
  const context = useContext(StoreContext)
  if (context === undefined) {
    throw new Error('useStore must be used within a StoreProvider')
  }
  return context
}
