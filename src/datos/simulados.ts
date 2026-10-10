/** Datos de ejemplo verosímiles del negocio (docs/dominio.md del backend).
 *  Tandas de 270/405 celdas (2-3 cuadros de 135), razas reales, parques en
 *  predios distintos y fechas que respetan el ciclo: traslarve D0, introducción
 *  ~D10, nacimiento D11, fecundación nac+10, enjaulado I0+16. */
import { CUPULAS_POR_CUADRO, type Celda, type Cliente, type Comprobante, type Embarque, type EstadoCelda, type Madre, type Material, type MovimientoMaterial, type Nucleo, type Parque, type Raza, type Tanda } from '@/tipos/dominio'

const iso = (dias: number) => {
  const d = new Date('2026-10-05T09:00:00Z')
  d.setUTCDate(d.getUTCDate() - dias)
  return d.toISOString()
}

const T = '11111111-1111-4111-8111-111111111111' // tenant A (demo)
const id = (n: number) => `${n.toString().padStart(8, '0')}-0000-4000-8000-${n.toString().padStart(12, '0')}`

export const razas: Raza[] = [
  { id: id(1), tenant_id: T, nombre: 'Carniola', descripcion: 'Api mellifera carnica — dócil, alta fecundación', activo: true },
  { id: id(2), tenant_id: T, nombre: 'Buckfast', descripcion: 'Híbrida productiva, behavior tranquilo', activo: true },
  { id: id(3), tenant_id: T, nombre: 'Italiana', descripcion: 'Ligustica — precoz para polinización temprana', activo: true },
]

export const madres: Madre[] = [
  { id: id(11), tenant_id: T, identificacion: 'A-12', activo: true },
  { id: id(12), tenant_id: T, identificacion: 'A-07', activo: true },
  { id: id(13), tenant_id: T, identificacion: 'B-03', activo: true },
]

export const parques: Parque[] = [
  { id: id(21), tenant_id: T, nombre: 'Parque La Loma', ubicacion: 'Predio Las Violetas, km 12', capacidad_max: 60, activo: true },
  { id: id(22), tenant_id: T, nombre: 'Parque Monte Chico', ubicacion: 'Predio El Durazno, camino viejo a Tandil', capacidad_max: 40, activo: true },
]

export const nucleos: Nucleo[] = Array.from({ length: 24 }, (_, i) => ({
  id: id(100 + i),
  tenant_id: T,
  parque_id: i < 15 ? id(21) : id(22),
  fila: Math.floor((i % 15) / 3) + 1,
  posicion: (i % 3) + 1,
  activo: true,
}))

/** Tres tandas en momentos distintos del ciclo (traslarve = 5/10 hacia atrás). */
export const tandas: Tanda[] = [
  { id: id(31), tenant_id: T, fecha_traslarve: iso(40), madre_id: id(11), raza_id: id(1), retroactivo: false }, // 2 cuadros → 270
  { id: id(32), tenant_id: T, fecha_traslarve: iso(18), madre_id: id(12), raza_id: id(2), retroactivo: false }, // 3 cuadros → 405
  { id: id(33), tenant_id: T, fecha_traslarve: iso(6), madre_id: id(13), raza_id: id(1), retroactivo: true }, // 1 cuadro → 135
]

const POR_TANDA: Record<string, number> = { [id(31)]: 270, [id(32)]: 405, [id(33)]: 135 }

/** Estados coherentes con la antigüedad de cada tanda (por muestra de 12 celdas
 *  por tanda en la demo; la base real tiene una fila por cúpula). */
