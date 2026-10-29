/** Datos de ejemplo verosímiles del negocio (docs/dominio.md del backend).
 *  Tandas de 135/270/405 celdas (1-3 cuadros de 135), razas reales, parques
 *  en predios distintos y fechas que respetan el ciclo con las operaciones
 *  del campo (23/10): traslarve D0, introducción ~D10, cosecha ≈ D26. */
import { conTotales, type PedidoSinTotales } from '@/lib/importes'
import {
  CUPULAS_POR_CUADRO,
  type Banco,
  type Celda,
  type Cliente,
  DOCUMENTOS_DEL_EMBARQUE,
  type Comprobante,
  type DocumentoEmbarque,
  type Embarque,
  type ItemVendible,
  type Madre,
  type Material,
  type MovimientoMaterial,
  type Nucleo,
  type Parque,
  type Pedido,
  type Raza,
  type Reserva,
  type Tanda,
  type TipoDocumentoEmbarque,
} from '@/tipos/dominio'

const iso = (dias: number) => {
  const d = new Date('2026-10-05T09:00:00Z')
  d.setUTCDate(d.getUTCDate() - dias)
  return d.toISOString()
}

const T = '11111111-1111-4111-8111-111111111111' // tenant A (demo)
const id = (n: number) =>
  `${n.toString().padStart(8, '0')}-0000-4000-8000-${n.toString().padStart(12, '0')}`

export const razas: Raza[] = [
  {
    id: id(1),
    nombre: 'Carniola',
    descripcion: 'Apis mellifera carnica — dócil, alta fecundación',
    activo: true,
  },
  {
    id: id(2),
    nombre: 'Buckfast',
    descripcion: 'Híbrida productiva, comportamiento tranquilo',
    activo: true,
  },
  {
    id: id(3),
    nombre: 'Italiana',
    descripcion: 'Ligustica — precoz para polinización temprana',
    activo: true,
  },
]

export const madres: Madre[] = [
  { id: id(11), identificacion: 'A-12', activo: true },
  { id: id(12), identificacion: 'A-07', activo: true },
  { id: id(13), identificacion: 'B-03', activo: true },
]

export const parques: Parque[] = [
  {
    id: id(21),
    nombre: 'Parque La Loma',
    ubicacion: 'Predio Las Violetas, km 12',
    capacidad_max: 60,
    nucleos_activos: 15,
    activo: true,
  },
  {
    id: id(22),
    nombre: 'Parque Monte Chico',
    ubicacion: 'Predio El Durazno, camino viejo a Tandil',
    capacidad_max: 40,
    nucleos_activos: 9,
    activo: true,
  },
]

export const nucleos: Nucleo[] = Array.from({ length: 24 }, (_, i) => ({
  id: id(100 + i),
  parque_id: i < 15 ? id(21) : id(22),
  fila: Math.floor((i % 15) / 3) + 1,
  posicion: (i % 3) + 1,
  activo: true,
}))

/** Dos bancos: las reinas cosechadas se reparten entre ellos (dominio 16/10). */
const BANCOS_IDS = [id(95), id(96)]

/** El backend devuelve las fechas como date (YYYY-MM-DD). */
const diaAtras = (dias: number) => iso(dias).slice(0, 10)

/** Cómo quedó cada tanda, con las operaciones del campo (dominio del 23/10):
 *  descartar antes de introducir, introducir, cosechar (una vez) y pasar a
 *  banco. Nacimiento, madurez y fecundación no se cargan. */
type Historia = {
  tanda: string
  edad: number // días desde el traslarve
  cupulas: number // cuadros × CUPULAS_POR_CUADRO
  descartadasAntes: number
  introducidas: number
  cosechadas: number | null // null: todavía en el parque
  parque: number // índice del primer núcleo del parque
  nucleosDelParque: number
  primerId: number
}

const HISTORIAS: Historia[] = [
  // 2 cuadros, ya cosechada: 250 al parque, 220 enjauladas y 30 descartadas.
  {
    tanda: id(31),
    edad: 40,
    cupulas: 2 * CUPULAS_POR_CUADRO,
    descartadasAntes: 20,
    introducidas: 250,
    cosechadas: 220,
    parque: 0,
    nucleosDelParque: 15,
    primerId: 10_000,
  },
  // 3 cuadros, en el parque esperando la cosecha.
  {
    tanda: id(32),
    edad: 18,
    cupulas: 3 * CUPULAS_POR_CUADRO,
    descartadasAntes: 5,
    introducidas: 400,
    cosechadas: null,
    parque: 15,
    nucleosDelParque: 9,
    primerId: 11_000,
  },
  // 1 cuadro, recién traslarvada (carga retroactiva).
  {
    tanda: id(33),
    edad: 6,
    cupulas: CUPULAS_POR_CUADRO,
    descartadasAntes: 1,
    introducidas: 0,
    cosechadas: null,
    parque: 0,
    nucleosDelParque: 15,
    primerId: 12_000,
  },
]

