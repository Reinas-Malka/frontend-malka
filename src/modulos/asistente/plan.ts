/** Planes de varios pasos sin React: en qué orden se ejecutan, qué paso se
 *  puede confirmar, de dónde salen los ids de los marcadores y qué se le
 *  cuenta al asistente cuando el plan termina. */
import { MAX_CARACTERES, tituloDeAccion } from '@/lib/asistente'
import type {
  MensajeDelAsistente,
  PropuestaEnChat,
} from '@/modulos/asistente/conversacion'

/** Varias propuestas en una respuesta = un plan. */
export const esPlan = (mensaje: MensajeDelAsistente) =>
  mensaje.propuestas.length > 1

/** Los pasos en el orden en que se ejecutan. */
export const pasosDelPlan = (
  propuestas: readonly PropuestaEnChat[],
): PropuestaEnChat[] =>
  [...propuestas].sort((a, b) => a.propuesta.paso - b.propuesta.paso)

const abierto = (p: PropuestaEnChat) =>
  p.estado === 'pendiente' || p.estado === 'fallida'

/** Queda algo por hacer (o reintentar). */
export const planAbierto = (propuestas: readonly PropuestaEnChat[]) =>
  propuestas.some((p) => abierto(p) || p.estado === 'confirmando')

/** El id que creó cada paso confirmado: con eso se reemplazan los
 *  marcadores de los pasos que dependen de él. */
export function idsCreados(
  propuestas: readonly PropuestaEnChat[],
): Record<string, string> {
  return Object.fromEntries(
    propuestas
      .filter((p) => p.estado === 'confirmada' && p.idCreado)
      .map((p) => [p.propuesta.id, p.idCreado as string]),
  )
}

/** Por qué un paso todavía no se puede confirmar, o null. Los pasos van en
 *  orden: antes tienen que estar confirmados todos los anteriores. */
export function bloqueoDelPaso(
  propuestas: readonly PropuestaEnChat[],
  id: string,
): string | null {
  const pasos = pasosDelPlan(propuestas)
  const indice = pasos.findIndex((p) => p.propuesta.id === id)
  if (indice <= 0) return null
  const pendiente = pasos
    .slice(0, indice)
    .find((p) => p.estado !== 'confirmada')
  return pendiente
    ? `Primero confirmá el paso ${pendiente.propuesta.paso}.`
    : null
}

/** El próximo paso que hay que ejecutar (el primero sin confirmar). */
export const proximoPaso = (propuestas: readonly PropuestaEnChat[]) =>
  pasosDelPlan(propuestas).find((p) => p.estado !== 'confirmada')

/** Cómo terminó cada paso, en una línea. */
function lineaDelPaso(p: PropuestaEnChat, fallo: boolean): string {
  const encabezado = `Paso ${p.propuesta.paso} (${p.propuesta.accion})`
  if (p.estado === 'confirmada' || p.estado === 'fallida')
    return `${encabezado}: ${p.detalle ?? p.estado}`
  if (p.estado === 'descartada') return `${encabezado}: descartado`
  return fallo
    ? `${encabezado}: no se ejecutó (se frenó en el paso que falló)`
    : `${encabezado}: sin confirmar`
}

/** El único mensaje "resultado" de un plan: el detalle de cada paso (ids
 *  creados o el error). */
export function textoDelPlan(propuestas: readonly PropuestaEnChat[]): string {
  const pasos = pasosDelPlan(propuestas)
  const fallo = pasos.some((p) => p.estado === 'fallida')
  const todos = pasos.every((p) => p.estado === 'descartada')
  const encabezado = todos
    ? `El usuario descartó el plan de ${pasos.length} pasos.`
    : `Plan de ${pasos.length} pasos:`
  const lineas = todos ? [] : pasos.map((p) => lineaDelPaso(p, fallo))
  return [encabezado, ...lineas].join('\n').slice(0, MAX_CARACTERES)
}

/** Qué se hizo y qué falló, para la tarjeta del plan. */
export function estadoDelPlan(propuestas: readonly PropuestaEnChat[]): string {
  const pasos = pasosDelPlan(propuestas)
  const hechos = pasos.filter((p) => p.estado === 'confirmada')
  const fallido = pasos.find((p) => p.estado === 'fallida')
  if (fallido) {
    const numeros = hechos.map((p) => p.propuesta.paso).join(', ')
    const antes =
      hechos.length === 0
        ? ''
        : `Se ${hechos.length === 1 ? 'hizo el paso' : 'hicieron los pasos'} ${numeros}. `
    const motivo = (fallido.error?.mensaje ?? 'error').replace(/\.$/, '')
    return `${antes}Falló el paso ${fallido.propuesta.paso} (${tituloDeAccion(fallido.propuesta.accion)}): ${motivo}. Los siguientes no se ejecutaron.`
  }
  if (pasos.every((p) => p.estado === 'confirmada'))
    return 'Listo: se confirmaron todos los pasos.'
  if (pasos.every((p) => p.estado === 'descartada'))
    return 'Descartaste el plan: no se guardó nada.'
  return hechos.length > 0
    ? `Confirmados ${hechos.length} de ${pasos.length} pasos.`
    : ''
}
