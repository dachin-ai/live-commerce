import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zhCN from './locales/zh-CN.json'
import enUS from './locales/en-US.json'
import thTH from './locales/th-TH.json'

const resources = {
  'zh-CN': { translation: zhCN },
  'en-US': { translation: enUS },
  'th-TH': { translation: thTH },
}

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
    resources,
    lng: getInitialLanguage(),
    fallbackLng: 'zh-CN',
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n
