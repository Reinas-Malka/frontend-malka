/** Tipos derivados de docs/dominio.md del backend — nombres del dominio,
 *  sin traducir ni simplificar.
 *
 *  Las entidades que YA tienen endpoint son alias de src/api/esquema.d.ts,
 *  generado del OpenAPI del backend (npm run contrato:tipos): si el backend
 *  cambia un campo, el build lo marca. Las que todavía no tienen endpoint
 *  (celda) se escriben a mano desde dominio.md. */
import type { components, operations } from '@/api/esquema'

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

/** Tanda (backend #27): la identifica la raza y la madre es opcional
 *  (dominio del 16/10). Trae sus celdas contadas al leer: el total y
 *  cuántas hay en cada estado, nunca una columna. */
export type Tanda = Esquemas['TandaRespuesta']

/** POST /api/v1/tandas: cuadros (1, 2 o 3), nunca un número de cúpulas. */
export type TandaCrear = Esquemas['TandaCrear']

/** Respuesta del alta: la tanda, el consumo de cúpulas, el stock que queda
 *  y la advertencia stock_negativo si quedó bajo cero (no bloquea). */
export type TandaCreada = Esquemas['TandaCreada']

/** GET /api/v1/tandas/{id}: además de las celdas por estado, dónde están.
 *  nucleos: los que tienen celdas de la tanda en el parque (vacío después
 *  de la cosecha). bancos: los que tienen reinas cosechadas de la tanda. */
export type TandaDetalle = Esquemas['TandaDetalle']
export type NucleoDeTanda = Esquemas['NucleoDeTanda']
export type BancoDeTanda = Esquemas['BancoDeTanda']

/** POST /api/v1/tandas/{id}/operaciones: siempre por lote (dominio del
 *  23/10), nunca celda por celda. El campo accion elige la operación. */
export type OperacionCrear =
  | Esquemas['OperacionDescartar']
  | Esquemas['OperacionIntroducir']
  | Esquemas['OperacionCosechar']
  | Esquemas['OperacionPasarABanco']
export type AccionDeTanda = OperacionCrear['accion']
/** La tanda como quedó, más el reparto (al introducir) o las descartadas
 *  en la cosecha (al cosechar). */
export type OperacionRealizada = Esquemas['OperacionRealizada']
export type RepartoNucleo = Esquemas['RepartoNucleo']

/** GET /api/v1/kpis/produccion (#31, dominio del 23/10): conteos desde las
 *  celdas y los dos %, con un decimal como texto ("79.2"); null si la tanda
 *  o la raza todavía no tiene introducidas. */
export type KpiProduccion = Esquemas['KpiProduccion']
type ConsultaDeKpis = NonNullable<
  operations['obtener_kpis_de_produccion_api_v1_kpis_produccion_get']['parameters']['query']
>
/** Por tanda (la más nueva primero) o por raza (suma sus tandas). */
export type AgrupacionKpi = NonNullable<ConsultaDeKpis['agrupar']>
export const AGRUPACIONES_KPI = [
  'tanda',
  'raza',
] as const satisfies readonly AgrupacionKpi[]

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

// --- facturación y exportación (A|B|E transcripto, nunca calculado) ---
/** La letra la asigna ARCA: se transcribe. */
export type TipoComprobante = Esquemas['TipoComprobante']
export type Moneda = Esquemas['Moneda']

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

// --- ventas: pedidos (backend #34), reservas (#35) y estados (#36) ---
export type EstadoPedido = Esquemas['EstadoPedido']
export type Incoterm = Esquemas['Incoterm']

/** Con sus líneas. destino_pais e incoterm solo en exportación. */
export type Pedido = Esquemas['PedidoRespuesta']
export type PedidoItem = Esquemas['PedidoItemRespuesta']
/** Sin estado: el alta crea siempre en borrador. */
export type PedidoCrear = Esquemas['PedidoCrear']
export type PedidoItemCrear = Esquemas['PedidoItemCrear']
/** Una por línea, con la raza y la cantidad de la línea (ADR 0014). */
export type Reserva = Esquemas['ReservaRespuesta']
export type EstadoReserva = Esquemas['EstadoReserva']
/** Cuerpo de POST /pedidos/{id}/estado: entregar o cancelar. */
export type Entregar = Esquemas['Entregar']
export type Cancelar = Esquemas['Cancelar']
export type LineaDespacho = Esquemas['LineaDespacho']
export type SalidaDeBanco = Esquemas['SalidaDeBanco']
/** Lo que elige quien despacha: la fecha y los bancos de cada línea. */
export type Despacho = Omit<Entregar, 'estado'>
/** Lo que salió para el pedido: por línea, cuántas de cada banco y qué día
 *  (GET /pedidos/{id}/despachos). */
export type DespachoDeLinea = Esquemas['DespachoDeLinea']

// --- borradores de documentos con IA (backend #40) ---
/** La IA redacta; los números fiscales los carga una persona y la
 *  aprobación es siempre del dueño o un admin (dominio, "Aprobación de
 *  borradores"). contenido solo en borrador; motivo_rechazo solo en
 *  rechazado. */
