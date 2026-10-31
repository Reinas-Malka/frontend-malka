/** Ventas: lo común a las pantallas de pedidos (backend #34 y #36). Las
 *  reglas que copian al backend están en lib/pedidos.ts; acá va lo de las
 *  pantallas: roles, claves de consulta, filtros, textos y el formulario
 *  de alta. */
import { esApiError } from '@/api/client'
import type { FiltrosDePedidos } from '@/api/pedidos'
import type { Pagina, ParametrosDeListado } from '@/api/recurso'
import { clientes, itemsVendibles, razas } from '@/api/recursos'
import type { Rol } from '@/auth/identidad'
import type { Errores } from '@/components/catalogo/campos'
import {
  MAX_LINEAS,
  MONEDAS_POR_TIPO,
  errorDeCantidad,
  errorDePedido,
  errorDePrecio,
  normalizarPrecio,
} from '@/lib/pedidos'
import {
  ESTADOS_PEDIDO,
  type Cliente,
  type DisponibilidadReinas,
  type EstadoPedido,
  type Incoterm,
  type ItemVendible,
  type Moneda,
  type Pedido,
  type PedidoCrear,
  type Raza,
} from '@/tipos/dominio'

/** Los mismos que SOLO_ESCRITURA de app/routers/pedidos.py. Leer, todos. */
export const ROLES_VENTAS: readonly Rol[] = ['admin', 'ventas']

export const CLAVE_PEDIDOS = 'pedidos'
/** Reservar, entregar y cancelar la cambian: se invalida con los pedidos. */
export const CLAVE_DISPONIBILIDAD = 'disponibilidad'

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

// --- el alta (FormularioDePedido) ---

/** La cabecera como la edita el formulario. '' es "sin elegir". */
export type CabeceraDePedido = {
  cliente_id: string
  fecha_entrega_solicitada: string
  moneda: Moneda
  destino_pais: string
  incoterm: Incoterm | ''
}

/** Una línea como la edita el formulario: cantidad y precio en texto, como
 *  en el <input>. Los nombres son los del backend, así un 422 de
 *  items.0.cantidad cae en su campo sin traducir nada. */
export type LineaDePedido = {
  /** Solo para la key de React: la línea no tiene id hasta el alta. */
  clave: string
  item_vendible_id: string
  raza_id: string
  cantidad: string
  precio_unitario: string
}

export type CampoDeLinea = Exclude<keyof LineaDePedido, 'clave'>

export const CABECERA_VACIA: CabeceraDePedido = {
  cliente_id: '',
  fecha_entrega_solicitada: '',
  moneda: 'ARS',
  destino_pais: '',
  incoterm: '',
}

export const lineaVacia = (): LineaDePedido => ({
  clave: crypto.randomUUID(),
  item_vendible_id: '',
  raza_id: '',
  cantidad: '',
  precio_unitario: '',
})

/** Dónde va el error de un campo de una línea: la misma ruta del 422 del
 *  backend, sin el "body." (items.0.cantidad). */
export const claveDeLinea = (n: number, campo: CampoDeLinea) =>
  `items.${n}.${campo}`

/** Al elegir el cliente, la cabecera toma lo que admite su tipo. El destino
 *  arranca en el país del cliente; en un envío consolidado se cambia por el
 *  del hub. */
export function cabeceraParaCliente(
  actual: CabeceraDePedido,
  cliente: Cliente,
): CabeceraDePedido {
  const monedas = MONEDAS_POR_TIPO[cliente.tipo]
  const exportacion = cliente.tipo === 'exportacion'
  return {
    ...actual,
    cliente_id: cliente.id,
    moneda: monedas.includes(actual.moneda) ? actual.moneda : monedas[0],
    destino_pais: exportacion ? cliente.pais : '',
    incoterm: exportacion ? actual.incoterm : '',
  }
}

/** Lo que el formulario puede marcar antes de mandar. La clave 'pedido' es
 *  un error de la combinación (errorDePedido): va arriba de los botones. */
export function validarAlta(
  cabecera: CabeceraDePedido,
  lineas: readonly LineaDePedido[],
  cliente: Cliente | undefined,
): Errores {
  const errores: Errores = {}
  if (!cliente) errores.cliente_id = 'Elegí el cliente.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cabecera.fecha_entrega_solicitada))
    errores.fecha_entrega_solicitada = 'Elegí la fecha de entrega.'
  if (cliente?.tipo === 'exportacion' && !cabecera.destino_pais) {
    errores.destino_pais = 'Elegí el país de destino.'
  } else if (cliente) {
    const incoherente = errorDePedido(
      cliente.tipo,
      cabecera.moneda,
      cabecera.destino_pais || null,
      cabecera.incoterm || null,
    )
    if (incoherente) errores.pedido = incoherente
  }

  if (lineas.length === 0) errores.items = 'El pedido necesita una línea.'
  if (lineas.length > MAX_LINEAS)
    errores.items = `Un pedido tiene hasta ${MAX_LINEAS} líneas.`
  lineas.forEach((linea, n) => {
    const deLinea: Partial<Record<CampoDeLinea, string | null>> = {
      item_vendible_id: linea.item_vendible_id ? null : 'Elegí el ítem.',
      raza_id: linea.raza_id ? null : 'Elegí la raza.',
      cantidad: errorDeCantidad(linea.cantidad),
      precio_unitario: errorDePrecio(linea.precio_unitario),
    }
    for (const [campo, error] of Object.entries(deLinea))
      if (error) errores[claveDeLinea(n, campo as CampoDeLinea)] = error
  })
  return errores
}