const INTRODUCCION = 10 // ~D10
const COSECHA = 26 // ≈ D26 (I0+16)

/** Una fila por cúpula, como la base real. */
function celdasDe(h: Historia): Celda[] {
  return Array.from({ length: h.cupulas }, (_, i): Celda => {
    const base: Celda = {
      id: id(h.primerId + i),
      tenant_id: T,
      tanda_id: h.tanda,
      nucleo_id: null,
      estado: 'trasladada',
      fecha_introduccion: null,
      fecha_nacimiento: null,
      fecha_fecundacion: null,
      fecha_enjaulado: null,
      banco_id: null,
      fecha_descarte: null,
      fecha_extravio: null,
    }
    if (i < h.descartadasAntes)
      // Sin núcleo: nunca se introdujo.
      return {
        ...base,
        estado: 'descartada',
        fecha_descarte: diaAtras(h.edad - 9),
      }
    const n = i - h.descartadasAntes
    if (n >= h.introducidas) return base
    const enParque = {
      ...base,
      estado: 'introducida' as const,
      nucleo_id: nucleos[h.parque + (n % h.nucleosDelParque)].id,
      fecha_introduccion: diaAtras(h.edad - INTRODUCCION),
    }
    if (h.cosechadas === null) return enParque
    if (n < h.cosechadas)
      return {
        ...enParque,
        estado: 'enjaulada',
        fecha_enjaulado: diaAtras(h.edad - COSECHA),
        banco_id: BANCOS_IDS[n % 2],
      }
    // El resto de la cosecha: descartada, conserva el núcleo.
    return {
      ...enParque,
      estado: 'descartada',
      fecha_descarte: diaAtras(h.edad - COSECHA),
    }
  })
}

export const celdas: Celda[] = HISTORIAS.flatMap(celdasDe)

/** Celdas contadas por estado, como las devuelve el backend al leer. */
function porEstado(tandaId: string): Record<string, number> {
  const conteo: Record<string, number> = {}
  for (const c of celdas)
    if (c.tanda_id === tandaId) conteo[c.estado] = (conteo[c.estado] ?? 0) + 1
  return conteo
}

const TANDAS_BASE: Omit<Tanda, 'celdas' | 'celdas_por_estado'>[] = [
  {
    id: id(31),
    fecha_traslarve: diaAtras(40),
    madre_id: null,
    raza_id: id(1),
    retroactivo: false,
    fila_continuadora: 3,
    posicion_continuadora: 2,
  },
  {
    id: id(32),
    fecha_traslarve: diaAtras(18),
    madre_id: id(11),
    raza_id: id(2),
    retroactivo: false,
    fila_continuadora: 3,
    posicion_continuadora: 3,
  },
  {
    id: id(33),
    fecha_traslarve: diaAtras(6),
    madre_id: null,
    raza_id: id(1),
    retroactivo: true,
    fila_continuadora: null,
    posicion_continuadora: null,
  },
]

/** Tres tandas en momentos distintos: cosechada, en el parque y recién hecha. */
export const tandas: Tanda[] = TANDAS_BASE.map((t) => {
  const celdas_por_estado = porEstado(t.id)
  return {
    ...t,
    celdas_por_estado,
    celdas: Object.values(celdas_por_estado).reduce((a, b) => a + b, 0),
  }
})

/** Las reinas de cada banco se cuentan desde las celdas, como en el backend. */
export const bancos: Banco[] = BANCOS_IDS.map((bancoId, n) => ({
  id: bancoId,
  identificador: `B-0${n + 1}`,
  capacidad_max: 276,
  reinas_en_banco: celdas.filter(
    (c) => c.banco_id === bancoId && c.estado === 'enjaulada',
  ).length,
  activo: true,
}))

export const materiales: Material[] = [
  {
    id: id(41),
    nombre: 'Cúpula de cera',
    unidad: 'cúpulas',
    stock: '1230',
    activo: true,
  }, // el material es la cúpula suelta
  {
    id: id(42),
    nombre: 'Jaula de transporte',
    unidad: 'jaulas',
    stock: '0',
    activo: true,
  },
]

