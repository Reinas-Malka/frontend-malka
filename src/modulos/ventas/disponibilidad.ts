/** Disponibilidad de reinas por raza (#13, backend #33). Hay un solo stock,
 *  el de las celdas (ADR 0014): disponible = enjauladas − reservas activas.
 *  Va por raza, nunca por banco. */
import type { DisponibilidadReinas } from '@/tipos/dominio'

/** DataTable pide un id por fila: la raza es la clave natural. */
export type FilaDeDisponibilidad = DisponibilidadReinas & { id: string }

export const aFilas = (
  lista: readonly DisponibilidadReinas[],
): FilaDeDisponibilidad[] => lista.map((d) => ({ ...d, id: d.raza_id }))
