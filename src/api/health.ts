import { request } from '@/api/client'
import type { Health } from '@/types/health'

export function getHealth(): Promise<Health> {
  return request<Health>('/health')
}
