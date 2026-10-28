/** Ventas: lo común a las pantallas de pedidos (backend #34 y #36). Las
 *  reglas que copian al backend están en lib/pedidos.ts; acá va lo de las
 *  pantallas: roles, claves de consulta, filtros y textos. */
import { esApiError } from '@/api/client'
import type { FiltrosDePedidos } from '@/api/pedidos'
import type { Pagina, ParametrosDeListado } from '@/api/recurso'
import { clientes, itemsVendibles, razas } from '@/api/recursos'
import type { Rol } from '@/auth/identidad'
import {
  ESTADOS_PEDIDO,
  type Cliente,
  type EstadoPedido,
  type ItemVendible,
  type Pedido,
  type Raza,
} from '@/tipos/dominio'

/** Los mismos que SOLO_ESCRITURA de app/routers/pedidos.py. Leer, todos. */
export const ROLES_VENTAS: readonly Rol[] = ['admin', 'ventas']

export const CLAVE_PEDIDOS = 'pedidos'

/** Todas las filas de un catálogo, también las dadas de baja: un pedido
 *  viejo puede ser de un cliente, un ítem o una raza que ya no está activo
 *  y tiene que seguir mostrando su nombre. El backend los excluye si no se
 *  pide ?incluir_inactivos=true. */
async function conBajas<T>(recurso: {
  listar(parametros: ParametrosDeListado): Promise<Pagina<T>>
}): Promise<T[]> {
  const todos: T[] = []
  let cursor: string | undefined
  do {
    const pagina = await recurso.listar({
      limite: 100,
      cursor,
      filtros: { incluir_inactivos: 'true' },
    })
    todos.push(...pagina.items)
    cursor = pagina.siguiente ?? undefined
  } while (cursor)
  return todos
}

// Cada clave va bajo la del catálogo: lo que lo invalida también la refresca.
export const CLAVE_CLIENTES_CON_BAJAS = ['clientes', 'con-bajas'] as const
export const CLAVE_ITEMS_CON_BAJAS = ['items-vendibles', 'con-bajas'] as const
export const CLAVE_RAZAS_CON_BAJAS = ['razas', 'con-bajas'] as const

export async function clientesConBajas(): Promise<Cliente[]> {
  const todos = await conBajas(clientes)
  return todos.sort((a, b) => a.nombre.localeCompare(b.nombre))
}
export const itemsConBajas = (): Promise<ItemVendible[]> =>
  conBajas(itemsVendibles)
export const razasConBajas = (): Promise<Raza[]> => conBajas(razas)

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

// --- el detalle (PedidoPage) ---

/** Lo que el listado manda al abrir un pedido: sus filtros, para volver
 *  a la misma vista. */
export type DesdeElListado = { filtros?: string }

/** Una raza que no alcanzó al reservar: details.razas del 409
 *  stock_insuficiente (repositorio_reservas.py). */
export type FaltanteDeStock = {
  raza_id: string
  pedidas: number
  disponible: number
  faltan: number
}

/** Las razas que no alcanzan, si el error es un 409 stock_insuficiente;
 *  null si es cualquier otro. */
export function faltantesDeStock(error: unknown): FaltanteDeStock[] | null {
  if (!esApiError(error) || error.codigo !== 'stock_insuficiente') return null
  const razas = error.detalles.razas
  return Array.isArray(razas) ? (razas as FaltanteDeStock[]) : []
}