/** El backend devuelve la fecha como date (YYYY-MM-DD). */
const dia = (dias: number) => iso(dias).slice(0, 10)

export const movimientos: MovimientoMaterial[] = [
  {
    id: id(51),
    material_id: id(41),
    tipo: 'compra',
    cantidad: '2000',
    tanda_id: null,
    motivo: 'Compra a apícola San Ramón',
    fecha: dia(60),
  },
  {
    id: id(52),
    material_id: id(41),
    tipo: 'consumo',
    cantidad: String(-2 * CUPULAS_POR_CUADRO),
    tanda_id: id(31),
    motivo: null,
    fecha: dia(40),
  },
  {
    id: id(53),
    material_id: id(41),
    tipo: 'consumo',
    cantidad: String(-3 * CUPULAS_POR_CUADRO),
    tanda_id: id(32),
    motivo: null,
    fecha: dia(18),
  },
  {
    id: id(54),
    material_id: id(41),
    tipo: 'ajuste',
    cantidad: '40',
    tanda_id: null,
    motivo: 'Reconteo de stock físico',
    fecha: dia(10),
  },
  {
    id: id(55),
    material_id: id(41),
    tipo: 'consumo',
    cantidad: String(-CUPULAS_POR_CUADRO),
    tanda_id: id(33),
    motivo: null,
    fecha: dia(6),
  },
]

export const itemsVendibles: ItemVendible[] = [
  { id: id(91), nombre: 'Reina fecundada', alicuota: '0.21', activo: true },
  { id: id(92), nombre: 'Reina virgen', alicuota: '0.21', activo: true },
  { id: id(93), nombre: 'Celda real', alicuota: '0.21', activo: true },
]

export const clientes: Cliente[] = [
  {
    id: id(61),
    nombre: 'Apícola Don Emilio',
    pais: 'AR',
    tipo: 'nacional',
    condicion_iva: 'responsable_inscripto',
    cuit_o_tax_id: '20305211894',
    activo: true,
    tipo_documento_por_defecto: 'factura_a',
  },
  {
    id: id(62),
    nombre: 'Bee Kingdom NZ Ltd',
    pais: 'NZ',
    tipo: 'exportacion',
    condicion_iva: 'cliente_exterior',
    cuit_o_tax_id: 'NZ-9429038',
    activo: true,
    tipo_documento_por_defecto: 'factura_e',
  },
  // Dado de baja: en la demo se ve la factura B y el botón "Reactivar".
  {
    id: id(63),
    nombre: 'Miel del Delta',
    pais: 'AR',
    tipo: 'nacional',
    condicion_iva: 'monotributo',
    cuit_o_tax_id: '27234567891',
    activo: false,
    tipo_documento_por_defecto: 'factura_b',
  },
]

/** Cuatro pedidos para recorrer los estados: uno nacional para reservar y
 *  entregar entre los dos bancos, uno de exportación ya reservado, uno que
 *  no alcanza (Buckfast todavía no tiene reinas enjauladas) y uno cancelado
 *  desde borrador, sin reservas. */
const pedidosSinTotales: PedidoSinTotales[] = [
  {
    id: id(201),
    cliente_id: id(61),
    estado: 'borrador',
    moneda: 'ARS',
    destino_pais: null,
    incoterm: null,
    fecha_entrega_solicitada: dia(-10),
    items: [
      {
        id: id(211),
        numero_linea: 1,
        item_vendible_id: id(91),
        raza_id: id(1),
        cantidad: 20,
        precio_unitario: '45000.00',
        alicuota: '0.21',
      },
    ],
  },
  {
    id: id(202),
    cliente_id: id(62),
    estado: 'reservado',
    moneda: 'USD',
    destino_pais: 'NZ',
    incoterm: 'CPT',
    fecha_entrega_solicitada: dia(-21),
    items: [
      {
        id: id(212),
        numero_linea: 1,
        item_vendible_id: id(91),
        raza_id: id(1),
        cantidad: 50,
        precio_unitario: '38.50',
        alicuota: '0.21',
      },
    ],
  },
  {
    id: id(203),
    cliente_id: id(61),
    estado: 'borrador',
    moneda: 'ARS',
    destino_pais: null,
    incoterm: null,
    fecha_entrega_solicitada: dia(-30),
    items: [
      {
        id: id(213),
        numero_linea: 1,
        item_vendible_id: id(91),
        raza_id: id(2),
        cantidad: 30,
        precio_unitario: '42000.00',
        alicuota: '0.21',
      },
    ],
  },
  {
    id: id(204),
    cliente_id: id(61),
    estado: 'cancelado',
    moneda: 'ARS',
    destino_pais: null,
    incoterm: null,
    fecha_entrega_solicitada: dia(5),
    items: [
      {
        id: id(214),
        numero_linea: 1,
        item_vendible_id: id(93),
        raza_id: id(1),
        cantidad: 15,
        precio_unitario: '8000.00',
        alicuota: '0.21',
      },
    ],
  },
]

