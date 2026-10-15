/** Cliente de datos con la firma que va a tener el real (issue #5).
 *  VITE_DATOS_SIMULADOS=true usa los simulados; cuando existan los
 *  endpoints, el swap vive SOLO en este archivo. */
import type {
  Celda,
  Cliente,
  Comprobante,
  Embarque,
  Madre,
  Material,
  MovimientoMaterial,
  Nucleo,
  Parque,
  Raza,
  Tanda,
} from '@/tipos/dominio'
import { DATOS_SIMULADOS } from '@/datos/simulados'

export interface ClienteDeDatos {
  listarTandas(): Promise<Tanda[]>
  listarCeldas(tandaId: string): Promise<Celda[]>
  listarParques(): Promise<Parque[]>
  listarNucleos(parqueId: string): Promise<Nucleo[]>
  listarRazas(): Promise<Raza[]>
  listarMadres(): Promise<Madre[]>
  listarMateriales(): Promise<Material[]>
  listarMovimientos(materialId: string): Promise<MovimientoMaterial[]>
  listarClientes(): Promise<Cliente[]>
  listarComprobantes(): Promise<Comprobante[]>
  obtenerEmbarque(id: string): Promise<Embarque | null>
}

const simulado: ClienteDeDatos = {
  listarTandas: async () => DATOS_SIMULADOS.tandas,
  listarCeldas: async (id) =>
    DATOS_SIMULADOS.celdas.filter((c) => c.tanda_id === id),
  listarParques: async () => DATOS_SIMULADOS.parques,
  listarNucleos: async (id) =>
    DATOS_SIMULADOS.nucleos.filter((n) => n.parque_id === id),
  listarRazas: async () => DATOS_SIMULADOS.razas,
  listarMadres: async () => DATOS_SIMULADOS.madres,
  listarMateriales: async () => DATOS_SIMULADOS.materiales,
  listarMovimientos: async (id) =>
    DATOS_SIMULADOS.movimientos.filter((m) => m.material_id === id),
  listarClientes: async () => DATOS_SIMULADOS.clientes,
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
  listarParques: sinCliente,
  listarNucleos: sinCliente,
  listarRazas: sinCliente,
  listarMadres: sinCliente,
  listarMateriales: sinCliente,
  listarMovimientos: sinCliente,
  listarClientes: sinCliente,
  listarComprobantes: sinCliente,
  obtenerEmbarque: sinCliente,
}

export function elegirCliente(flag: string | undefined): ClienteDeDatos {
  return usaDatosSimulados(flag) ? simulado : sinClienteReal
}

export const datos: ClienteDeDatos = elegirCliente(
  import.meta.env.VITE_DATOS_SIMULADOS,
)
