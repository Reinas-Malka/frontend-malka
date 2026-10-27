/** Datos de ejemplo verosímiles del negocio (docs/dominio.md del backend).
 *  Tandas de 270/405 celdas (2-3 cuadros de 135), razas reales, parques en
 *  predios distintos y fechas que respetan el ciclo: traslarve D0, introducción
 *  ~D10, nacimiento D11, fecundación nac+10, enjaulado I0+16. */
import {
  CUPULAS_POR_CUADRO,
  type Banco,
  type Celda,
  type Cliente,
  DOCUMENTOS_DEL_EMBARQUE,
  type Comprobante,
  type DocumentoEmbarque,
  type Embarque,
  type EstadoCelda,
  type ItemVendible,
  type Madre,
  type Material,
  type MovimientoMaterial,
  type Nucleo,
  type Parque,
  type Raza,
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

/** Tres tandas en momentos distintos del ciclo (traslarve = 5/10 hacia atrás). */
export const tandas: Tanda[] = [
  {
    id: id(31),
    tenant_id: T,
    fecha_traslarve: iso(40),
    madre_id: null,
    raza_id: id(1),
    retroactivo: false,
    fila_continuadora: 3,
    posicion_continuadora: 2,
  }, // 2 cuadros → 270
  {
    id: id(32),
    tenant_id: T,
    fecha_traslarve: iso(18),
    madre_id: null,
    raza_id: id(2),
    retroactivo: false,
    fila_continuadora: 3,
    posicion_continuadora: 3,
  }, // 3 cuadros → 405
  {
    id: id(33),
    tenant_id: T,
    fecha_traslarve: iso(6),
    madre_id: null,
    raza_id: id(1),
    retroactivo: true,
    fila_continuadora: null,
    posicion_continuadora: null,
  }, // 1 cuadro → 135
]

const POR_TANDA: Record<string, number> = {
  [id(31)]: 270,
  [id(32)]: 405,
  [id(33)]: 135,
}
/** Primer id de cada tanda: bloques de 1000, más que la tanda más grande. */
const PRIMER_ID: Record<string, number> = {
  [id(31)]: 10_000,
  [id(32)]: 11_000,
  [id(33)]: 12_000,
}

/** Dos bancos: las reinas enjauladas se reparten entre ellos (dominio 16/10). */
const BANCOS_IDS = [id(95), id(96)]

/** Estados coherentes con la antigüedad de cada tanda. */
function celdasDe(tandaId: string, edadDias: number): Celda[] {
  // Una fila por cúpula, como la base real (decenas por tanda, dominio D).
  const total = POR_TANDA[tandaId]
  return Array.from({ length: total }, (_, i) => {
    const introducida = edadDias >= 10
    const nacida = edadDias >= 11
    const resuelta = edadDias >= 21 // nac+10
    const enjaulada = edadDias >= 26 // I0+16
    let estado: EstadoCelda = 'trasladada'
    if (edadDias < 8 && i === 0)
      estado = 'descartada' // no operculó
    else if (enjaulada && i % 9 !== 0) estado = 'enjaulada'
    else if (resuelta && i % 9 === 0 && i % 2 === 0) estado = 'fecundada'
    else if (resuelta && i % 9 === 0)
      estado = 'extraviada' // no volvió del vuelo nupcial
    else if (nacida) estado = 'madura'
    else if (introducida) estado = 'introducida'
    const nucleo =
      introducida && estado !== 'descartada'
        ? nucleos[(i + 3) % nucleos.length].id
        : null
    return {
      id: id(PRIMER_ID[tandaId] + i),
      tenant_id: T,
      tanda_id: tandaId,
      nucleo_id: nucleo,
      estado,
      fecha_introduccion: introducida ? iso(edadDias - 10) : null,
      fecha_nacimiento: nacida ? iso(edadDias - 11) : null,
      fecha_fecundacion:
        estado === 'fecundada' || estado === 'enjaulada'
          ? iso(edadDias - 21)
          : null,
      fecha_enjaulado: estado === 'enjaulada' ? iso(edadDias - 26) : null,
      banco_id: estado === 'enjaulada' ? BANCOS_IDS[i % 2] : null,
      fecha_descarte: estado === 'descartada' ? iso(edadDias - 5) : null,
      fecha_extravio: estado === 'extraviada' ? iso(edadDias - 21) : null,
    }
  })
}

export const celdas: Celda[] = [
  ...celdasDe(id(31), 40),
  ...celdasDe(id(32), 18),
  ...celdasDe(id(33), 6),
]

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
    stock: '1365',
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
}