/** Con neto, IVA y total, como los devuelve el backend (#113). */
export const pedidos: Pedido[] = pedidosSinTotales.map(conTotales)

/** La reserva del pedido de exportación: una por línea, con su cantidad. */
export const reservas: Reserva[] = [
  {
    id: id(221),
    pedido_item_id: id(212),
    raza_id: id(1),
    cantidad: 50,
    estado: 'activa',
  },
]

export const comprobantes: Comprobante[] = [
  {
    id: id(71),
    tenant_id: T,
    tipo: 'E',
    cliente_id: id(62),
    punto_venta: 3,
    numero: 41,
    fecha_emision: iso(25),
    moneda: 'USD',
    importe: '4820.50',
    tipo_cambio: '1180.00',
    archivo_s3_key: 'documentos/tenant-a/factura-e-0003-00000041.pdf',
    cargado_por: 'admin@tenant-a.malka.test',
  },
  {
    id: id(72),
    tenant_id: T,
    tipo: 'A',
    cliente_id: id(61),
    punto_venta: 1,
    numero: 128,
    fecha_emision: iso(9),
    moneda: 'ARS',
    importe: '640500.00',
    tipo_cambio: null,
    archivo_s3_key: 'documentos/tenant-a/factura-a-0001-00000128.pdf',
    cargado_por: 'ventas@tenant-a.malka.test',
  },
]

// Fecha `date` del backend (YYYY-MM-DD), no un timestamp.
const fecha = (dias: number) => iso(dias).slice(0, 10)
// La key lleva el tenant en el prefijo, como exige el CHECK de la 0010.
const archivo = (nombre: string) => `documentos/${T}/${nombre}.pdf`

const NUMEROS_CHILE: Record<TipoDocumentoEmbarque, string> = {
  factura_e: 'E 0003-00000041',
  permiso_embarque: '26 001 EC01 004512 K',
  guia_aerea: '045-12345675',
  lista_empaque: 'LE-2026-031',
  dte: 'DTE-2026-118734',
  shipper_certificate: 'SC-2026-031',
}

/** Un envío directo (Chile, lo recibe el cliente) con los 6 documentos y uno
 *  consolidado (hub en España, se redistribuye por fuera) al que le faltan 4. */
export const documentosEmbarque: DocumentoEmbarque[] = [
  ...DOCUMENTOS_DEL_EMBARQUE.map((tipo, n) => ({
    id: id(83 + n),
    embarque_id: id(81),
    tipo,
    numero: NUMEROS_CHILE[tipo],
    archivo_s3_key: archivo(`chile-${tipo}`),
    fecha: fecha(4),
  })),
  {
    id: id(89),
    embarque_id: id(82),
    tipo: 'factura_e',
    numero: 'E 0003-00000044',
    archivo_s3_key: archivo('espana-factura-e'),
    fecha: fecha(1),
  },
  {
    id: id(90),
    embarque_id: id(82),
    tipo: 'lista_empaque',
    numero: 'LE-2026-034',
    archivo_s3_key: archivo('espana-lista-empaque'),
    fecha: fecha(1),
  },
]

const cargados = (embarque: string) =>
  documentosEmbarque.filter((d) => d.embarque_id === embarque).length

export const embarques: Embarque[] = [
  {
    id: id(81),
    destino_pais: 'CL',
    fecha_vuelo: fecha(3),
    awb: '045-12345675',
    estado: 'en_transito',
    documentos_cargados: cargados(id(81)),
  },
  {
    id: id(82),
    destino_pais: 'ES',
    fecha_vuelo: fecha(-12),
    awb: null,
    estado: 'en_preparacion',
    documentos_cargados: cargados(id(82)),
  },
]

export const DATOS_SIMULADOS = {
  bancos,
  itemsVendibles,
  tandas,
  celdas,
  parques,
  nucleos,
  razas,
  madres,
  materiales,
  movimientos,
  clientes,
  comprobantes,
  embarques,
  documentosEmbarque,
  pedidos,
  reservas,
}
