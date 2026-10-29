/** Disponibilidad de reinas por raza (backend #33). La usan el despacho
 *  del pedido (#12) y la pantalla de disponibilidad (#13).
 *
 *  Con datos simulados la calcula la misma simulación que los pedidos:
 *  reservar o entregar la cambia, como en el backend. */
import { request } from '@/api/client'
import { simulacion } from '@/api/pedidos'
import type { DisponibilidadReinas } from '@/tipos/dominio'

export interface ApiDisponibilidad {
  /** Una fila por raza; con razaId, solo esa. Es una lista, no una página. */
  listar(razaId?: string): Promise<DisponibilidadReinas[]>
}

export function disponibilidadHttp(): ApiDisponibilidad {
  return {
    listar: (razaId) =>
      request<DisponibilidadReinas[]>('/api/v1/disponibilidad', {
        query: { raza_id: razaId },
      }),
  }
}

export const disponibilidad: ApiDisponibilidad = simulacion
  ? { listar: simulacion.disponibilidad }
  : disponibilidadHttp()
