import api from './api'

export type FeedbackType = 'problem' | 'feature' | 'other'
export type FeedbackStatus = 'pending' | 'read' | 'replied'

export interface FeedbackItem {
  id: string
  userId: string | null
  type: FeedbackType
  subject: string
  content: string
  contact: string | null
  status: FeedbackStatus
  createdAt: string
  updatedAt: string | null
  replyContent?: string | null
  replyAt?: string | null
  imageUrls?: string[] | null
  userName?: string
  userEmail?: string
}

export interface SubmitFeedbackParams {
  type: FeedbackType
  subject: string
  content: string
  contact?: string
  imageUrls?: string[]
}

export async function submitFeedback(params: SubmitFeedbackParams): Promise<{ id: string }> {
  // api 拦截器已返回 response.data，此处得到的就是后端 body（如 { id, message }）
  const res = await api.post<{ id: string; message?: string }>('/feedback', params) as unknown as { id: string; message?: string }
  return { id: res.id }
}

export async function fetchFeedbackList(category: string, status: string): Promise<FeedbackItem[]> {
  const params = new URLSearchParams()
  if (category && category !== 'all') params.set('category', category)
  if (status && status !== 'all') params.set('status', status)
  // api 拦截器已返回 response.data，故此处得到的就是数组
  const data = await api.get<FeedbackItem[]>(`/feedback?${params.toString()}`)
  return Array.isArray(data) ? data : []
}

export async function updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<void> {
  await api.patch(`/feedback/${id}`, { status })
}

/** 管理员回复反馈（会同时将状态设为已回复） */
export async function replyFeedback(id: string, replyContent: string): Promise<void> {
  await api.patch(`/feedback/${id}`, { replyContent })
}

/** 管理员删除反馈 */
export async function deleteFeedback(id: string): Promise<void> {
  await api.delete(`/feedback/${id}`)
}

/** 上传反馈图片，返回 url（用于提交时 imageUrls） */
export async function uploadFeedbackImage(file: File): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)
  const token = localStorage.getItem('token')
  const res = await fetch('/api/feedback/upload-image', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data?.error || '上传失败')
  }
  const data = await res.json()
  return data.url
}