function celdasDe(tandaId: string, edadDias: number): Celda[] {
  // Una fila por cúpula, como la base real (decenas por tanda, dominio D).
  const total = POR_TANDA[tandaId]
  return Array.from({ length: total }, (_, i) => {
    const introducida = edadDias >= 10
    const nacida = edadDias >= 11
    const resuelta = edadDias >= 21 // nac+10
    const enjaulada = edadDias >= 26 // I0+16
    let estado: EstadoCelda = 'trasladada'
    if (edadDias < 8 && i === 0) estado = 'descartada' // no operculó
    else if (enjaulada && i % 9 !== 0) estado = 'enjaulada'
    else if (resuelta && i % 9 === 0 && i % 2 === 0) estado = 'fecundada'
    else if (resuelta && i % 9 === 0) estado = 'extraviada' // no volvió del vuelo nupcial
    else if (nacida) estado = 'madura'
    else if (introducida) estado = 'introducida'
    const nucleo = introducida && estado !== 'descartada' ? nucleos[(i + 3) % nucleos.length].id : null
    return {
      id: id(5000 + Number(tandaId.slice(0, 4)) + i),
      tenant_id: T,
      tanda_id: tandaId,
      nucleo_id: nucleo,
      estado,
      fecha_introduccion: introducida ? iso(edadDias - 10) : null,
      fecha_nacimiento: nacida ? iso(edadDias - 11) : null,
      fecha_fecundacion: estado === 'fecundada' || estado === 'enjaulada' ? iso(edadDias - 21) : null,
      fecha_enjaulado: estado === 'enjaulada' ? iso(edadDias - 26) : null,
    }
  })
}

export const celdas: Celda[] = [...celdasDe(id(31), 40), ...celdasDe(id(32), 18), ...celdasDe(id(33), 6)]

export const materiales: Material[] = [
  { id: id(41), tenant_id: T, nombre: 'Cúpula de cera', unidad: 'cúpulas' }, // el material es la cúpula suelta
  { id: id(42), tenant_id: T, nombre: 'Jaula de transporte', unidad: 'jaulas' },
]

export const movimientos: MovimientoMaterial[] = [
  { id: id(51), tenant_id: T, material_id: id(41), tipo: 'compra', cantidad: 2000, motivo: 'Compra a apícola San Ramón', ocurrido_en: iso(60) },
  { id: id(52), tenant_id: T, material_id: id(41), tipo: 'consumo', cantidad: -2 * CUPULAS_POR_CUADRO, motivo: 'Tanda ' + id(31).slice(0, 8), ocurrido_en: iso(40) },
  { id: id(53), tenant_id: T, material_id: id(41), tipo: 'consumo', cantidad: -3 * CUPULAS_POR_CUADRO, motivo: 'Tanda ' + id(32).slice(0, 8), ocurrido_en: iso(18) },
  { id: id(54), tenant_id: T, material_id: id(41), tipo: 'ajuste', cantidad: 40, motivo: 'Reconteo de stock físico', ocurrido_en: iso(10) },
]

export const clientes: Cliente[] = [
  { id: id(61), nombre: 'Apícola Don Emilio', pais: 'AR', tipo: 'nacional', condicion_iva: 'responsable_inscripto', cuit_o_tax_id: '20305211894', activo: true },
  { id: id(62), nombre: 'Bee Kingdom NZ Ltd', pais: 'NZ', tipo: 'exportacion', condicion_iva: 'exterior', cuit_o_tax_id: 'NZ-9429038', activo: true },
]

export const comprobantes: Comprobante[] = [
  { id: id(71), tenant_id: T, tipo: 'E', cliente_id: id(62), punto_venta: 3, numero: 41, fecha_emision: iso(25), moneda: 'USD', importe: '4820.50', tipo_cambio: '1180.00', archivo_s3_key: 'documentos/tenant-a/factura-e-0003-00000041.pdf', cargado_por: 'admin@tenant-a.malka.test' },
  { id: id(72), tenant_id: T, tipo: 'A', cliente_id: id(61), punto_venta: 1, numero: 128, fecha_emision: iso(9), moneda: 'ARS', importe: '640500.00', tipo_cambio: null, archivo_s3_key: 'documentos/tenant-a/factura-a-0001-00000128.pdf', cargado_por: 'ventas@tenant-a.malka.test' },
]

export const embarques: Embarque[] = [
  { id: id(81), tenant_id: T, destino_pais: 'Nueva Zelanda', fecha_vuelo: iso(22), awb: '081-12345675', estado: 'en_transito' },
]

export const DATOS_SIMULADOS = {
  tandas, celdas, parques, nucleos, razas, madres, materiales, movimientos, clientes, comprobantes, embarques,
}
