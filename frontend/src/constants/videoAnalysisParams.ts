/**
 * 视频分析 API 入参选项（与后端 videoAnalysisParams 保持一致）
 * 参考：视频分析API集成指南（LLM 入参文档）
 */

export const VIDEO_PLATFORMS = [
  { code: 'tiktok', name: 'TikTok' },
  { code: 'douyin', name: '抖音' },
  { code: 'youtube', name: 'YouTube' },
  { code: 'instagram', name: 'Instagram' },
  { code: 'facebook', name: 'Facebook' },
  { code: 'twitter', name: 'Twitter' },
  { code: 'other', name: '其他' },
] as const

export const VIDEO_COUNTRIES = [
  { code: 'us', name: '美国' },
  { code: 'cn', name: '中国' },
  { code: 'uk', name: '英国' },
  { code: 'jp', name: '日本' },
  { code: 'kr', name: '韩国' },
  { code: 'de', name: '德国' },
  { code: 'fr', name: '法国' },
  { code: 'br', name: '巴西' },
  { code: 'id', name: '印度尼西亚' },
  { code: 'th', name: '泰国' },
  { code: 'vn', name: '越南' },
  { code: 'other', name: '其他' },
] as const

export const VIDEO_TYPES = [
  { code: '', name: '自动识别' },
  { code: 'live_stream', name: '直播流' },
  { code: 'recorded', name: '录制视频' },
  { code: 'short', name: '短视频 (< 60秒)' },
  { code: 'long', name: '长视频 (> 5分钟)' },
  { code: 'replay', name: '回放' },
] as const