/** El cuerpo del POST. Solo después de validarAlta: el precio ya es válido. */
export function aPedidoCrear(
  cabecera: CabeceraDePedido,
  lineas: readonly LineaDePedido[],
): PedidoCrear {
  return {
    cliente_id: cabecera.cliente_id,
    fecha_entrega_solicitada: cabecera.fecha_entrega_solicitada,
    moneda: cabecera.moneda,
    destino_pais: cabecera.destino_pais || null,
    incoterm: cabecera.incoterm || null,
    items: lineas.map((l) => ({
      item_vendible_id: l.item_vendible_id,
      raza_id: l.raza_id,
      cantidad: Number(l.cantidad.trim()),
      // Texto, no número: un float pierde centavos.
      precio_unitario: normalizarPrecio(l.precio_unitario)!,
    })),
  }
}

const CAMPOS_DE_CABECERA: readonly string[] = [
  'cliente_id',
  'fecha_entrega_solicitada',
  'moneda',
  'destino_pais',
  'incoterm',
]
const RUTA_DE_LINEA =
  /^items\.(\d+)\.(item_vendible_id|raza_id|cantidad|precio_unitario)$/

/** Errores de negocio del alta que van en un campo de la cabecera. */
const CABECERA_POR_CODIGO: Partial<Record<string, string>> = {
  cliente_inexistente: 'cliente_id',
  cliente_inactivo: 'cliente_id',
}
/** Los que traen en details.ids los ítems o las razas que fallaron: el
 *  error va en cada línea que los usa. */
const LINEA_POR_CODIGO: Partial<Record<string, CampoDeLinea>> = {
  item_vendible_inexistente: 'item_vendible_id',
  raza_inexistente: 'raza_id',
}

/** Un error del POST repartido en los campos del formulario: el 422 de
 *  Pydantic por su ruta (body.items.0.cantidad) y los de negocio por su
 *  código. Solo devuelve lo que el formulario muestra; si queda vacío, el
 *  error va entero arriba de los botones. */
export function erroresDelAlta(
  error: unknown,
  lineas: readonly LineaDePedido[],
): Errores {
  if (!esApiError(error)) return {}
  const errores: Errores = {}

  const deCabecera = CABECERA_POR_CODIGO[error.codigo]
  if (deCabecera) errores[deCabecera] = error.mensaje
  const deLinea = LINEA_POR_CODIGO[error.codigo]
  const ids = error.detalles.ids
  if (deLinea && Array.isArray(ids))
    lineas.forEach((linea, n) => {
      if (ids.includes(linea[deLinea]))
        errores[claveDeLinea(n, deLinea)] = error.mensaje
    })

  const campos = error.detalles.campos
  if (Array.isArray(campos))
    for (const { campo, mensaje } of campos as {
      campo?: unknown
      mensaje?: unknown
    }[]) {
      const ruta = String(campo ?? '').replace(/^body\./, '')
      const linea = RUTA_DE_LINEA.exec(ruta)
      const seMuestra =
        CAMPOS_DE_CABECERA.includes(ruta) ||
        ruta === 'items' ||
        (linea !== null && Number(linea[1]) < lineas.length)
      if (seMuestra) errores[ruta] ??= String(mensaje ?? 'Valor inválido.')
    }
  return errores
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

/** Lo que se ve al lado de una línea de un borrador antes de reservar. */
export type DisponibleDeLinea = {
  /** El disponible de la raza de la línea (GET /disponibilidad). */
  disponible: number
  /** Lo que pide el pedido de esa raza, sumando todas sus líneas. */
  pedidas: number
  /** 0 si alcanza. */
  faltan: number
}

/** Por línea, el disponible de su raza y si alcanza. Las líneas de una
 *  misma raza compiten juntas, como en reservar del backend: dos líneas de
 *  Carniola de 10 no entran si hay 15, aunque cada una sola sí. */
export function disponiblePorLinea(
  pedido: Pedido,
  lista: readonly DisponibilidadReinas[],
): Map<string, DisponibleDeLinea> {
  const disponibles = new Map(lista.map((d) => [d.raza_id, d.disponible]))
  const pedidas = new Map<string, number>()
  for (const l of pedido.items)
    pedidas.set(l.raza_id, (pedidas.get(l.raza_id) ?? 0) + l.cantidad)
  return new Map(
    pedido.items.map((l) => {
      // Una raza que no viene en la lista no tiene reinas para vender.
      const disponible = disponibles.get(l.raza_id) ?? 0
      const deLaRaza = pedidas.get(l.raza_id)!
      return [
        l.id,
        {
          disponible,
          pedidas: deLaRaza,
          faltan: Math.max(deLaRaza - disponible, 0),
        },
      ]
    }),
  )
}

/** Las razas que no alcanzan, si el error es un 409 stock_insuficiente;
 *  null si es cualquier otro. */
export function faltantesDeStock(error: unknown): FaltanteDeStock[] | null {
  if (!esApiError(error) || error.codigo !== 'stock_insuficiente') return null
  const razas = error.detalles.razas
  return Array.isArray(razas) ? (razas as FaltanteDeStock[]) : []
}
