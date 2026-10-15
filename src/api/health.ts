import { request } from '@/api/client'
import type { components } from '@/api/esquema'
import type { Health } from '@/types/health'

export type Disponibilidad = components['schemas']['Disponibilidad']

export function getHealth(): Promise<Health> {
  return request<Health>('/health')
}

/** /health/ready: además de la API, prueba la base de datos (backend #23). */
export function getDisponibilidad(): Promise<Disponibilidad> {
  return request<Disponibilidad>('/health/ready')
}
