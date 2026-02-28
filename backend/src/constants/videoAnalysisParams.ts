/**
 * 视频分析 API 入参标准化
 * 参考：视频分析API集成指南（LLM 入参文档）
 */

/** 平台参数（platform）- 小写代码 */
export const VIDEO_PLATFORMS = [
  { code: 'tiktok', name: 'TikTok' },
  { code: 'douyin', name: '抖音' },
  { code: 'youtube', name: 'YouTube' },
  { code: 'instagram', name: 'Instagram' },
  { code: 'facebook', name: 'Facebook' },
  { code: 'twitter', name: 'Twitter' },
  { code: 'other', name: '其他' },
] as const

export type VideoPlatformCode = (typeof VIDEO_PLATFORMS)[number]['code']

export const VIDEO_PLATFORM_CODES: VideoPlatformCode[] = VIDEO_PLATFORMS.map((p) => p.code)

export function isValidPlatform(v: unknown): v is VideoPlatformCode {
  return typeof v === 'string' && VIDEO_PLATFORM_CODES.includes(v.toLowerCase() as VideoPlatformCode)
}

export function normalizePlatform(v: string | undefined): VideoPlatformCode {
  const lower = (v || '').trim().toLowerCase()
  return VIDEO_PLATFORM_CODES.includes(lower as VideoPlatformCode) ? (lower as VideoPlatformCode) : 'tiktok'
}

/** 地区参数（country）- 小写代码 */
export const VIDEO_COUNTRIES = [
  { code: 'us', name: '美国', nameEn: 'United States' },
  { code: 'cn', name: '中国', nameEn: 'China' },
  { code: 'uk', name: '英国', nameEn: 'United Kingdom' },
  { code: 'jp', name: '日本', nameEn: 'Japan' },
  { code: 'kr', name: '韩国', nameEn: 'South Korea' },
  { code: 'de', name: '德国', nameEn: 'Germany' },
  { code: 'fr', name: '法国', nameEn: 'France' },
  { code: 'br', name: '巴西', nameEn: 'Brazil' },
  { code: 'id', name: '印度尼西亚', nameEn: 'Indonesia' },
  { code: 'th', name: '泰国', nameEn: 'Thailand' },
  { code: 'vn', name: '越南', nameEn: 'Vietnam' },
  { code: 'other', name: '其他', nameEn: 'Other' },
] as const

export type VideoCountryCode = (typeof VIDEO_COUNTRIES)[number]['code']

export const VIDEO_COUNTRY_CODES: VideoCountryCode[] = VIDEO_COUNTRIES.map((c) => c.code)

export function isValidCountry(v: unknown): v is VideoCountryCode {
  return typeof v === 'string' && VIDEO_COUNTRY_CODES.includes(v.toLowerCase() as VideoCountryCode)
}

export function normalizeCountry(v: string | undefined): VideoCountryCode {
  const lower = (v || '').trim().toLowerCase()
  return VIDEO_COUNTRY_CODES.includes(lower as VideoCountryCode) ? (lower as VideoCountryCode) : 'cn'
}

/** 视频类型参数（video_type） */
export const VIDEO_TYPES = [
  { code: 'live_stream', name: '直播流' },
  { code: 'recorded', name: '录制视频' },
  { code: 'short', name: '短视频 (< 60秒)' },
  { code: 'long', name: '长视频 (> 5分钟)' },
  { code: 'replay', name: '回放' },
] as const

export type VideoTypeCode = (typeof VIDEO_TYPES)[number]['code']

export const VIDEO_TYPE_CODES: VideoTypeCode[] = VIDEO_TYPES.map((t) => t.code)

export function isValidVideoType(v: unknown): v is VideoTypeCode {
  return typeof v === 'string' && VIDEO_TYPE_CODES.includes(v.toLowerCase() as VideoTypeCode)
}

export function normalizeVideoType(v: string | undefined): VideoTypeCode | undefined {
  const lower = (v || '').trim().toLowerCase()
  return VIDEO_TYPE_CODES.includes(lower as VideoTypeCode) ? (lower as VideoTypeCode) : undefined
}

/** 标准化入参 */
export interface VideoAnalysisInputParams {
  platform: VideoPlatformCode
  country: VideoCountryCode
  videoType?: VideoTypeCode
  analysisFocus?: string
}

export function normalizeVideoAnalysisParams(body: {
  platform?: string
  country?: string
  videoType?: string
  analysisFocus?: string
}): VideoAnalysisInputParams {
  return {
    platform: normalizePlatform(body.platform),
    country: normalizeCountry(body.country),
    videoType: normalizeVideoType(body.videoType),
    analysisFocus: typeof body.analysisFocus === 'string' ? body.analysisFocus.trim() || undefined : undefined,
  }
}
