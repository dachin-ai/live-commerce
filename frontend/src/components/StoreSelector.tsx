import { Store, ChevronDown } from 'lucide-react'
import { useStore } from '../contexts/StoreContext'

export default function StoreSelector() {
  const { selectedStore, setSelectedStore, stores, isLoading } = useStore()

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg">
        <Store className="w-4 h-4 text-gray-500" />
        <span className="text-sm text-gray-500">加载中...</span>
      </div>
    )
  }

  if (stores.length === 0) {
    return (
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent('openCreateStoreModal'))}
        className="flex items-center gap-2 px-4 py-2 bg-yellow-50 border border-yellow-200 rounded-lg hover:bg-yellow-100 text-left"
      >
        <Store className="w-4 h-4 text-yellow-600" />
        <span className="text-sm text-yellow-700">请先创建店铺（点击创建）</span>
      </button>
    )
  }

  return (
    <div className="relative">
      <select
        value={selectedStore?.id || ''}
        onChange={(e) => {
          const store = stores.find((s) => s.id === e.target.value)
          setSelectedStore(store || null)
        }}
        className="appearance-none bg-white border border-gray-300 rounded-lg px-4 py-2 pr-8 text-sm font-medium text-gray-900 hover:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
      >
        {stores.map((store) => (
          <option key={store.id} value={store.id}>
            {store.name} {store.nameTh && `(${store.nameTh})`}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
    </div>
  )
}
