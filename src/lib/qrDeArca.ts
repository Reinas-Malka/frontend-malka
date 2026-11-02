/** El código QR de las facturas electrónicas de ARCA (RG 4892): una URL
 *  https://www.afip.gob.ar/fe/qr/?p=<base64> (o arca.gob.ar) cuyo parámetro
 *  p es un JSON con los datos del comprobante. Acá solo se lee y se valida:
 *  lo que sale de acá completa el formulario de alta, pero lo confirma la
 *  persona (el sistema no emite, transcribe). Sin React ni pdf.js: la
 *  extracción del texto del QR está en documentos/leerQrDelPdf.ts. */
import {
  NUMERO_MAXIMO,
  PUNTO_VENTA_MAXIMO,
  normalizarImporte,
  normalizarTipoDeCambio,
} from '@/lib/comprobantes'
import type { Moneda, TipoComprobante } from '@/tipos/dominio'

/** Lo que el formulario puede tomar del QR, con los nombres del backend
 *  donde los hay. tipo y moneda son null si el QR trae uno que el sistema
 *  no carga (una nota de crédito, otra moneda). */
export type DatosDelQr = {
  tipo: TipoComprobante | null
  punto_venta: number
  numero: number
  /** AAAA-MM-DD, tal cual lo trae el QR. */
  fecha_emision: string
  moneda: Moneda | null
  /** Con 2 decimales y punto ("4820.50"), como lo espera el backend. */
  importe: string
  /** Solo fuera de pesos; null en ARS o si el QR no lo trae. */
  tipo_cambio: string | null
  /** CUIT del emisor (la cabaña). */
  cuit_emisor: string
  /** El documento del receptor, solo dígitos: sirve para buscar al cliente. */
  documento_receptor: string | null
}

export type MotivoDeQrInvalido =
  /** El QR no es el de una factura de ARCA (otra URL u otro texto). */
  | 'no_es_de_arca'
  /** El parámetro p no es base64 o no es un JSON. */
  | 'ilegible'
  /** El JSON no trae los datos mínimos o vienen con otra forma. */
  | 'incompleto'

export type LecturaDelQr =
  | { valido: true; datos: DatosDelQr; avisos: string[] }
  | { valido: false; motivo: MotivoDeQrInvalido }

/** codTipoCmp de ARCA → la letra que carga el sistema (A, B y E). */
const LETRA_POR_TIPO: Readonly<Record<number, TipoComprobante>> = {
  1: 'A',
  6: 'B',
  19: 'E',
}

/** Códigos de moneda de ARCA → ISO 4217. */
const MONEDA_POR_CODIGO: Readonly<Record<string, Moneda>> = {
  PES: 'ARS',
  DOL: 'USD',
  '060': 'EUR',
}

export const AVISO_OTRO_TIPO =
  'Este comprobante es una nota de crédito u otro tipo; por ahora se cargan facturas A, B y E.'
export const AVISO_OTRA_MONEDA =
  'La moneda del comprobante no es pesos, dólares ni euros: elegila a mano.'

const DOMINIOS_DE_ARCA = ['afip.gob.ar', 'arca.gob.ar'] as const

const esDeArca = (url: URL) =>
  url.protocol === 'https:' &&
  DOMINIOS_DE_ARCA.some(
    (d) => url.hostname === d || url.hostname.endsWith(`.${d}`),
  ) &&
  url.pathname.startsWith('/fe/qr')

/** El base64 del parámetro p a texto UTF-8, o null. Acepta base64url y
 *  falta de relleno; un "+" que la query convirtió en espacio vuelve a ser
 *  "+". */
export function decodificarBase64(valor: string): string | null {
  const limpio = valor
    .trim()
    .replace(/ /g, '+')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  if (!limpio || !/^[A-Za-z0-9+/]+={0,2}$/.test(limpio)) return null
  const relleno = limpio.replace(/=+$/, '')
  if (relleno.length % 4 === 1) return null
  const conRelleno = relleno.padEnd(Math.ceil(relleno.length / 4) * 4, '=')
  try {
    const binario = atob(conRelleno)
    const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0))
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

