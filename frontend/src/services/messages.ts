import api from './api'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export type MessageType = 'feedback_reply' | 'system' | 'version'

export interface InAppMessage {
  id: string
  userId: string | null
  type: MessageType
  title: string
  content: string
  linkUrl: string | null
  readAt: string | null
  createdAt: string
  extra: string | null
}

export async function fetchMessages(type?: string, limit = 50, offset = 0): Promise<InAppMessage[]> {
  const params = new URLSearchParams()
  if (type && type !== 'all') params.set('type', type)
  params.set('limit', String(limit))
  params.set('offset', String(offset))
  const data = await api.get<InAppMessage[]>(`/messages?${params.toString()}`)
  return Array.isArray(data) ? data : []
}

export async function fetchUnreadCount(): Promise<number> {
  const data = await api.get<{ count: number }>('/messages/unread-count') as unknown as { count: number } | undefined
  return typeof data?.count === 'number' ? data.count : 0
}

export async function markMessageRead(id: string): Promise<void> {
  await api.patch(`/messages/${id}/read`)
}

export async function markAllMessagesRead(): Promise<void> {
  await api.post('/messages/read-all')
}

export function useMessages(type?: string) {
  return useQuery({
    queryKey: ['messages', type],
    queryFn: () => fetchMessages(type),
  })
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ['messages', 'unread-count'],
    queryFn: fetchUnreadCount,
  })
}

export function useMarkMessageRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: markMessageRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages'] })
    },
  })
}

export function useMarkAllMessagesRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: markAllMessagesRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages'] })
    },
  })
}
