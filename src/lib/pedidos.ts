/** Reglas de los pedidos que el backend aplica en app/services/ventas/
 *  pedidos.py, transiciones.py y los schemas de #34 y #36. Acá adelantan
 *  el error en el formulario para no mandar pedidos que ya se sabe que
 *  fallan, y la API simulada las usa para comportarse como la real. El
 *  backend valida igual: si cambia una regla allá, se cambia acá. */
import { hoyEnArgentina } from '@/lib/fechas'
import { PAIS_LOCAL } from '@/lib/paises'
import type {
  Cliente,
  Despacho,
  EstadoPedido,
  Incoterm,
  Moneda,
} from '@/tipos/dominio'

/** Topes de app/schemas/pedidos.py y app/schemas/transiciones.py. */
export const MAX_LINEAS = 100
// pedido_item.cantidad es Integer de 4 bytes.
export const MAX_CANTIDAD = 2_147_483_647
export const MAX_BANCOS_POR_LINEA = 50

/** TRANSICIONES de transiciones.py: borrador → reservado → entregado |
 *  cancelado. Los finales van con la lista vacía. */
export const TRANSICIONES: Record<EstadoPedido, readonly EstadoPedido[]> = {
  borrador: ['reservado', 'cancelado'],
  reservado: ['entregado', 'cancelado'],
  entregado: [],
  cancelado: [],
}

export const puedePasar = (desde: EstadoPedido, hacia: EstadoPedido) =>
  TRANSICIONES[desde].includes(hacia)

/** ARS en ventas nacionales; USD o EUR en exportación. No hay otras. */
export const MONEDAS_POR_TIPO: Record<Cliente['tipo'], readonly Moneda[]> = {
  nacional: ['ARS'],
  exportacion: ['USD', 'EUR'],
}

/** validar_pedido del backend: el primer problema que encuentra, o null.
 *  Mismo orden de chequeos, así el mensaje coincide con el 422. */
export function errorDePedido(
  tipo: Cliente['tipo'],
  moneda: Moneda,
  destinoPais: string | null | undefined,
  incoterm: Incoterm | null | undefined,
): string | null {
  if (tipo === 'exportacion') {
    if (!destinoPais)
      return 'Un pedido de exportación necesita el país de destino.'
    if (!/^[A-Z]{2}$/.test(destinoPais))
      return 'El destino tiene que ser un código de país de 2 letras.'
    if (destinoPais === PAIS_LOCAL)
      return 'Un pedido de exportación no puede ir a Argentina.'
    if (!MONEDAS_POR_TIPO.exportacion.includes(moneda))
      return 'Un pedido de exportación va en USD o EUR.'
    return null
  }
  if (destinoPais) return 'Un pedido nacional no lleva país de destino.'
  if (incoterm) return 'Un pedido nacional no lleva incoterm.'
  if (moneda !== 'ARS') return 'Un pedido nacional va en ARS.'
  return null
}

/** Numeric(14, 2): hasta 12 enteros y 2 decimales, sin signo. */
const PRECIO = /^\d{1,12}(\.\d{1,2})?$/

/** El precio como lo espera el backend ("1500.50"), o null si no es válido.
 *  Con coma, la coma es el decimal y los puntos son de miles ("1.500,50");
 *  sin coma, el punto es el decimal ("1500.50"). Siempre texto: un float
 *  pierde centavos. */
export function normalizarPrecio(valor: string): string | null {
  const limpio = valor.trim().replace(/\s/g, '')
  const conPunto = limpio.includes(',')
    ? limpio.replace(/\./g, '').replace(',', '.')
    : limpio
  return PRECIO.test(conPunto) ? conPunto : null
}

export function errorDePrecio(valor: string): string | null {
  return normalizarPrecio(valor)
    ? null
    : 'El precio es un número de hasta 2 decimales (p. ej. 1500,50).'
}

/** Field(gt=0, le=MAX_CANTIDAD) de un int: solo dígitos, nada de 1,5 ni 1e3. */
export function errorDeCantidad(valor: string): string | null {
  const limpio = valor.trim()
  if (!/^\d+$/.test(limpio)) return 'La cantidad es un número entero.'
  const n = Number(limpio)
  if (n <= 0) return 'La cantidad tiene que ser mayor a 0.'
  if (n > MAX_CANTIDAD) return 'La cantidad es demasiado grande.'
  return null
}

/** validar_despacho del backend: el despacho cubre exactamente las
 *  reservas activas, línea por línea (sin entrega parcial). Las claves son
 *  pedido_item_id. El primer problema que encuentra, o null. */
export function errorDeDespacho(
  reservadas: ReadonlyMap<string, number>,
  despachadas: ReadonlyMap<string, number>,
): string | null {
  for (const linea of despachadas.keys())
    if (!reservadas.has(linea))
      return `La línea ${linea} no es de este pedido o no tiene reserva activa.`
  for (const linea of reservadas.keys())
    if (!despachadas.has(linea))
      return `La línea ${linea} tiene reserva activa pero no está en el despacho.`
  for (const [linea, cantidad] of despachadas)
    if (cantidad !== reservadas.get(linea))
      return `La línea ${linea} tiene ${cantidad} en el despacho pero ${reservadas.get(linea)} en la reserva.`
  return null
}

/** El schema Entregar del backend: el formato del despacho, sin mirar las
 *  reservas (eso es errorDeDespacho). El primer problema, o null. */
export function errorDeFormatoDeDespacho(
  despacho: Despacho,
  hoy: string = hoyEnArgentina(),
): string | null {
  const { lineas, fecha } = despacho
  if (lineas.length === 0) return 'El despacho necesita al menos una línea.'
  if (lineas.length > MAX_LINEAS)
    return `Un despacho tiene hasta ${MAX_LINEAS} líneas.`
  const items = lineas.map((l) => l.pedido_item_id)
  if (new Set(items).size !== items.length)
    return 'Una línea del pedido aparece dos veces.'
  for (const { bancos } of lineas) {
    if (bancos.length === 0) return 'Cada línea sale de al menos un banco.'
    if (bancos.length > MAX_BANCOS_POR_LINEA)
      return `Una línea sale de hasta ${MAX_BANCOS_POR_LINEA} bancos.`
    // null ("sin banco") también cuenta: va una sola vez por línea.
    const ids = bancos.map((b) => b.banco_id)
    if (new Set(ids).size !== ids.length)
      return 'Un banco aparece dos veces en la misma línea.'
    if (
      bancos.some(
        (b) =>
          !Number.isInteger(b.cantidad) ||
          b.cantidad <= 0 ||
          b.cantidad > MAX_CANTIDAD,
      )
    )
      return 'Cada banco despacha una cantidad entera mayor a 0.'
  }
  // Puede ser anterior a hoy (se carga tarde), nunca posterior.
  if (fecha && fecha > hoy) return 'La fecha del despacho no puede ser futura.'
  return null
}
