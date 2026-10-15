/** Los recursos CRUD del backend, en un solo lugar. Con
 *  VITE_DATOS_SIMULADOS=true cada uno usa su versión en memoria (con el
 *  banner fijo); si no, habla con la API real. Es el ÚNICO swap. */
import type { components } from '@/api/esquema'
import { recursoHttp, recursoSimulado, type Recurso } from '@/api/recurso'
import { usaDatosSimulados } from '@/datos/cliente'
import { DATOS_SIMULADOS } from '@/datos/simulados'
import type {
  Alicuota,
  Cliente,
  CondicionIva,
  ItemVendible,
  Madre,
  Material,
  Parque,
  Raza,
} from '@/tipos/dominio'

type Esquemas = components['schemas']

const simulado = usaDatosSimulados(import.meta.env.VITE_DATOS_SIMULADOS)

function elegir<T extends { id: string }, C, A>(
  ruta: string,
  semilla: readonly T[],
  construir: (datos: C, id: string) => T,
  derivar?: (fila: T) => T,
): Recurso<T, C, A> {
  return simulado
    ? recursoSimulado<T, C, A>(semilla, construir, derivar)
    : recursoHttp<T, C, A>(ruta)
}

/** Misma derivación que tipo_documento_por_defecto del backend (solo para
 *  la demo: con la API real lo calcula el servidor). */
function documentoPorDefecto(
  condicion: CondicionIva,
): Cliente['tipo_documento_por_defecto'] {
  if (condicion === 'cliente_exterior') return 'factura_e'
  if (condicion === 'responsable_inscripto') return 'factura_a'
  return 'factura_b'
}

export const razas = elegir<
  Raza,
  Esquemas['RazaCrear'],
  Esquemas['RazaActualizar']
>('/api/v1/razas', DATOS_SIMULADOS.razas, (d, id) => ({
  id,
  nombre: d.nombre,
  descripcion: d.descripcion ?? null,
  activo: true,
}))

export const madres = elegir<
  Madre,
  Esquemas['MadreCrear'],
  Esquemas['MadreActualizar']
>('/api/v1/madres', DATOS_SIMULADOS.madres, (d, id) => ({
  id,
  identificacion: d.identificacion,
  activo: true,
}))

export const parques = elegir<
  Parque,
  Esquemas['ParqueCrear'],
  Esquemas['ParqueActualizar']
>('/api/v1/parques', DATOS_SIMULADOS.parques, (d, id) => ({
  id,
  ...d,
  nucleos_activos: 0,
  activo: true,
}))

export const materiales = elegir<
  Material,
  Esquemas['MaterialCrear'],
  Esquemas['MaterialActualizar']
>('/api/v1/materiales', DATOS_SIMULADOS.materiales, (d, id) => ({
  id,
  ...d,
  stock: '0',
  activo: true,
}))

export const itemsVendibles = elegir<
  ItemVendible,
  Esquemas['ItemVendibleCrear'],
  Esquemas['ItemVendibleActualizar']
>('/api/v1/items-vendibles', DATOS_SIMULADOS.itemsVendibles, (d, id) => ({
  id,
  nombre: d.nombre,
  alicuota: String(d.alicuota) as Alicuota,
  activo: true,
}))

export const clientes = elegir<
  Cliente,
  Esquemas['ClienteCrear'],
  Esquemas['ClienteActualizar']
>(
  '/api/v1/clientes',
  DATOS_SIMULADOS.clientes,
  (d, id) => ({
    id,
    ...d,
    activo: true,
    tipo_documento_por_defecto: documentoPorDefecto(d.condicion_iva),
  }),
  // Al editar la condición de IVA, la factura sugerida cambia como en la API.
  (c) => ({
    ...c,
    tipo_documento_por_defecto: documentoPorDefecto(c.condicion_iva),
  }),
)
