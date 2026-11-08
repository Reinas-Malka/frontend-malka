/** "Agregar núcleos" a un parque por cantidad (backend #155), sin React: la
 *  validación previa, los errores en lenguaje claro y el aviso del
 *  resultado. El usuario no elige fila ni posición: la fila nueva la pone
 *  el sistema. */
import { esApiError } from '@/api/client'
import { MAXIMO_UBICACION } from '@/api/nucleosDeParque'
import type { NucleosLoteCreados, Parque } from '@/tipos/dominio'

/** Cuántos núcleos activos más entran en el parque. */
export const lugarEn = (
  parque: Pick<Parque, 'capacidad_max' | 'nucleos_activos'>,
) => Math.max(0, parque.capacidad_max - parque.nucleos_activos)

const nucleos = (n: number) => `${n} ${n === 1 ? 'núcleo' : 'núcleos'}`

/** El error de la cantidad antes de mandarla, o null si está bien. */
export function errorDeCantidadDeNucleos(
  texto: string,
  parque: Pick<Parque, 'capacidad_max' | 'nucleos_activos'>,
): string | null {
  const limpio = texto.trim()
  if (!limpio) return 'Escribí cuántos núcleos agregar.'
  if (!/^\d+$/.test(limpio)) return 'La cantidad es un número entero.'
  const cantidad = Number(limpio)
  if (cantidad < 1) return 'Agregá al menos un núcleo.'
  if (cantidad > MAXIMO_UBICACION)
    return `De una vez se agregan hasta ${MAXIMO_UBICACION} núcleos.`
  const lugar = lugarEn(parque)
  if (cantidad > lugar)
    return lugar === 0
      ? 'El parque ya tiene todos los núcleos que admite.'
      : `En el parque entran ${nucleos(lugar)} más.`
  return null
}

/** Un error del backend en lenguaje claro, sin códigos. */
export function mensajeDeErrorDeNucleos(error: unknown): string {
  if (!esApiError(error)) return 'No se pudieron agregar los núcleos.'
  const d = error.detalles
  switch (error.codigo) {
    case 'capacidad_insuficiente': {
      const disponibles = Number(d.disponibles)
      const capacidad = Number(d.capacidad_max)
      return Number.isFinite(disponibles) && Number.isFinite(capacidad)
        ? `El parque admite ${nucleos(capacidad)} y ya tiene ${Number(d.nucleos_activos)}: entran ${nucleos(disponibles)} más.`
        : error.mensaje
    }
    case 'parque_inactivo':
      return 'El parque está dado de baja: reactivalo para agregarle núcleos.'
    case 'parque_no_encontrado':
      return 'El parque ya no existe. Recargá la pantalla.'
    case 'parque_sin_filas':
      return `El parque ya usa todas las filas (hasta la ${MAXIMO_UBICACION}): no hay una libre para los núcleos nuevos.`
    default:
      return error.mensaje
  }
}

/** "Se agregaron 20 núcleos a Parque Norte en la fila 4 (posiciones 1 a
 *  20). Ahora tiene 35 de 40." y, si quedó lleno, el aviso. */
export function resumenDeNucleosAgregados(
  creados: NucleosLoteCreados,
  parque: string,
): string {
  const posiciones =
    creados.posicion_desde === creados.posicion_hasta
      ? `posición ${creados.posicion_desde}`
      : `posiciones ${creados.posicion_desde} a ${creados.posicion_hasta}`
  const base = `Se ${creados.creados === 1 ? 'agregó' : 'agregaron'} ${nucleos(creados.creados)} a ${parque} en la fila ${creados.fila} (${posiciones}). Ahora tiene ${creados.nucleos_activos} de ${creados.capacidad_max}.`
  return creados.advertencias.some((a) => a.code === 'parque_al_limite')
    ? `${base} El parque quedó lleno.`
    : base
}
