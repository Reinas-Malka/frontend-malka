/** Datos de las entidades que TODAVÍA no tienen endpoint en el backend
 *  (tandas #27, celdas #28, comprobantes y embarques). Los catálogos con
 *  endpoint viven en api/recursos.ts. Cuando aparezca cada endpoint, su
 *  método pasa a un Recurso y sale de acá. */
import type {
  Celda,
  Comprobante,
  Embarque,
  MovimientoMaterial,
  Nucleo,
  Tanda,
} from '@/tipos/dominio'
import { DATOS_SIMULADOS } from '@/datos/simulados'

export interface ClienteDeDatos {
  listarTandas(): Promise<Tanda[]>
  listarCeldas(tandaId: string): Promise<Celda[]>
  listarNucleos(parqueId: string): Promise<Nucleo[]>
  listarMovimientos(materialId: string): Promise<MovimientoMaterial[]>
  listarComprobantes(): Promise<Comprobante[]>
  obtenerEmbarque(id: string): Promise<Embarque | null>
}

const simulado: ClienteDeDatos = {
  listarTandas: async () => DATOS_SIMULADOS.tandas,
  listarCeldas: async (id) =>
    DATOS_SIMULADOS.celdas.filter((c) => c.tanda_id === id),
  listarNucleos: async (id) =>
    DATOS_SIMULADOS.nucleos.filter((n) => n.parque_id === id),
  listarMovimientos: async (id) =>
    DATOS_SIMULADOS.movimientos.filter((m) => m.material_id === id),
  listarComprobantes: async () => DATOS_SIMULADOS.comprobantes,
  obtenerEmbarque: async (id) =>
    DATOS_SIMULADOS.embarques.find((e) => e.id === id) ?? null,
}

/** El flag se lee en un solo lugar: el banner y el cliente deciden igual. */
export function usaDatosSimulados(flag: string | undefined): boolean {
  return flag === 'true'
}

/** Hasta que exista el cliente real (#5), sin el flag no hay datos: cada
 *  llamada falla y la pantalla muestra ErrorDePantalla. Nunca datos de
 *  ejemplo sin el banner (skill diseno-frontend). */
const sinCliente = (): Promise<never> =>
  Promise.reject(
    new Error(
      'El cliente real de datos todavía no existe (#5): activá VITE_DATOS_SIMULADOS=true',
    ),
  )

const sinClienteReal: ClienteDeDatos = {
  listarTandas: sinCliente,
  listarCeldas: sinCliente,
  listarNucleos: sinCliente,
  listarMovimientos: sinCliente,
  listarComprobantes: sinCliente,
  obtenerEmbarque: sinCliente,
}

export function elegirCliente(flag: string | undefined): ClienteDeDatos {
  return usaDatosSimulados(flag) ? simulado : sinClienteReal
}

export const datos: ClienteDeDatos = elegirCliente(
  import.meta.env.VITE_DATOS_SIMULADOS,
)
