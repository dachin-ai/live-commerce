import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
// 仅同步加载中文，en-US / th-TH 按需加载以减小首包
import zhCN from './locales/zh-CN.json'

const getInitialLanguage = (): string => {
  if (typeof window === 'undefined') return 'zh-CN'
  try {
    return localStorage.getItem('lvbcsym_locale') || 'zh-CN'
  } catch {
    return 'zh-CN'
  }
}

i18n
  .use(initReactI18next)
  .init({
    resources: { 'zh-CN': { translation: zhCN } },
    lng: getInitialLanguage(),
    fallbackLng: 'zh-CN',
    interpolation: {
      escapeValue: false,
    },
  })

const localeLoaders: Record<string, () => Promise<{ default: object }>> = {
  'en-US': () => import('./locales/en-US.json'),
  'th-TH': () => import('./locales/th-TH.json'),
}

/** 按需加载语言包，切换语言前调用 */
export async function loadLocale(lng: string): Promise<void> {
  if (i18n.hasResourceBundle(lng, 'translation')) return
  const loader = localeLoaders[lng]
  if (!loader) return
  const mod = await loader()
  i18n.addResourceBundle(lng, 'translation', mod.default)
}

export default i18n
