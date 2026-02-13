import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Search, Check } from 'lucide-react'

export interface CountryOption {
  id: string
  name: string
  code?: string
  flag?: string
}

interface CountrySelectorProps {
  value: string
  onChange: (value: string) => void
  options: CountryOption[]
  defaultCountry?: string
  placeholder?: string
}

export default function CountrySelector({
  value,
  onChange,
  options,
  defaultCountry = '中国',
  placeholder = '选择国家',
}: CountrySelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selectedCountry = options.find(c => c.id === value) || options.find(c => c.id === defaultCountry)

  const filteredOptions = options.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.id.toLowerCase().includes(searchQuery.toLowerCase())
  )

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setSearchQuery('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-left flex items-center justify-between hover:border-gray-400 transition-colors"
      >
        <span className="text-gray-900">{selectedCountry?.name || placeholder}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-hidden">
          <div className="p-2 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索国家..."
                className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
          </div>
          <div className="overflow-y-auto max-h-48">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500 text-center">未找到匹配的国家</div>
            ) : (
              filteredOptions.map((country) => (
                <button
                  key={country.id}
                  type="button"
                  onClick={() => {
                    onChange(country.id)
                    setIsOpen(false)
                    setSearchQuery('')
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between text-sm transition-colors"
                >
                  <span className="text-gray-900">{country.name}</span>
                  {value === country.id && <Check className="w-4 h-4 text-blue-600" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
