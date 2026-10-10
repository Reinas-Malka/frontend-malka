/** Tipos derivados de docs/dominio.md del backend — nombres del dominio,
 *  sin traducir ni simplificar. Se actualizan cuando cambia el documento. */

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

export type Raza = { id: string; tenant_id: string; nombre: string; descripcion?: string; activo: boolean }

export type Madre = { id: string; tenant_id: string; identificacion: string; activo: boolean }

/** Parque de fecundación: donde la celda entra a un núcleo (≠ banco, que queda fuera de fase 1). */
export type Parque = {
  id: string
  tenant_id: string
  nombre: string
  ubicacion: string // texto simple, pueden ser predios distintos
  capacidad_max: number // en núcleos
  activo: boolean
}

export type Nucleo = {
  id: string
  tenant_id: string
  parque_id: string
  fila: number
  posicion: number
  activo: boolean
}

export type Tanda = {
  id: string
  tenant_id: string
  fecha_traslarve: string // ISO date — ancla del eje A (D0)
  madre_id: string
  raza_id: string
  retroactivo: boolean
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
}

// --- materiales (movimientos con signo, stock = suma) ---
export type TipoMovimiento = 'compra' | 'consumo' | 'ajuste'

export type Material = { id: string; tenant_id: string; nombre: string; unidad: string } // unidad texto corto, sin enum

export type MovimientoMaterial = {
  id: string
  tenant_id: string
  material_id: string
  tipo: TipoMovimiento
  cantidad: number // con signo: +compra, -consumo, ±ajuste
  motivo?: string
  ocurrido_en: string
}

// --- facturación y exportación (A|B|E transcripto, never calculado) ---
export type TipoComprobante = 'A' | 'B' | 'E'
export type Moneda = 'ARS' | 'USD' | 'EUR'

/** Alineados a app/schemas/clientes.py del backend (respuesta real de la API). */
export type Cliente = {
  id: string
  nombre: string
  pais: string
  tipo: 'nacional' | 'exportacion'
  condicion_iva: 'responsable_inscripto' | 'monotributo' | 'exento' | 'consumidor_final' | 'exterior'
  cuit_o_tax_id: string
  activo: boolean
  tipo_documento_por_defecto?: 'factura_a' | 'factura_b' | 'factura_e'
}

/** POST /api/v1/clientes — sin tenant_id: lo completa la sesion (ADR 0009). */
export type ClienteCrear = {
  nombre: string
  pais: string
  tipo: Cliente['tipo']
  condicion_iva: Cliente['condicion_iva']
  cuit_o_tax_id: string
}

/** PATCH /api/v1/clientes/{id} — todo opcional. */
export type ClienteActualizar = {
  nombre?: string
  pais?: string
  tipo?: Cliente['tipo']
  condicion_iva?: Cliente['condicion_iva']
  cuit_o_tax_id?: string
  activo?: boolean
}

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
  destino_pais: string
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
  'factura_e', 'permiso_embarque', 'guia_aerea', 'lista_empaque', 'dte', 'shipper_certificate',
]

export const CUPULAS_POR_CUADRO = 135 // constante del dominio: un solo lugar
