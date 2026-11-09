/** El chat del asistente sin React: la forma de los mensajes, dónde se
 *  guardan (sessionStorage) y qué se dice de cada error. */
import type {
  ConsultaDelAsistente,
  Propuesta,
  RespuestaAsistente,
} from '@/api/asistente'
import { describirError, esApiError } from '@/api/client'
import type { Enlace } from '@/lib/asistente'
import { formatearEspera, segundosDeEspera } from '@/modulos/ventas/borradores'

/** pendiente → confirmando → confirmada; o descartada. Si falla queda
 *  fallida y se puede reintentar (con la misma Idempotency-Key). */
export type EstadoDePropuesta =
  'pendiente' | 'confirmando' | 'confirmada' | 'descartada' | 'fallida'

/** Lo que se muestra de un error al confirmar. El código va solo cuando el
 *  error no es uno esperable (409 o 422), para buscarlo en los logs. */
export type ErrorDePropuesta = { mensaje: string; codigo?: string }

export type PropuestaEnChat = {
  propuesta: Propuesta
  estado: EstadoDePropuesta
  enlace?: Enlace | null
  error?: ErrorDePropuesta | null
}

export type MensajeDelUsuario = { id: string; rol: 'usuario'; texto: string }
export type MensajeDelAsistente = {
  id: string
  rol: 'asistente'
  texto: string
  consultas: ConsultaDelAsistente[]
  propuestas: PropuestaEnChat[]
}
export type MensajeDelChat = MensajeDelUsuario | MensajeDelAsistente

export const mensajeDelUsuario = (texto: string): MensajeDelUsuario => ({
  id: crypto.randomUUID(),
  rol: 'usuario',
  texto,
})

export const mensajeDelAsistente = (
  r: RespuestaAsistente,
): MensajeDelAsistente => ({
  id: crypto.randomUUID(),
  rol: 'asistente',
  texto: r.texto,
  consultas: r.consultas,
  propuestas: r.propuestas.map((propuesta) => ({
    propuesta,
    estado: 'pendiente',
  })),
})

/** Cambia una propuesta (por id) sin tocar el resto del historial. */
export function conPropuesta(
  historial: readonly MensajeDelChat[],
  id: string,
  cambio: Partial<Omit<PropuestaEnChat, 'propuesta'>>,
): MensajeDelChat[] {
  return historial.map((m) =>
    m.rol === 'asistente' && m.propuestas.some((p) => p.propuesta.id === id)
      ? {
          ...m,
          propuestas: m.propuestas.map((p) =>
            p.propuesta.id === id ? { ...p, ...cambio } : p,
          ),
        }
      : m,
  )
}

export function buscarPropuesta(
  historial: readonly MensajeDelChat[],
  id: string,
): PropuestaEnChat | undefined {
  for (const m of historial) {
    if (m.rol !== 'asistente') continue
    const encontrada = m.propuestas.find((p) => p.propuesta.id === id)
    if (encontrada) return encontrada
  }
  return undefined
}

/** Una conversación por usuario y criadero en la pestaña: otro usuario que
 *  entra en la misma pestaña no ve la anterior. */
export const claveDelHistorial = (email: string, tenantId: string) =>
  `malka.asistente.v1:${tenantId}:${email}`

const esMensaje = (valor: unknown): valor is MensajeDelChat => {
  if (typeof valor !== 'object' || valor === null) return false
  const m = valor as Record<string, unknown>
  if (typeof m.id !== 'string' || typeof m.texto !== 'string') return false
  if (m.rol === 'usuario') return true
  return (
    m.rol === 'asistente' &&
    Array.isArray(m.consultas) &&
    Array.isArray(m.propuestas)
  )
}

/** Una propuesta que quedó "confirmando" (se recargó la página en medio)
 *  vuelve a pendiente: reintentarla usa la misma Idempotency-Key, así que
 *  si ya se había guardado no se duplica. */
const alRestaurar = (m: MensajeDelChat): MensajeDelChat =>
  m.rol === 'asistente'
    ? {
        ...m,
        propuestas: m.propuestas.map((p) =>
          p.estado === 'confirmando' ? { ...p, estado: 'pendiente' } : p,
        ),
      }
    : m

/** sessionStorage puede no existir o tirar (modo privado, cuota): sin él,
 *  la conversación vive solo en memoria. */
export function leerHistorial(clave: string): MensajeDelChat[] {
  try {
    const guardado = sessionStorage.getItem(clave)
    if (!guardado) return []
    const datos: unknown = JSON.parse(guardado)
    return Array.isArray(datos) && datos.every(esMensaje)
      ? datos.map(alRestaurar)
      : []
  } catch {
    return []
  }
}

export function guardarHistorial(
  clave: string,
  historial: readonly MensajeDelChat[],
): void {
  try {
    if (historial.length === 0) sessionStorage.removeItem(clave)
    else sessionStorage.setItem(clave, JSON.stringify(historial))
  } catch {
    // Sin almacenamiento: la conversación sigue en memoria.
  }
}

export type ErrorDelChat = { mensaje: string; reintentable: boolean }

/** Lo que se dice cuando el asistente no pudo responder. */
export function errorAlConversar(error: unknown): ErrorDelChat {
  const espera = segundosDeEspera(error)
  if (espera !== null) {
    const diario = esApiError(error) && error.codigo === 'limite_ia_diario'
    return {
      mensaje: `Llegaste al límite ${diario ? 'diario ' : ''}de consultas, probá en ${formatearEspera(espera)}.`,
      reintentable: false,
    }
  }
  if (esApiError(error)) {
    if (error.status === 503)
      return {
        mensaje:
          'El asistente no está disponible ahora. Probá de nuevo en unos minutos.',
        reintentable: true,
      }
    // Sin conexión, tiempo agotado o un 5xx: reintentar puede servir.
    if (error.status === null || error.status >= 500)
      return { mensaje: error.mensaje, reintentable: true }
    return { mensaje: error.mensaje, reintentable: false }
  }
  return { mensaje: describirError(error).mensaje, reintentable: true }
}

/** Lo que se dice cuando una propuesta no se pudo guardar. */
export function errorAlConfirmar(error: unknown): ErrorDePropuesta {
  const { mensaje, codigo } = describirError(error)
  const esperable =
    esApiError(error) && (error.status === 409 || error.status === 422)
  return esperable || !codigo ? { mensaje } : { mensaje, codigo }
}
