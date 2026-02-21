import { useState, useEffect } from 'react'
import { X, Plus } from 'lucide-react'
import { useCreateStore, CreateStoreData } from '../services/stores'
import { useCreateTask } from '../services/tasks'
import { useUsers } from '../services/users'
import { useCategories } from '../services/categories'
import { useCountries, useCurrencyByRegion } from '../services/regions'
import { getCurrentUserRole } from '../services/auth'
import { useStore } from '../contexts/StoreContext'
import { useToast } from '../contexts/ToastContext'
import CountrySelector from './CountrySelector'

// 国家→货币静态映射，切换国家时立即更新显示，不依赖接口返回时机
const COUNTRY_CURRENCY: Record<string, { currency: string; symbol: string; code: string }> = {
  '中国': { currency: '人民币', symbol: '¥', code: 'CNY' },
  '中国香港': { currency: '港币', symbol: 'HK$', code: 'HKD' },
  '中国台湾': { currency: '新台币', symbol: 'NT$', code: 'TWD' },
  '泰国': { currency: '泰铢', symbol: '฿', code: 'THB' },
  '越南': { currency: '越南盾', symbol: '₫', code: 'VND' },
  '印度尼西亚': { currency: '印尼盾', symbol: 'Rp', code: 'IDR' },
  '马来西亚': { currency: '林吉特', symbol: 'RM', code: 'MYR' },
  '新加坡': { currency: '新加坡元', symbol: 'S$', code: 'SGD' },
  '菲律宾': { currency: '菲律宾比索', symbol: '₱', code: 'PHP' },
  '缅甸': { currency: '缅元', symbol: 'K', code: 'MMK' },
  '柬埔寨': { currency: '瑞尔', symbol: '៛', code: 'KHR' },
  '老挝': { currency: '基普', symbol: '₭', code: 'LAK' },
  '文莱': { currency: '文莱元', symbol: 'B$', code: 'BND' },
  '其他': { currency: '人民币', symbol: '¥', code: 'CNY' },
}

interface CreateStoreModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function CreateStoreModal({ isOpen, onClose }: CreateStoreModalProps) {
  const toast = useToast()
  const createStore = useCreateStore()
  const createTask = useCreateTask()
  const { setSelectedStore } = useStore()
  const userRole = getCurrentUserRole()
  const isAdmin = userRole === 'admin'
  const { data: users = [] } = useUsers()
  const { data: level1Categories = [], isLoading: level1Loading, isError: level1Error, refetch: refetchCategories } = useCategories(1)
  const { data: countries = [] } = useCountries()
  const [country, setCountry] = useState<string>('中国')
  const { data: currencyInfo, isFetching: currencyFetching } = useCurrencyByRegion(country || '中国')
  const [currencyOverride, setCurrencyOverride] = useState<boolean>(false)

