/** Lo que la pantalla dice de un borrador con IA (#16), sin React. */
import { esApiError } from '@/api/client'
import { segundosHastaMedianocheEnArgentina } from '@/lib/fechas'
import { formatearImporte } from '@/lib/importes'
import type {
  ContenidoDeBorrador,
  EstadoBorrador,
  MotivoRechazo,
  Pedido,
} from '@/tipos/dominio'

export const CLAVE_BORRADORES = 'borradores'

export const claveDeBorrador = (id: string) =>
  [CLAVE_BORRADORES, 'detalle', id] as const

/** Cada cuánto se consulta un borrador en generando, y hasta cuántas veces
 *  seguidas (2 minutos): el worker tarda segundos; si pasa el tope, se
 *  ofrece seguir esperando en lugar de consultar para siempre. */
export const CONSULTA_CADA_MS = 2000
export const TOPE_DE_CONSULTAS = 60

export const NOMBRE_DE_ESTADO_BORRADOR: Record<EstadoBorrador, string> = {
  generando: 'Redactando',
  borrador: 'Para revisar',
  rechazado: 'No se pudo generar',
}

/** El motivo del rechazo en lenguaje de quien usa la pantalla. */
export const EXPLICACION_DE_RECHAZO: Record<MotivoRechazo, string> = {
  salida_invalida:
    'La IA devolvió un texto que no pasó los controles (por ejemplo, incluía montos o datos fiscales), así que se descartó.',
  error_modelo:
    'El servicio de IA no respondió bien en ese momento. Suele ser pasajero.',
  cola_no_disponible:
    'No se pudo mandar el pedido a redactar: el servicio estaba ocupado o caído.',
}

/** Los segundos que hay que esperar después de un 429 del límite de IA, o
 *  null si el error no es ese. Sin Retry-After legible (el header puede no
 *  llegar al navegador), se usa lo que el backend manda en cada caso: un
 *  minuto, o hasta la medianoche. */
export function segundosDeEspera(
  error: unknown,
  ahora: Date = new Date(),
): number | null {
  if (!esApiError(error) || error.status !== 429) return null
  if (error.reintentarEn !== null) return Math.max(1, error.reintentarEn)
  return error.codigo === 'limite_ia_diario'
    ? segundosHastaMedianocheEnArgentina(ahora)
    : 60
}

/** "45 segundos", "3 minutos", "5 h 12 min". */
export function formatearEspera(segundos: number): string {
  if (segundos <= 90)
    return segundos === 1 ? '1 segundo' : `${segundos} segundos`
  const minutos = Math.ceil(segundos / 60)
  if (minutos < 60) return `${minutos} minutos`
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  return resto ? `${horas} h ${resto} min` : `${horas} h`
}

/** Los largos máximos del esquema del backend (BorradorValidado). */
export const LARGO_MAXIMO = {
  encabezado: 200,
  cuerpo: 6000,
  notas: 1000,
} as const

/** Un pedazo del cuerpo: el título de una sección (una línea sola en
 *  mayúsculas, como PARTES u OBJETO) o un párrafo con sus saltos de línea. */
export type BloqueDelCuerpo = { tipo: 'titulo' | 'parrafo'; texto: string }

const esTitulo = (bloque: string) =>
  !bloque.includes('\n') &&
  /\p{L}/u.test(bloque) &&
  bloque === bloque.toLocaleUpperCase('es-AR')

/** El cuerpo en párrafos (separados por una línea en blanco). */
export function bloquesDelCuerpo(cuerpo: string): BloqueDelCuerpo[] {
  return cuerpo
    .replace(/\r\n/g, '\n')
    .split(/\n[ \t]*\n/)
    .map((bloque) => bloque.trim())
    .filter((bloque) => bloque !== '')
    .map((texto) => ({ tipo: esTitulo(texto) ? 'titulo' : 'parrafo', texto }))
}

export const TITULO_DEL_DETALLE =
  'Detalle del pedido (calculado por el sistema)'

/** El detalle que acompaña al texto, con nombres en lugar de ids. Los
 *  importes son los que manda el backend: el front no los calcula. */
export type DetalleDelDocumento = {
  moneda: string
  lineas: {
    cantidad: number
    item: string
    raza: string
    precio_unitario: string
    neto: string
  }[]
  neto: string
  iva: string
  total: string
}

/** El pedido del que sale el documento, con los nombres de su catálogo. */
export type PedidoDelDocumento = {
  pedido: Pedido
  nombreDeItem: (id: string) => string
  nombreDeRaza: (id: string) => string
}

export type FilaDelDetalle = DetalleDelDocumento['lineas'][number] & {
  id: string
}

/** El detalle con nombres, en el orden en que se cargaron las líneas. */
export function detalleDelPedido({
  pedido,
  nombreDeItem,
  nombreDeRaza,
}: PedidoDelDocumento): DetalleDelDocumento & { lineas: FilaDelDetalle[] } {
  return {
    moneda: pedido.moneda,
    lineas: [...pedido.items]
      .sort((a, b) => a.numero_linea - b.numero_linea)
      .map((l) => ({
        id: l.id,
        cantidad: l.cantidad,
        item: nombreDeItem(l.item_vendible_id),
        raza: nombreDeRaza(l.raza_id),
        precio_unitario: l.precio_unitario,
        neto: l.neto,
      })),
    neto: pedido.neto,
    iva: pedido.iva,
    total: pedido.total,
  }
}

/** Todo el documento como texto plano, para pegarlo en otro lado: el
 *  texto de la IA y, aparte, el detalle calculado por el sistema. */
export function textoParaCopiar(
  contenido: ContenidoDeBorrador,
  detalle: DetalleDelDocumento,
): string {
  const importe = (valor: string) =>
    `${detalle.moneda} ${formatearImporte(valor)}`
  const partes = [
    contenido.encabezado,
    contenido.cuerpo.trim(),
    [
      TITULO_DEL_DETALLE,
      ...detalle.lineas.map(
        (l) =>
          `- ${l.cantidad} × ${l.item}, raza ${l.raza}: precio unitario ${importe(l.precio_unitario)}, neto ${importe(l.neto)}`,
      ),
      `Neto: ${importe(detalle.neto)}`,
      `IVA: ${importe(detalle.iva)}`,
      `Total: ${importe(detalle.total)}`,
    ].join('\n'),
  ]
  if (contenido.notas.trim()) partes.push(`Notas\n${contenido.notas.trim()}`)
  return partes.join('\n\n')
}
