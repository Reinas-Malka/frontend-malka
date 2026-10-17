/** Tipos derivados de docs/dominio.md del backend — nombres del dominio,
 *  sin traducir ni simplificar.
 *
 *  Las entidades que YA tienen endpoint son alias de src/api/esquema.d.ts,
 *  generado del OpenAPI del backend (npm run contrato:tipos): si el backend
 *  cambia un campo, el build lo marca. Las que todavía no tienen endpoint
 *  (tanda, celda, comprobante, embarque) se escriben a mano desde dominio.md. */
import type { components } from '@/api/esquema'

type Esquemas = components['schemas']

// --- ciclo de cría (C.3 y D) ---
export type EstadoCelda =
  | 'trasladada'
  | 'descartada'
  | 'introducida'
  | 'nacida'
  | 'madura'
  | 'fecundada'
  | 'extraviada'
  | 'enjaulada'
  | 'despachada'

// --- producción: alias de los *Respuesta del backend (sin tenant_id) ---
export type Raza = Esquemas['RazaRespuesta']

export type Madre = Esquemas['MadreRespuesta']

/** Parque de fecundación: donde la celda entra a un núcleo (≠ banco, que guarda reinas ya enjauladas). */
export type Parque = Esquemas['ParqueRespuesta']

export type Nucleo = Esquemas['NucleoRespuesta']

/** Banco: reinas enjauladas listas para despacho (dominio del 16/10). */
export type Banco = Esquemas['BancoRespuesta']

export type Tanda = {
  id: string
  tenant_id: string
  fecha_traslarve: string // ISO date — ancla del eje A (D0)
  madre_id: string | null // madres fuera de alcance (16/10): opcional
  raza_id: string
  retroactivo: boolean
  // Ubicación en la continuadora los primeros 10 días: las dos o ninguna.
  fila_continuadora: number | null
  posicion_continuadora: number | null
}

export type Celda = {
  id: string
  tenant_id: string
  tanda_id: string
  nucleo_id: string | null // NULL hasta introducirla (~D10)
  estado: EstadoCelda
  fecha_introduccion: string | null // ancla del eje B (I0)
  fecha_nacimiento: string | null // ~D11 del traslarve / I0+1
  fecha_fecundacion: string | null // nac+10 o extraviada
  fecha_enjaulado: string | null // I0+16, lista para despacho
  banco_id: string | null // solo enjaulada o despachada
  fecha_descarte: string | null // solo en descartada
  fecha_extravio: string | null // solo en extraviada
}

// --- materiales (movimientos con signo, stock = suma) ---
export type TipoMovimiento = 'compra' | 'consumo' | 'ajuste'

export type Material = Esquemas['MaterialRespuesta']

export type MovimientoMaterial = Omit<
  Esquemas['MovimientoRespuesta'],
  'tipo'
> & { tipo: TipoMovimiento }

/** Alícuotas de IVA de app/services/documentos/importes.py (Decimal como texto). */
export type Alicuota = '0' | '0.025' | '0.05' | '0.105' | '0.21' | '0.27'

export type ItemVendible = Omit<
  Esquemas['ItemVendibleRespuesta'],
  'alicuota'
> & { alicuota: Alicuota }

// --- facturación y exportación (A|B|E transcripto, never calculado) ---
export type TipoComprobante = 'A' | 'B' | 'E'
export type Moneda = 'ARS' | 'USD' | 'EUR'

/** Valores de CondicionIva en app/services/ventas/clientes.py. */
export const CONDICIONES_IVA = [
  'responsable_inscripto',
  'monotributo',
  'exento',
  'consumidor_final',
  'cliente_exterior',
] as const satisfies readonly Esquemas['CondicionIva'][]
export type CondicionIva = Esquemas['CondicionIva']

/** Alineado a app/schemas/clientes.py (respuesta real de la API). */
export type Cliente = Esquemas['ClienteRespuesta']

/** POST /api/v1/clientes — sin tenant_id: lo completa la sesión (ADR 0009). */
export type ClienteCrear = Esquemas['ClienteCrear']

/** PATCH /api/v1/clientes/{id} — todo opcional. */
export type ClienteActualizar = Esquemas['ClienteActualizar']

export type Comprobante = {
  id: string
  tenant_id: string
  tipo: TipoComprobante // la letra la asigna ARCA: se transcribe
  cliente_id: string
  punto_venta: number // DOS enteros separados, nunca el string impreso
  numero: number
  fecha_emision: string
  moneda: Moneda
  importe: string // Decimal como string (nunca float)
  tipo_cambio: string | null // NULL si ARS
  archivo_s3_key: string
  cargado_por: string
}

export type TipoDocumentoEmbarque =
  | 'factura_e'
  | 'permiso_embarque'
  | 'guia_aerea'
  | 'lista_empaque'
  | 'dte'
  | 'shipper_certificate'

export type Embarque = {
  id: string
  tenant_id: string
  destino_pais: string // ISO 3166-1 alfa-2, como pedido.destino_pais
  fecha_vuelo: string
  awb: string
  estado: string
}

export type DocumentoEmbarque = {
  id: string
  embarque_id: string
  tipo: TipoDocumentoEmbarque
  numero: string
  archivo_s3_key: string
  fecha: string
}

/** Completitud del embarque: los 6 tipos presentes (la demo del 30/11). */
export const DOCUMENTOS_DEL_EMBARQUE: TipoDocumentoEmbarque[] = [
  'factura_e',
  'permiso_embarque',
  'guia_aerea',
  'lista_empaque',
  'dte',
  'shipper_certificate',
]

export const CUPULAS_POR_CUADRO = 135 // constante del dominio: un solo lugar