  const [selectedLevel1, setSelectedLevel1] = useState<string>('')
  const [selectedLevel2Ids, setSelectedLevel2Ids] = useState<string[]>([])
  const { data: level2Categories = [] } = useCategories(2, selectedLevel1)
  const level3ParentIds = selectedLevel2Ids.length > 0 ? selectedLevel2Ids.join(',') : ''
  const { data: level3Categories = [] } = useCategories(3, level3ParentIds)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])

  const [formData, setFormData] = useState<CreateStoreData>({
    name: '',
    nameTh: '',
    userId: '',
    region: '中国',
    currency: 'CNY',
    currencySymbol: '¥',
    minPrice: undefined,
    maxPrice: undefined,
    targetAudience: '',
    brandPositioning: '小型品牌',
    brandStrategy: '',
    categoryIds: [],
    platform: '抖音',
    status: 'active',
  })

  // 每次打开弹窗时重置为国家默认（中国）
  useEffect(() => {
    if (isOpen) {
      setCountry('中国')
      setCurrencyOverride(false)
    }
  }, [isOpen])

  // 切换国家时立即用静态映射更新 region 与货币，保证选择越南/泰国等立刻显示对应货币
  useEffect(() => {
    if (!country) return
    setCurrencyOverride(false)
    const cur = COUNTRY_CURRENCY[country] || COUNTRY_CURRENCY['中国']
    setFormData(prev => ({
      ...prev,
      region: country,
      currency: cur.code,
      currencySymbol: cur.symbol,
    }))
  }, [country])

  // 接口返回后若与当前国家一致且未手动改货币，可覆盖一次（可选，静态映射已保证显示正确）
  useEffect(() => {
    if (currencyOverride || currencyFetching || !currencyInfo) return
    const apiCountry = (currencyInfo as { country?: string }).country
    if (apiCountry != null && apiCountry !== country) return
    setFormData(prev => ({
      ...prev,
      currency: currencyInfo.code,
      currencySymbol: currencyInfo.symbol,
    }))
  }, [currencyInfo, currencyOverride, currencyFetching, country])

  const handleSubmit = async () => {
    // 确保从DOM获取最新值（防止React状态未更新）
    const nameInput = document.querySelector('input[placeholder*="店铺名称"]') as HTMLInputElement
    const actualName = nameInput?.value?.trim() || formData.name.trim()
    
    if (!actualName) {
      toast.warning('请输入店铺名称')
      return
    }
    
    // 如果DOM值和状态不一致，更新状态
    if (actualName !== formData.name.trim()) {
      setFormData(prev => ({ ...prev, name: actualName }))
    }

    try {
      // 使用实际名称（从DOM或状态）
      const finalFormData = {
        ...formData,
        name: actualName,
        categoryIds: selectedCategories,
      }

      const newStore = await createStore.mutateAsync(finalFormData)
      // 自动选择新创建的店铺
      if (newStore && newStore.id) {
        setSelectedStore(newStore)
        // 待办 1：确认品牌定位（可在待办中确认或调整）
        try {
          await createTask.mutateAsync({
            title: '确认品牌定位',
            description: `当前选择：${formData.brandPositioning}。请在待办中确认或调整为：无品牌/小型品牌/中型品牌/大型品牌。`,
            priority: 'normal',
            status: 'pending',
            storeId: newStore.id,
          })
        } catch { /* 忽略待办创建失败 */ }
        // 待办 2：生成或确认品牌影响力策略（合并到待办实现：在待办中完成策略生成/编辑）
        try {
          // 获取已选分类的显示名称
          const categoryNames = selectedCategories
            .map(catId => {
              const cat = level3Categories.find(c => c.id === catId) ?? level2Categories.find(c => c.id === catId)
              return cat ? cat.name : null
            })
            .filter(Boolean)
            .join('、')
          
          await createTask.mutateAsync({
            title: '生成或确认品牌影响力策略',
            description: `店铺「${formData.name.trim()}」已创建。请在待办中完成品牌影响力策略：\n\n【操作步骤】\n① 在 Dashboard 的「AI自动生成」功能区，点击「市场分析」或「商品推荐」\n② 或使用「AI助手」功能，输入"为店铺${formData.name.trim()}生成品牌策略"\n③ 系统将基于以下店铺属性自动生成策略：\n\n【店铺属性】\n- 平台：${formData.platform}\n- 区域：${formData.region}\n- 价格区间：${formData.minPrice || '未设置'} - ${formData.maxPrice || '未设置'} ${formData.currency}\n- 目标人群：${formData.targetAudience || '未设置'}\n- 品牌定位：${formData.brandPositioning}\n- 产品分类：${selectedCategories.length > 0 ? `${categoryNames}（共${selectedCategories.length}个）` : '未设置'}\n\n【完成标准】\n生成策略后，请确认策略内容是否符合店铺定位，确认后在本待办中标记完成。`,
            priority: 'normal',
            status: 'pending',
            storeId: newStore.id,
          })
        } catch { /* 忽略待办创建失败 */ }
      }
      onClose()
      // 重置表单
      setFormData({
        name: '',
        nameTh: '',
        userId: '',
        region: '中国',
        currency: 'CNY',
        currencySymbol: '¥',
        minPrice: undefined,
        maxPrice: undefined,
        targetAudience: '',
        brandPositioning: '小型品牌',
        brandStrategy: '',
        categoryIds: [],
        platform: '抖音',
        status: 'active',
      })
      setSelectedCategories([])
      setSelectedLevel1('')
      setSelectedLevel2Ids([])
      setCountry('中国')
      setCurrencyOverride(false)
    } catch (error: any) {
      const msg = error?.response?.data?.error || error?.message || '创建店铺失败'
      toast.error(msg)
    }
  }

  const handleLevel2Toggle = (categoryId: string) => {
    setSelectedLevel2Ids(prev =>
      prev.includes(categoryId)
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    )
    setSelectedCategories(prev => prev.filter(id => {
      if (id === categoryId) return false
      const cat = level3Categories.find(c => c.id === id)
      return !cat || cat.parentId !== categoryId
    }))
  }

  const handleCategoryToggle = (categoryId: string) => {
    setSelectedCategories(prev =>
      prev.includes(categoryId)
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    )
  }

  // 选中的二级里，没有三级子分类的 ID 列表（这类二级可直接作为分类添加）
  const level2IdsWithNoLevel3 = selectedLevel2Ids.filter(
    id => !level3Categories.some(c => c.parentId === id)
  )

  const handleAddCategories = () => {
    // 无三级子分类的二级：直接加入已选分类
    const toAdd = level2IdsWithNoLevel3.filter(id => !selectedCategories.includes(id))
    if (toAdd.length === 0 && selectedCategories.length === 0) {
      toast.warning('请先勾选三级分类，或勾选无三级子分类的二级分类')
      return
    }
    if (toAdd.length > 0) {
      setSelectedCategories(prev => {
        const next = [...new Set([...prev, ...toAdd])]
        toast.success(`已选 ${next.length} 个分类，创建店铺时会一并保存`)
        return next
      })
    } else {
      toast.success(`已选 ${selectedCategories.length} 个分类，创建店铺时会一并保存`)
    }
  }


  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-xl font-semibold text-gray-900">创建店铺</h3>
            <p className="text-sm text-gray-500 mt-1">参考抖音电商/千牛卖家中心店铺定义，创建新的直播店铺</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-6">
          {/* 基本信息 */}
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">基本信息</h4>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                店铺名称 *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="输入店铺名称"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                平台 *
              </label>
              <select
                value={formData.platform}
                onChange={(e) => setFormData({ ...formData, platform: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="抖音">抖音</option>
                <option value="TikTok">TikTok</option>
                <option value="淘宝">淘宝</option>
                <option value="天猫">天猫</option>
                <option value="京东">京东</option>
                <option value="小红书">小红书</option>
                <option value="快手">快手</option>
                <option value="其他">其他</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                店铺名称 (泰语)
              </label>
              <input
                type="text"
                value={formData.nameTh || ''}
                onChange={(e) => setFormData({ ...formData, nameTh: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="输入泰语店铺名称"
              />
            </div>

            {isAdmin && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  选择用户（管理员可指定）
                </label>
                <select
                  value={formData.userId || ''}
                  onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">当前用户</option>
                  {users.map(user => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.email})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* 国家 */}
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">国家</h4>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">国家 *</label>
              <CountrySelector
                value={country}
                onChange={setCountry}
                options={countries.length > 0 ? countries : [
                  { id: '中国', name: '中国' },
                  { id: '中国香港', name: '中国香港' },
                  { id: '中国台湾', name: '中国台湾' },
                  { id: '泰国', name: '泰国' },
                  { id: '越南', name: '越南' },
                  { id: '印度尼西亚', name: '印度尼西亚' },
                  { id: '马来西亚', name: '马来西亚' },
                  { id: '新加坡', name: '新加坡' },
                  { id: '菲律宾', name: '菲律宾' },
                  { id: '缅甸', name: '缅甸' },
                  { id: '柬埔寨', name: '柬埔寨' },
                  { id: '老挝', name: '老挝' },
                  { id: '文莱', name: '文莱' },
                  { id: '其他', name: '其他' },
                ]}
                defaultCountry="中国"
                placeholder="选择国家"
              />
              <p className="text-xs text-gray-500 mt-1">默认中国，支持搜索；开放中国与东南亚等国家</p>
              <p className="text-sm text-blue-600 mt-1 min-h-[1.25rem]" aria-live="polite">
                {(() => {
                  const cur = COUNTRY_CURRENCY[country] || COUNTRY_CURRENCY['中国']
                  return `推荐货币: ${cur.currency} (${cur.symbol} ${cur.code})`
                })()}
              </p>
            </div>
          </div>

          {/* 产品分类 */}
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">产品分类 (支持多选)</h4>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">一级分类</label>
              <select
                value={selectedLevel1}
                onChange={(e) => {
                  setSelectedLevel1(e.target.value)
                  setSelectedLevel2Ids([])
                  setSelectedCategories([])
                }}
                className="w-full max-w-xs min-w-[12rem] px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                aria-label="一级分类"
                aria-busy={level1Loading}
              >
                <option value="">
                  {level1Loading ? '加载中…' : level1Error ? '加载失败，请重试' : '选择一级分类'}
                </option>
                {level1Categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
              {level1Error && (
                <p className="text-xs text-red-600 mt-1">一级分类加载失败，请确认后端已启动。
                  <button type="button" onClick={() => refetchCategories()} className="ml-1 text-blue-600 hover:underline">重试</button>
                </p>
              )}
              {!level1Loading && !level1Error && level1Categories.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  暂无分类数据。请运行根目录「重置数据库.bat」后刷新页面，或确认后端已启动。
                  <button type="button" onClick={() => refetchCategories()} className="ml-1 text-blue-600 hover:underline">重试</button>
                </p>
              )}
            </div>

            {selectedLevel1 && level2Categories.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">二级分类（可多选）</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 border border-gray-200 rounded-lg p-2 max-h-32 overflow-y-auto">
                  {level2Categories.map(cat => (
                    <label
                      key={cat.id}
                      className="flex items-center gap-2 p-2 hover:bg-gray-50 cursor-pointer rounded"
                    >
                      <input
                        type="checkbox"
                        checked={selectedLevel2Ids.includes(cat.id)}
                        onChange={() => handleLevel2Toggle(cat.id)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="text-sm">{cat.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {selectedLevel2Ids.length > 0 && level3Categories.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  三级分类（可多选）
                </label>
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2">
                  {level3Categories.map(cat => (
                    <label
                      key={cat.id}
                      className="flex items-center gap-2 p-2 hover:bg-gray-50 cursor-pointer rounded"
                    >
                      <input
                        type="checkbox"
                        checked={selectedCategories.includes(cat.id)}
                        onChange={() => handleCategoryToggle(cat.id)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="text-sm">{cat.name}</span>
                    </label>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <button
                    onClick={handleAddCategories}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    添加选中的分类
                  </button>
                  {level2IdsWithNoLevel3.length > 0 && (
                    <span className="text-xs text-gray-500">
                      当前勾选的二级中有 {level2IdsWithNoLevel3.length} 个无三级子分类，点击按钮会一并添加
                    </span>
                  )}
                </div>
              </div>
            )}

            {selectedLevel2Ids.length > 0 && level3Categories.length === 0 && level2IdsWithNoLevel3.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleAddCategories}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                >
                  <Plus className="w-4 h-4" />
                  添加选中的分类
                </button>
                <span className="text-xs text-gray-500">
                  当前一级下无三级分类，可直接添加已勾选的二级分类
                </span>
              </div>
            )}

            {selectedCategories.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedCategories.map(catId => {
                  const cat = level3Categories.find(c => c.id === catId) ?? level2Categories.find(c => c.id === catId)
                  return cat ? (
                    <span
                      key={catId}
                      className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs flex items-center gap-1"
                    >
                      {cat.name}
                      <button
                        onClick={() => handleCategoryToggle(catId)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ) : null
                })}
              </div>
            )}

            <p className="text-xs text-gray-500">
              参考抖音电商三级分类：先选一级（如服饰内衣、美妆、食品等），再勾选多个二级，再勾选多个三级，点击「添加选中的分类」
            </p>
          </div>

          {/* 货币和价格（可省略，跟随国家推荐） */}
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">货币与价格</h4>
            {!currencyOverride && currencyInfo ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-gray-700">
                  货币：{formData.currencySymbol} {formData.currency}（跟随国家推荐）
                </span>
                <button
                  type="button"
                  onClick={() => setCurrencyOverride(true)}
                  className="text-sm text-blue-600 hover:underline"
                >
                  修改
                </button>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">货币单位（可选）</label>
                <select
                  value={[formData.currencySymbol, formData.currency].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || '¥ CNY'}
                  onChange={(e) => {
                    const v = e.target.value
                    const lastSpace = v.lastIndexOf(' ')
                    const symbol = lastSpace > 0 ? v.slice(0, lastSpace) : v
                    const code = lastSpace > 0 ? v.slice(lastSpace + 1) : 'CNY'
                    setFormData({ ...formData, currencySymbol: symbol, currency: code })
                  }}
                  className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="¥ CNY">¥ 人民币 (CNY)</option>
                  <option value="HK$ HKD">HK$ 港币 (HKD)</option>
                  <option value="NT$ TWD">NT$ 新台币 (TWD)</option>
                  <option value="฿ THB">฿ 泰铢 (THB)</option>
                  <option value="₫ VND">₫ 越南盾 (VND)</option>
                  <option value="Rp IDR">Rp 印尼盾 (IDR)</option>
                  <option value="RM MYR">RM 林吉特 (MYR)</option>
                  <option value="S$ SGD">S$ 新加坡元 (SGD)</option>
                  <option value="₱ PHP">₱ 菲律宾比索 (PHP)</option>
                  <option value="K MMK">K 缅元 (MMK)</option>
                  <option value="៛ KHR">៛ 瑞尔 (KHR)</option>
                  <option value="₭ LAK">₭ 基普 (LAK)</option>
                  <option value="B$ BND">B$ 文莱元 (BND)</option>
                </select>
                <button
                  type="button"
                  onClick={() => setCurrencyOverride(false)}
                  className="ml-2 text-sm text-gray-500 hover:underline"
                >
                  恢复跟随国家
                </button>
              </div>
            )}

            <div>
              <p className="text-sm text-gray-600 mb-2">
                价格区间（{(() => {
                  const cur = COUNTRY_CURRENCY[formData.region || country] || COUNTRY_CURRENCY['中国']
                  return cur.currency
                })()}）
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    最低价
                  </label>
                  <input
                    type="number"
                    value={formData.minPrice || ''}
                    onChange={(e) => setFormData({ ...formData, minPrice: e.target.value ? Number(e.target.value) : undefined })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="最低价"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    最高价 <span className="text-gray-500 font-normal">({formData.currencySymbol || '¥'} {formData.currency || 'CNY'})</span>
                  </label>
                  <input
                    type="number"
                    value={formData.maxPrice || ''}
                    onChange={(e) => setFormData({ ...formData, maxPrice: e.target.value ? Number(e.target.value) : undefined })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="最高价"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 目标人群 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              目标人群
            </label>
            <input
              type="text"
              value={formData.targetAudience || ''}
              onChange={(e) => setFormData({ ...formData, targetAudience: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="描述目标人群特征,如:25-45岁女性,关注护肤"
            />
          </div>

          {/* 品牌定位（无品牌/小型/中型/大型，可在待办中确认） */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">品牌定位</label>
            <select
              value={formData.brandPositioning || '小型品牌'}
              onChange={(e) => setFormData({ ...formData, brandPositioning: e.target.value })}
              className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="无品牌">无品牌</option>
              <option value="小型品牌">小型品牌</option>
              <option value="中型品牌">中型品牌</option>
              <option value="大型品牌">大型品牌</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">创建后可在「待处理任务」中确认或调整品牌定位</p>
            <p className="text-xs text-blue-600 mt-1">品牌影响力策略将在「待处理任务」中生成，请在待办中完成</p>
          </div>
        </div>

        <div className="flex gap-3 mt-6 pt-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={createStore.isPending}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {createStore.isPending ? '创建中...' : '创建店铺'}
          </button>
        </div>
      </div>
    </div>
  )
}
