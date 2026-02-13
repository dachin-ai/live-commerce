import api from './api'
import { useQuery } from '@tanstack/react-query'

export interface CurrencyInfo {
  currency: string
  symbol: string
  code: string
  /** 接口返回的国家名，用于前端校验是否与当前选择一致 */
  country?: string
}

export interface CountryOption {
  id: string
  name: string
}

/** 国家列表（默认中国） */
export const useCountries = () => {
  return useQuery<CountryOption[]>({
    queryKey: ['regions', 'countries'],
    queryFn: async () => {
      return await api.get('/regions/countries')
    },
  })
}

/** 区域列表（按国家筛选，未传则默认中国，保证不会出现他国城市） */
export const useRegions = (country?: string) => {
  const effectiveCountry = country && country.trim() ? country.trim() : '中国'
  return useQuery<string[]>({
    queryKey: ['regions', effectiveCountry],
    queryFn: async () => {
      return await api.get('/regions', { params: { country: effectiveCountry } })
    },
  })
}

export const useCurrencyByRegion = (region?: string) => {
  return useQuery<CurrencyInfo>({
    queryKey: ['currency', region],
    queryFn: async () => {
      if (!region) throw new Error('Region is required')
      return await api.get('/regions/currency', { params: { region } })
    },
    enabled: !!region,
  })
}
