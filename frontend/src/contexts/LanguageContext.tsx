/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import i18n, { loadLocale } from '../i18n'
import { htmlLangFromLocale } from '../utils/htmlLang'

const STORAGE_KEY = 'lvbcsym_locale'

export type Locale = 'zh-CN' | 'en-US' | 'th-TH' | 'id-ID'

const DEFAULT_LOCALE: Locale = 'zh-CN'

const LOCALES: Locale[] = ['zh-CN', 'en-US', 'th-TH', 'id-ID']

function loadStoredLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && LOCALES.includes(stored as Locale)) return stored as Locale
  } catch {
    // ignore
  }
  return DEFAULT_LOCALE
}

/** 从 locale 推导国家/地区代码（与后端一致，供 LLM 入参） */
export function localeToCountryCode(locale: string | undefined): string {
  if (!locale) return 'CN'
  const u = (locale || '').toUpperCase()
  if (u.startsWith('ZH')) return 'CN'
  if (u.startsWith('EN')) return 'US'
  if (u.startsWith('TH')) return 'TH'
  if (u.startsWith('VI')) return 'VN'
  if (u.startsWith('ID')) return 'ID'
  if (u.startsWith('MY') || u.startsWith('MS')) return 'MY'
  if (u.startsWith('SG')) return 'SG'
  if (u.startsWith('PH')) return 'PH'
  return u.slice(0, 2) || 'CN'
}

interface LanguageContextType {
  locale: Locale
  setLocale: (locale: Locale) => void
  countryCode: string
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(loadStoredLocale)

  const setLocale = useCallback((next: Locale) => {
    loadLocale(next).then(() => {
      setLocaleState(next)
      i18n.changeLanguage(next)
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // ignore
      }
    })
  }, [])

  // 存储语言非 zh-CN 时，启动时按需加载
  useEffect(() => {
    const stored = loadStoredLocale()
    if (stored !== locale) setLocaleState(stored)
    if (stored !== 'zh-CN') loadLocale(stored).then(() => i18n.changeLanguage(stored))
  }, [locale])

  // 同步到 <html lang>，影响原生控件（date/month）与可访问性
  useEffect(() => {
    if (typeof document === 'undefined') return
    try {
      document.documentElement.lang = htmlLangFromLocale(locale)
    } catch {
      // ignore
    }
  }, [locale])

  const countryCode = localeToCountryCode(locale)

  return (
    <LanguageContext.Provider value={{ locale, setLocale, countryCode }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage(): LanguageContextType {
  const ctx = useContext(LanguageContext)
  if (!ctx) {
    return {
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
      countryCode: 'CN',
    }
  }
  return ctx
}

export { LOCALES, DEFAULT_LOCALE }
