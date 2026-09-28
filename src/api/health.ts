import { request } from './client'
import type { Health } from '../types/health'

export function getHealth(): Promise<Health> {
  return request<Health>('/health')
}