export type Borrador = Esquemas['BorradorRespuesta']
export type EstadoBorrador = Esquemas['EstadoBorrador']
export type MotivoRechazo = Esquemas['MotivoRechazo']
export type ContenidoDeBorrador = Esquemas['BorradorValidado']
export type BorradorPedido = Esquemas['BorradorPedido']

export const NOMBRE_DE_ESTADO_RESERVA: Record<EstadoReserva, string> = {
  activa: 'Activa',
  consumida: 'Consumida',
  liberada: 'Liberada',
}

// --- disponibilidad de reinas por raza (backend #33, ADR 0014) ---
export type DisponibilidadReinas = Esquemas['DisponibilidadReinas']
/** Dónde están las enjauladas de una raza. banco_id null: todavía no
 *  pasaron a ningún banco. Es ubicación, no "disponible por banco". */
export type ExistenciaEnBanco = Esquemas['ExistenciaEnBanco']

export const ESTADOS_PEDIDO = [
  'borrador',
  'reservado',
  'entregado',
  'cancelado',
] as const satisfies readonly EstadoPedido[]

export const NOMBRE_DE_ESTADO_PEDIDO: Record<EstadoPedido, string> = {
  borrador: 'Borrador',
  reservado: 'Reservado',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
}

/** Incoterms 2020, en el orden de app/services/ventas/pedidos.py. */
export const INCOTERMS = [
  'EXW',
  'FCA',
  'CPT',
  'CIP',
  'DAP',
  'DPU',
  'DDP',
  'FAS',
  'FOB',
  'CFR',
  'CIF',
] as const satisfies readonly Incoterm[]

/** Comprobante transcripto (backend #108): punto_venta y numero son DOS
 *  enteros, nunca el texto impreso; importe y tipo_cambio, Decimal como
 *  texto; tipo_cambio null si y solo si es en ARS. Inmutable: sin PATCH ni
 *  baja. */
export type Comprobante = Esquemas['ComprobanteRespuesta']
/** POST /api/v1/comprobantes: lo que se transcribe del PDF de ARCA. */
export type ComprobanteCrear = Esquemas['ComprobanteCrear']

// --- exportación: el embarque y sus 6 documentos (backend #109) ---
export type TipoDocumentoEmbarque = Esquemas['TipoDocumentoEmbarque']
export type EstadoEmbarque = Esquemas['EstadoEmbarque']

/** destino_pais: el del cliente en un envío directo, el del hub en uno
 *  consolidado. Las dos modalidades se guardan igual (dominio.md, 11/10). */
export type Embarque = Esquemas['EmbarqueRespuesta']
export type EmbarqueCrear = Esquemas['EmbarqueCrear']
export type EmbarqueActualizar = Esquemas['EmbarqueActualizar']
export type DocumentoEmbarque = Esquemas['DocumentoRespuesta']
export type DocumentoCrear = Esquemas['DocumentoCrear']
export type Completitud = Esquemas['CompletitudRespuesta']
/** URL prefirmada para bajar un documento (backend #102). */
export type DescargaPreparada = Esquemas['DescargaPreparada']

/** Los 6 documentos de un envío, en el orden de docs/dominio.md (el mismo
 *  que devuelve el backend). Completitud = los 6 presentes: la demo del 30/11. */
export const DOCUMENTOS_DEL_EMBARQUE = [
  'factura_e',
  'permiso_embarque',
  'guia_aerea',
  'lista_empaque',
  'dte',
  'shipper_certificate',
] as const satisfies readonly TipoDocumentoEmbarque[]

/** Nombre y emisor de cada documento (tabla "Exportación" de dominio.md):
 *  cinco emisores distintos, el sistema solo registra lo que emitieron. */
export const DOCUMENTO_DEL_EMBARQUE: Record<
  TipoDocumentoEmbarque,
  { nombre: string; emisor: string }
> = {
  factura_e: { nombre: 'Factura E', emisor: 'La cabaña, vía ARCA' },
  permiso_embarque: {
    nombre: 'Permiso de embarque',
    emisor: 'Despachante / SIM',
  },
  guia_aerea: { nombre: 'Guía aérea (AWB)', emisor: 'Línea aérea' },
  lista_empaque: { nombre: 'Lista de empaque', emisor: 'La cabaña' },
  dte: { nombre: 'DTe', emisor: 'SENASA' },
  shipper_certificate: {
    nombre: "Shipper's certificate",
    emisor: 'La cabaña, para la aerolínea',
  },
}

export const ESTADOS_EMBARQUE = [
  'en_preparacion',
  'en_transito',
  'entregado',
  'cancelado',
] as const satisfies readonly EstadoEmbarque[]

export const NOMBRE_DE_ESTADO_EMBARQUE: Record<EstadoEmbarque, string> = {
  en_preparacion: 'En preparación',
  en_transito: 'En tránsito',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
}

export const CUPULAS_POR_CUADRO = 135 // constante del dominio: un solo lugar
