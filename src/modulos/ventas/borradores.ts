/** Lo que la pantalla dice de un borrador con IA (#16), sin React. */
import { esApiError } from '@/api/client'
import { segundosHastaMedianocheEnArgentina } from '@/lib/fechas'
import type { EstadoBorrador, MotivoRechazo } from '@/tipos/dominio'

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