/** Un entero positivo, venga como número o como texto de dígitos. */
function entero(valor: unknown): number | null {
  if (typeof valor === 'number')
    return Number.isSafeInteger(valor) && valor > 0 ? valor : null
  if (typeof valor === 'string' && /^\d{1,15}$/.test(valor.trim())) {
    const n = Number(valor.trim())
    return n > 0 ? n : null
  }
  return null
}

/** Un número decimal del JSON (o texto con punto) como texto sin floats
 *  raros: hasta `decimales` decimales. */
function decimal(valor: unknown, decimales: number): string | null {
  if (typeof valor === 'number' && Number.isFinite(valor) && valor > 0)
    return valor.toFixed(decimales)
  if (typeof valor === 'string' && /^\d+(\.\d+)?$/.test(valor.trim()))
    return Number(valor.trim()).toFixed(decimales)
  return null
}

/** "1180.000000" → "1180"; "1180.125000" → "1180.125". */
const sinCerosDeMas = (valor: string) =>
  valor.includes('.') ? valor.replace(/\.?0+$/, '') : valor

const FECHA = /^\d{4}-\d{2}-\d{2}$/

/** Lee el JSON ya decodificado. Exige lo mínimo para completar una
 *  factura: fecha, punto de venta, número, tipo, importe y moneda. */
export function leerDatosDelQr(json: unknown): LecturaDelQr {
  if (typeof json !== 'object' || json === null || Array.isArray(json))
    return { valido: false, motivo: 'incompleto' }
  const d = json as Record<string, unknown>

  const fecha = typeof d.fecha === 'string' ? d.fecha.trim() : ''
  const puntoVenta = entero(d.ptoVta)
  const numero = entero(d.nroCmp)
  const tipoCmp = entero(d.tipoCmp)
  const importeTexto = decimal(d.importe, 2)
  const importe = importeTexto ? normalizarImporte(importeTexto) : null
  const codigoMoneda = typeof d.moneda === 'string' ? d.moneda.trim() : ''
  if (
    !FECHA.test(fecha) ||
    puntoVenta === null ||
    puntoVenta > PUNTO_VENTA_MAXIMO ||
    numero === null ||
    numero > NUMERO_MAXIMO ||
    tipoCmp === null ||
    importe === null ||
    !codigoMoneda
  )
    return { valido: false, motivo: 'incompleto' }

  const avisos: string[] = []
  const tipo = LETRA_POR_TIPO[tipoCmp] ?? null
  if (!tipo) avisos.push(AVISO_OTRO_TIPO)
  const moneda = MONEDA_POR_CODIGO[codigoMoneda.toUpperCase()] ?? null
  if (!moneda) avisos.push(AVISO_OTRA_MONEDA)

  const cotizacion = decimal(d.ctz, 6)
  const tipoCambio =
    moneda && moneda !== 'ARS' && cotizacion
      ? normalizarTipoDeCambio(sinCerosDeMas(cotizacion))
      : null

  const receptor = entero(d.nroDocRec)
  return {
    valido: true,
    avisos,
    datos: {
      tipo,
      punto_venta: puntoVenta,
      numero,
      fecha_emision: fecha,
      moneda,
      importe,
      tipo_cambio: tipoCambio,
      cuit_emisor: entero(d.cuit)?.toString() ?? '',
      documento_receptor: receptor === null ? null : String(receptor),
    },
  }
}

/** El texto completo del QR (la URL) → los datos de la factura. */
export function leerQrDeArca(texto: string): LecturaDelQr {
  let url: URL
  try {
    url = new URL(texto.trim())
  } catch {
    return { valido: false, motivo: 'no_es_de_arca' }
  }
  if (!esDeArca(url)) return { valido: false, motivo: 'no_es_de_arca' }

  const p = url.searchParams.get('p')
  const json = p ? decodificarBase64(p) : null
  if (json === null) return { valido: false, motivo: 'ilegible' }
  try {
    return leerDatosDelQr(JSON.parse(json))
  } catch {
    return { valido: false, motivo: 'ilegible' }
  }
}
