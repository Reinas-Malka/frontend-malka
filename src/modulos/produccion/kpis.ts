/** Indicadores de producción (backend #31): lo de la pantalla, sin React. */
import { leerPeriodo, type Periodo } from '@/lib/fechas'
import { CLAVE_TANDAS } from '@/modulos/produccion/tandas'
import { AGRUPACIONES_KPI, type AgrupacionKpi } from '@/tipos/dominio'

/** Bajo la de las tandas: una operación o un alta invalida [CLAVE_TANDAS] y
 *  con eso también los indicadores. */
export const CLAVE_KPIS = [CLAVE_TANDAS, 'kpis'] as const

export type FiltrosDeKpis = Periodo & { agrupar: AgrupacionKpi }

const esAgrupacion = (valor: string | null): valor is AgrupacionKpi =>
  AGRUPACIONES_KPI.some((a) => a === valor)

/** Los filtros viven en la URL (?agrupar=&desde=&hasta=): sobreviven a ir
 *  al detalle de una tanda y volver. Lo que no se entiende se ignora. */
export function leerFiltrosDeKpis(params: URLSearchParams): FiltrosDeKpis {
  const agrupar = params.get('agrupar')
  return {
    agrupar: esAgrupacion(agrupar) ? agrupar : 'tanda',
    ...leerPeriodo(params),
  }
}

/** Lo que significa cada indicador, dicho para el apicultor. */
export const EXPLICACION = {
  cosecha:
    'De las celdas que entraron al parque, cuántas reinas se cosecharon (enjauladas o ya despachadas). Es el % de fecundación: una reina cosechada es una reina fecundada.',
  perdida:
    'De las celdas que entraron al parque, cuántas se descartaron en la cosecha. Las que se descartaron antes de introducirlas no cuentan.',
  enCurso:
    'Mientras queden celdas en el parque, cosecha y pérdida no suman 100.',
} as const

export const SIN_INTRODUCIDAS = 'todavía sin introducidas'
