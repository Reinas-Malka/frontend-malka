/** Ventas: lo común a las pantallas de pedidos (backend #34 y #36). Las
 *  reglas que copian al backend están en lib/pedidos.ts; acá va lo de las
 *  pantallas: roles, claves de consulta, filtros y textos. */
import type { FiltrosDePedidos } from '@/api/pedidos'
import { clientes } from '@/api/recursos'
import type { Rol } from '@/auth/identidad'
import {
  ESTADOS_PEDIDO,
  type Cliente,
  type EstadoPedido,
  type Pedido,
} from '@/tipos/dominio'

/** Los mismos que SOLO_ESCRITURA de app/routers/pedidos.py. Leer, todos. */
export const ROLES_VENTAS: readonly Rol[] = ['admin', 'ventas']

export const CLAVE_PEDIDOS = 'pedidos'

/** Bajo 'clientes': lo que invalida el catálogo de clientes también lo
 *  refresca. */
export const CLAVE_CLIENTES_CON_BAJAS = ['clientes', 'con-bajas'] as const

/** Todos los clientes, también los dados de baja: un pedido viejo puede ser
 *  de un cliente que ya no está activo y tiene que seguir mostrando su
 *  nombre. El backend los excluye si no se pide ?incluir_inactivos=true. */
export async function clientesConBajas(): Promise<Cliente[]> {
  const todos: Cliente[] = []
  let cursor: string | undefined
  do {
    const pagina = await clientes.listar({
      limite: 100,
      cursor,
      filtros: { incluir_inactivos: 'true' },
    })
    todos.push(...pagina.items)
    cursor = pagina.siguiente ?? undefined
  } while (cursor)
  return todos.sort((a, b) => a.nombre.localeCompare(b.nombre))
}

/** El valor de "todos" en los filtros: el Select de Radix no acepta ''. */
export const TODOS = 'todos'

const esEstado = (valor: string | null): valor is EstadoPedido =>
  ESTADOS_PEDIDO.some((e) => e === valor)

/** Los filtros del listado viven en la URL (?estado=&cliente=): sobreviven
 *  a ir al detalle y volver, y se pueden compartir. Un valor que no es un
 *  estado se ignora en lugar de mandarlo y recibir un 422. */
export function leerFiltros(params: URLSearchParams): FiltrosDePedidos {
  const estado = params.get('estado')
  const cliente = params.get('cliente')
  return {
    estado: esEstado(estado) ? estado : undefined,
    cliente_id: cliente || undefined,
  }
}

const plural = (n: number, palabra: string) =>
  `${n} ${palabra}${n === 1 ? '' : 's'}`

/** "2 líneas · 32 reinas": el tamaño del pedido, sin importes. */
export function resumenDeLineas(pedido: Pedido): string {
  const reinas = pedido.items.reduce((total, l) => total + l.cantidad, 0)
  return `${plural(pedido.items.length, 'línea')} · ${plural(reinas, 'reina')}`
}
