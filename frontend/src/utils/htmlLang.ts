import type { Locale } from '../contexts/LanguageContext'

/**
 * 用于 <html lang> / <input lang> 等原生控件的语言。
 * 目的：尽量影响浏览器原生 date/month 选择器的 UI 语言（不同浏览器支持程度不同）。
 */
export function htmlLangFromLocale(locale: Locale | string | undefined): string {
  const l = (locale || '').toLowerCase()
  if (l.startsWith('zh')) return 'zh-CN'
  if (l.startsWith('en')) return 'en'
  if (l.startsWith('th')) return 'th'
  if (l.startsWith('id')) return 'id'
  return 'en'
}

