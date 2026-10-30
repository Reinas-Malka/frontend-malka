/** Un recurso CRUD del backend con la forma común de los routers de
 *  backend #30/#32: listado paginado por cursor, alta idempotente, PATCH y
 *  baja lógica (DELETE → 204, la fila queda con activo=false).
 *
 *  Dos implementaciones con la MISMA firma: HTTP real y simulada en memoria
 *  (VITE_DATOS_SIMULADOS). El swap vive en api/recursos.ts. */
import { ApiError, request } from '@/api/client'

export type Pagina<T> = { items: T[]; siguiente: string | null }

export type ParametrosDeListado = {
  limite?: number
  cursor?: string
  filtros?: Record<string, string | undefined>
}

export interface Recurso<T, Crear, Actualizar> {
  listar(parametros?: ParametrosDeListado): Promise<Pagina<T>>
  obtener(id: string): Promise<T>
  crear(datos: Crear, claveIdempotencia?: string): Promise<T>
  actualizar(id: string, datos: Actualizar): Promise<T>
  desactivar(id: string): Promise<void>
}

export function recursoHttp<T, Crear, Actualizar>(
  ruta: string,
): Recurso<T, Crear, Actualizar> {
  const deUno = (id: string) => `${ruta}/${encodeURIComponent(id)}`
  return {
    listar: ({ limite, cursor, filtros } = {}) =>
      request<Pagina<T>>(ruta, { query: { limite, cursor, ...filtros } }),
    obtener: (id) => request<T>(deUno(id)),
    crear: (datos, claveIdempotencia) =>
      request<T>(ruta, { metodo: 'POST', cuerpo: datos, claveIdempotencia }),
    actualizar: (id, datos) =>
      request<T>(deUno(id), { metodo: 'PATCH', cuerpo: datos }),
    desactivar: (id) => request<void>(deUno(id), { metodo: 'DELETE' }),
  }
}

const LIMITE_POR_DEFECTO = 50

/** Recurso en memoria para la demo sin backend. Copia la semilla: las altas
 *  de una sesión no modifican DATOS_SIMULADOS. El cursor es el índice.
 *  `derivar` recalcula lo que en la API real calcula el servidor (p. ej. la
 *  factura sugerida de un cliente) después de cada alta o edición. */
export function recursoSimulado<T extends { id: string }, Crear, Actualizar>(
  semilla: readonly T[],
  construir: (datos: Crear, id: string) => T,
  derivar: (fila: T) => T = (fila) => fila,
): Recurso<T, Crear, Actualizar> {
  let filas: T[] = semilla.map((fila) => ({ ...fila }))
  // Como el backend: la misma clave devuelve el mismo resultado (24 h allá).
  const altasPorClave = new Map<string, T>()

  const buscar = (id: string): T => {
    const fila = filas.find((f) => f.id === id)
    if (!fila) {
      throw new ApiError({
        status: 404,
        codigo: 'no_encontrado',
        mensaje: 'No existe o es de otro criadero.',
      })
    }
    return fila
  }

  const reemplazar = (actualizada: T): T => {
    filas = filas.map((f) => (f.id === actualizada.id ? actualizada : f))
    return actualizada
  }

  // PATCH: un campo ausente o undefined no se toca.
  const definidos = (datos: Actualizar): Partial<T> =>
    Object.fromEntries(
      Object.entries(datos as Record<string, unknown>).filter(
        ([, valor]) => valor !== undefined,
      ),
    ) as Partial<T>

  return {
    listar: async ({ limite = LIMITE_POR_DEFECTO, cursor, filtros } = {}) => {
      // Como el backend: las dadas de baja solo con incluir_inactivos.
      const visibles =
        filtros?.incluir_inactivos === 'true'
          ? filas
          : filas.filter((f) => (f as { activo?: boolean }).activo !== false)
      const desde = cursor ? Number(cursor) : 0
      const items = visibles.slice(desde, desde + limite)
      const hasta = desde + items.length
      return {
        items,
        siguiente: hasta < visibles.length ? String(hasta) : null,
      }
    },
    obtener: async (id) => buscar(id),
    crear: async (datos, claveIdempotencia) => {
      const previa = claveIdempotencia
        ? altasPorClave.get(claveIdempotencia)
        : undefined
      if (previa) return previa
      const nueva = derivar(construir(datos, crypto.randomUUID()))
      filas = [...filas, nueva]
      if (claveIdempotencia) altasPorClave.set(claveIdempotencia, nueva)
      return nueva
    },
    actualizar: async (id, datos) =>
      reemplazar(derivar({ ...buscar(id), ...definidos(datos) })),
    desactivar: async (id) => {
      reemplazar({ ...buscar(id), activo: false })
    },
  }
}
