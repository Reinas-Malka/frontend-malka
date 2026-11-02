/** KPIs de producción (backend #31): % de cosecha y % de pérdida en el
 *  parque, por tanda o por raza. Real y simulado con la misma firma; el
 *  swap es el mismo de api/tandas.ts: con datos simulados se cuentan desde
 *  las celdas de esa simulación, así una operación de la demo mueve los
 *  indicadores. */
import { ApiError, request } from '@/api/client'
import { simulacionDeTandas, type SimulacionDeTandas } from '@/api/tandas'
import { errorDePeriodo } from '@/lib/fechas'
import { calcularKpis, type ParametrosDeKpis } from '@/lib/kpis'
import type { KpiProduccion } from '@/tipos/dominio'

export interface ApiKpis {
  /** Una fila por tanda o por raza; es una lista, no una página. */
  produccion(parametros?: ParametrosDeKpis): Promise<KpiProduccion[]>
}

const RUTA = '/api/v1/kpis/produccion'

export function kpisHttp(): ApiKpis {
  return {
    produccion: ({ agrupar, desde, hasta } = {}) =>
      request<KpiProduccion[]>(RUTA, { query: { agrupar, desde, hasta } }),
  }
}

/** Lo que la simulación lee de las tandas: sus celdas, como la base. */
export type FuenteDeKpis = Pick<SimulacionDeTandas, 'instantanea'>

/** En memoria para la demo sin backend: la misma regla que
 *  repositorio_kpis.py, con el mismo 422 si el período está al revés. */
export function kpisSimulados(fuente: FuenteDeKpis): ApiKpis {
  return {
    produccion: async (parametros = {}) => {
      const error = errorDePeriodo(parametros)
      if (error)
        throw new ApiError({
          status: 422,
          codigo: 'periodo_invalido',
          mensaje: error,
          detalles: { desde: parametros.desde, hasta: parametros.hasta },
        })
      const { tandas, celdas, razas } = fuente.instantanea()
      return calcularKpis(tandas, celdas, razas, parametros)
    },
  }
}

export const kpis: ApiKpis = simulacionDeTandas
  ? kpisSimulados(simulacionDeTandas)
  : kpisHttp()
