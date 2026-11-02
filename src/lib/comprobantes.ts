/** Reglas de los comprobantes transcriptos (backend #108): las de
 *  app/services/facturacion/comprobantes.py y app/schemas/comprobantes.py.
 *  El sistema NO emite: letra, punto de venta, número, moneda, importe y
 *  tipo de cambio se copian del comprobante de ARCA. Acá adelantan el error
 *  en el formulario y la API simulada las usa para comportarse como la
 *  real. El backend valida igual: si cambia una regla allá, se cambia acá. */
import { hoyEnArgentina } from '@/lib/fechas'
import { formatearImporte } from '@/lib/importes'
import type {
  Cliente,
  ComprobanteCrear,
  Moneda,
  TipoComprobante,
} from '@/tipos/dominio'

export const LETRAS: readonly TipoComprobante[] = ['A', 'B', 'E']

/** Topes de ARCA: punto de venta de hasta 5 dígitos y número de hasta 8
 *  (los mismos que los CHECK de la migración 0014). */
export const PUNTO_VENTA_MAXIMO = 99_999
export const NUMERO_MAXIMO = 99_999_999

/** letra_esperada del backend: exterior E, responsable inscripto A, resto B.
 *  Es una sugerencia para transcribir: la letra real es la del PDF. */
export function letraEsperada(
  cliente: Pick<Cliente, 'tipo' | 'condicion_iva'>,
): TipoComprobante {
  if (cliente.tipo === 'exportacion') return 'E'
  if (cliente.condicion_iva === 'responsable_inscripto') return 'A'
  return 'B'
}

/** La E va en USD o EUR; la A y la B, en pesos (no hay ventas nacionales en
 *  moneda extranjera, dominio del 11/10). */
export function monedasDeLaLetra(letra: TipoComprobante): readonly Moneda[] {
  return letra === 'E' ? ['USD', 'EUR'] : ['ARS']
}

/** "0001-00000045": el relleno con ceros es solo para mostrar. Un punto de
 *  venta de 5 dígitos se ve con sus 5. */
export function numeroImpreso(puntoVenta: number, numero: number): string {
  return `${String(puntoVenta).padStart(4, '0')}-${String(numero).padStart(8, '0')}`
}

/** "Factura A 0001-00000045", como figura en el PDF. */
export function nombreDeComprobante(
  c: Pick<ComprobanteCrear, 'tipo' | 'punto_venta' | 'numero'>,
): string {
  return `Factura ${c.tipo} ${numeroImpreso(c.punto_venta, c.numero)}`
}

/** El entero tal como se escribe: solo dígitos ("0001" es 1), o null. */
export function leerEntero(valor: string): number | null {
  const limpio = valor.trim()
  return /^\d{1,9}$/.test(limpio) ? Number(limpio) : null
}

function errorDeEntero(
  valor: string,
  maximo: number,
  nombre: string,
): string | null {
  const n = leerEntero(valor)
  if (n === null)
    return `El ${nombre} es un número entero, sin guiones ni letras.`
  if (n < 1) return `El ${nombre} tiene que ser mayor a 0.`
  if (n > maximo)
    return `El ${nombre} admite hasta ${String(maximo).length} dígitos.`
  return null
}

export const errorDePuntoDeVenta = (valor: string) =>
  errorDeEntero(valor, PUNTO_VENTA_MAXIMO, 'punto de venta')

export const errorDeNumero = (valor: string) =>
  errorDeEntero(valor, NUMERO_MAXIMO, 'número')

/** Un decimal escrito a mano como lo espera el backend ("1500.50"), o null.
 *  Con coma, la coma es el decimal y los puntos son de miles ("1.500,50");
 *  sin coma, el punto es el decimal. Siempre texto: un float pierde
 *  centavos. Tiene que ser mayor a 0. */
export function normalizarDecimal(
  valor: string,
  { enteros, decimales }: { enteros: number; decimales: number },
): string | null {
  const limpio = valor.trim().replace(/\s/g, '')
  const conPunto = limpio.includes(',')
    ? limpio.replace(/\./g, '').replace(',', '.')
    : limpio
  const forma = new RegExp(`^\\d{1,${enteros}}(\\.\\d{1,${decimales}})?$`)
  if (!forma.test(conPunto) || !/[1-9]/.test(conPunto)) return null
  return conPunto
}

/** Numeric(14, 2) del importe y Numeric(16, 6) del tipo de cambio. */
const IMPORTE = { enteros: 12, decimales: 2 }
const TIPO_DE_CAMBIO = { enteros: 10, decimales: 6 }

export const normalizarImporte = (valor: string) =>
  normalizarDecimal(valor, IMPORTE)
export const normalizarTipoDeCambio = (valor: string) =>
  normalizarDecimal(valor, TIPO_DE_CAMBIO)

export function errorDeImporte(valor: string): string | null {
  if (!valor.trim()) return 'Transcribí el importe total del comprobante.'
  return normalizarImporte(valor)
    ? null
    : 'El importe es un número mayor a 0 con hasta 2 decimales (p. ej. 640.500,00).'
}

export function errorDeTipoDeCambio(valor: string): string | null {
  if (!valor.trim()) return 'Transcribí el tipo de cambio del comprobante.'
  return normalizarTipoDeCambio(valor)
    ? null
    : 'El tipo de cambio es un número mayor a 0 con hasta 6 decimales (p. ej. 1180,50).'
}

export function errorDeFechaDeEmision(
  fecha: string,
  hoy: string = hoyEnArgentina(),
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return 'Elegí la fecha de emisión.'
  if (fecha > hoy) return 'La fecha de emisión no puede ser futura.'
  return null
}

/** El model_validator de ComprobanteCrear: lo que depende de la propia fila
 *  (fecha, moneda y tipo de cambio). El primer problema, o null. Mismo
 *  orden que el backend, así el mensaje coincide con el 422. */
export function errorDeComprobante(
  datos: Pick<
    ComprobanteCrear,
    'tipo' | 'fecha_emision' | 'moneda' | 'tipo_cambio'
  >,
  hoy: string = hoyEnArgentina(),
): string | null {
  if (datos.fecha_emision > hoy)
    return 'La fecha de emisión no puede ser futura.'
  const enPesos = datos.moneda === 'ARS'
  const conTipoDeCambio =
    datos.tipo_cambio !== undefined && datos.tipo_cambio !== null
  if (enPesos && conTipoDeCambio)
    return 'Un comprobante en pesos no lleva tipo de cambio.'
  if (!enPesos && !conTipoDeCambio)
    return `Falta el tipo de cambio de ${datos.moneda}.`
  if ((datos.tipo === 'E') === enPesos)
    return 'La factura E va en USD o EUR; la A y la B, en pesos.'
  return null
}

/** "1180.000000" → "1.180,00"; "1180.125" → "1.180,125": los ceros de más
 *  de la columna Numeric(16, 6) no se muestran, pero siempre dos decimales. */
export function formatearTipoDeCambio(valor: string): string {
  const [enteros, decimales = ''] = valor.trim().split('.')
  const significativos = decimales.replace(/0+$/, '')
  if (significativos.length <= 2) return formatearImporte(valor)
  const conMiles = enteros.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${conMiles},${significativos}`
}
