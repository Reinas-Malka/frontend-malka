/** Alta de varios núcleos de un parque por cantidad (backend #155):
 *  POST /api/v1/parques/{parque_id}/nucleos con { cantidad }. El sistema
 *  los ubica en una fila nueva (la siguiente a la más alta del parque) con
 *  posiciones 1..cantidad. Real y simulado con la misma firma; el swap es
 *  por VITE_DATOS_SIMULADOS, como en api/tandas.ts. */
import { ApiError, esApiError, request } from '@/api/client'
import type { Recurso } from '@/api/recurso'
import { nucleos, parques } from '@/api/recursos'
import { usaDatosSimulados } from '@/datos/cliente'
import type {
  Nucleo,
  NucleosLoteCreados,
  NucleosLoteCrear,
  Parque,
} from '@/tipos/dominio'

export interface ApiNucleosDeParque {
  crear(
    parqueId: string,
    datos: NucleosLoteCrear,
    claveIdempotencia?: string,
  ): Promise<NucleosLoteCreados>
}

export function nucleosDeParqueHttp(): ApiNucleosDeParque {
  return {
    crear: (parqueId, datos, claveIdempotencia) =>
      request<NucleosLoteCreados>(
        `/api/v1/parques/${encodeURIComponent(parqueId)}/nucleos`,
        { metodo: 'POST', cuerpo: datos, claveIdempotencia },
      ),
  }
}

/** Tope de fila y posición del backend (MAXIMO_UBICACION). */
export const MAXIMO_UBICACION = 1000

type Catalogos = {
  /** actualizar: en la demo el conteo del parque es un dato guardado, así
   *  que se lo pone al día (en el backend se cuenta al leer). */
  parques: Pick<Recurso<Parque, unknown, unknown>, 'obtener' | 'actualizar'>
  nucleos: Pick<
    Recurso<
      Nucleo,
      { parque_id: string; fila: number; posicion: number },
      unknown
    >,
    'listar' | 'crear'
  >
}

/** En memoria para la demo: las mismas reglas y códigos que
 *  repositorio_nucleos.crear_lote del backend. */
export function nucleosDeParqueSimulados(
  catalogos: Catalogos,
): ApiNucleosDeParque {
  const porClave = new Map<string, NucleosLoteCreados>()

  const delParque = async (parqueId: string): Promise<Nucleo[]> => {
    const todos: Nucleo[] = []
    let cursor: string | undefined
    do {
      const pagina = await catalogos.nucleos.listar({
        cursor,
        limite: 100,
        filtros: { incluir_inactivos: 'true', parque_id: parqueId },
      })
      todos.push(...pagina.items.filter((n) => n.parque_id === parqueId))
      cursor = pagina.siguiente ?? undefined
    } while (cursor)
    return todos
  }

  async function crear(
    parqueId: string,
    { cantidad }: NucleosLoteCrear,
  ): Promise<NucleosLoteCreados> {
    if (
      !Number.isInteger(cantidad) ||
      cantidad < 1 ||
      cantidad > MAXIMO_UBICACION
    )
      throw new ApiError({
        status: 422,
        codigo: 'validacion',
        mensaje: `La cantidad tiene que ser un número entero entre 1 y ${MAXIMO_UBICACION}.`,
      })
    let parque: Parque
    try {
      parque = await catalogos.parques.obtener(parqueId)
    } catch (error) {
      if (esApiError(error) && error.status === 404)
        throw new ApiError({
          status: 404,
          codigo: 'parque_no_encontrado',
          mensaje: 'No existe el parque.',
        })
      throw error
    }
    if (!parque.activo)
      throw new ApiError({
        status: 409,
        codigo: 'parque_inactivo',
        mensaje: 'El parque está dado de baja: no admite núcleos.',
      })
    const existentes = await delParque(parqueId)
    const activos = existentes.filter((n) => n.activo).length
    const disponibles = parque.capacidad_max - activos
    if (cantidad > disponibles)
      throw new ApiError({
        status: 409,
        codigo: 'capacidad_insuficiente',
        mensaje: `En el parque entran ${disponibles} núcleos más.`,
        detalles: {
          pedidos: cantidad,
          disponibles,
          capacidad_max: parque.capacidad_max,
          nucleos_activos: activos,
        },
      })
    const fila = existentes.reduce((max, n) => Math.max(max, n.fila), 0) + 1
    if (fila > MAXIMO_UBICACION)
      throw new ApiError({
        status: 409,
        codigo: 'parque_sin_filas',
        mensaje:
          'El parque ya usa todas las filas: no hay una libre para el lote.',
        detalles: { maximo: MAXIMO_UBICACION },
      })
    for (let posicion = 1; posicion <= cantidad; posicion++)
      await catalogos.nucleos.crear({ parque_id: parqueId, fila, posicion })
    const ahora = activos + cantidad
    await catalogos.parques.actualizar(parqueId, { nucleos_activos: ahora })
    return {
      parque_id: parqueId,
      creados: cantidad,
      fila,
      posicion_desde: 1,
      posicion_hasta: cantidad,
      nucleos_activos: ahora,
      capacidad_max: parque.capacidad_max,
      advertencias:
        ahora >= parque.capacidad_max
          ? [
              {
                code: 'parque_al_limite',
                message:
                  'El parque quedó lleno: no admite más núcleos activos.',
                // El contrato tipa details vacío; el backend manda
                // capacidad_max, que la pantalla no necesita.
                details: {},
              },
            ]
          : [],
    }
  }

  return {
    // Como el backend: con la misma Idempotency-Key, el mismo resultado.
    crear: async (parqueId, datos, clave) => {
      const previa = clave ? porClave.get(clave) : undefined
      if (previa) return previa
      const resultado = await crear(parqueId, datos)
      if (clave) porClave.set(clave, resultado)
      return resultado
    },
  }
}

export const nucleosDeParque: ApiNucleosDeParque = usaDatosSimulados(
  import.meta.env.VITE_DATOS_SIMULADOS,
)
  ? nucleosDeParqueSimulados({ parques, nucleos })
  : nucleosDeParqueHttp()
