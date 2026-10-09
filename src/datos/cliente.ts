/** Cliente de datos con la firma que va a tener el real (issue #5).
 *  VITE_DATOS_SIMULADOS=true usa los simulados; cuando existan los
 *  endpoints, el swap vive SOLO en este archivo. */
import type {
  Celda, Cliente, Comprobante, Embarque, Madre, Material, MovimientoMaterial, Nucleo, Parque, Raza, Tanda,
} from '@/tipos/dominio'
import { DATOS_SIMULADOS } from './simulados'

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
  listarCeldas: async (id) => DATOS_SIMULADOS.celdas.filter((c) => c.tanda_id === id),
  listarParques: async () => DATOS_SIMULADOS.parques,
  listarNucleos: async (id) => DATOS_SIMULADOS.nucleos.filter((n) => n.parque_id === id),
  listarRazas: async () => DATOS_SIMULADOS.razas,
  listarMadres: async () => DATOS_SIMULADOS.madres,
  listarMateriales: async () => DATOS_SIMULADOS.materiales,
  listarMovimientos: async (id) => DATOS_SIMULADOS.movimientos.filter((m) => m.material_id === id),
  listarClientes: async () => DATOS_SIMULADOS.clientes,
  listarComprobantes: async () => DATOS_SIMULADOS.comprobantes,
  obtenerEmbarque: async (id) => DATOS_SIMULADOS.embarques.find((e) => e.id === id) ?? null,
}

/** El real se agrega acá cuando existan los endpoints (mismo cliente, fetch). */
export const datos: ClienteDeDatos = import.meta.env.VITE_DATOS_SIMULADOS === 'true' ? simulado : simulado
