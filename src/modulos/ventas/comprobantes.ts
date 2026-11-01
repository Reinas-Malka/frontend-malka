/** Ventas: lo de las pantallas de comprobantes (backend #108). Las reglas
 *  que copian al backend están en lib/comprobantes.ts; acá va el estado del
 *  formulario de alta, su validación y cómo cae cada error del backend en
 *  su campo. */
import { esApiError } from '@/api/client'
import type { FiltrosDeComprobantes } from '@/api/comprobantes'
import type { Errores } from '@/components/catalogo/campos'
import {
  errorDeFechaDeEmision,
  errorDeImporte,
  errorDeNumero,
  errorDePuntoDeVenta,
  errorDeTipoDeCambio,
  leerEntero,
  letraEsperada,
  monedasDeLaLetra,
  normalizarImporte,
  numeroImpreso,
  normalizarTipoDeCambio,
} from '@/lib/comprobantes'
import { MONEDAS_POR_TIPO } from '@/lib/pedidos'
import type {
  Cliente,
  ComprobanteCrear,
  Moneda,
  TipoComprobante,
} from '@/tipos/dominio'

export const CLAVE_COMPROBANTES = 'comprobantes'

/** Los filtros del listado viven en la URL (?cliente=): se pueden compartir. */
export function leerFiltrosDeComprobantes(
  params: URLSearchParams,
): FiltrosDeComprobantes {
  return { cliente_id: params.get('cliente') || undefined }
}

/** El comprobante como lo edita el formulario: los números en texto, como
 *  en el <input>. Los nombres son los del backend, así un 422 de Pydantic
 *  cae en su campo sin traducir nada. '' es "sin elegir". */
export type BorradorDeComprobante = {
  cliente_id: string
  tipo: TipoComprobante | ''
  punto_venta: string
  numero: string
  fecha_emision: string
  moneda: Moneda
  importe: string
  tipo_cambio: string
}

export type CampoDeComprobante = keyof BorradorDeComprobante | 'archivo'

export const BORRADOR_VACIO: BorradorDeComprobante = {
  cliente_id: '',
  tipo: '',
  punto_venta: '',
  numero: '',
  fecha_emision: '',
  moneda: 'ARS',
  importe: '',
  tipo_cambio: '',
}

/** Las monedas que admite el cliente: ARS en ventas nacionales; USD o EUR
 *  en exportación. */
export const monedasDelCliente = (
  cliente: Cliente | undefined,
): readonly Moneda[] => (cliente ? MONEDAS_POR_TIPO[cliente.tipo] : ['ARS'])

/** Al elegir el cliente se sugiere la letra (se puede cambiar: la real es
 *  la del PDF) y la moneda toma lo que admite su tipo. */
export function borradorParaCliente(
  actual: BorradorDeComprobante,
  cliente: Cliente,
): BorradorDeComprobante {
  const monedas = monedasDelCliente(cliente)
  const moneda = monedas.includes(actual.moneda) ? actual.moneda : monedas[0]
  return {
    ...actual,
    cliente_id: cliente.id,
    tipo: letraEsperada(cliente),
    moneda,
    tipo_cambio: moneda === 'ARS' ? '' : actual.tipo_cambio,
  }
}

/** Lo que el formulario puede marcar antes de subir el PDF. */
export function validarComprobante(
  borrador: BorradorDeComprobante,
  cliente: Cliente | undefined,
  archivo: File | null,
): Errores {
  const errores: Errores = {}
  const marcar = (campo: CampoDeComprobante, error: string | null) => {
    if (error) errores[campo] = error
  }
  marcar('cliente_id', cliente ? null : 'Elegí el cliente.')
  marcar('tipo', borrador.tipo ? null : 'Elegí la letra del comprobante.')
  marcar('punto_venta', errorDePuntoDeVenta(borrador.punto_venta))
  marcar('numero', errorDeNumero(borrador.numero))
  marcar('fecha_emision', errorDeFechaDeEmision(borrador.fecha_emision))
  marcar('importe', errorDeImporte(borrador.importe))
  if (borrador.moneda !== 'ARS')
    marcar('tipo_cambio', errorDeTipoDeCambio(borrador.tipo_cambio))
  if (
    borrador.tipo &&
    !monedasDeLaLetra(borrador.tipo).includes(borrador.moneda)
  )
    marcar(
      'tipo',
      borrador.tipo === 'E'
        ? 'La factura E va en USD o EUR: este cliente factura en pesos.'
        : `La factura ${borrador.tipo} va en pesos: este cliente factura en moneda extranjera.`,
    )
  marcar('archivo', errorDeArchivo(archivo))
  return errores
}

const TAMANO_MAXIMO_MB = 10

/** El comprobante va en PDF, el que descarga ARCA al emitir. */
export function errorDeArchivo(archivo: File | null): string | null {
  if (!archivo) return 'Adjuntá el PDF del comprobante.'
  if (archivo.type !== 'application/pdf')
    return 'El comprobante va en PDF, como lo descargás de ARCA.'
  if (archivo.size > TAMANO_MAXIMO_MB * 1024 * 1024)
    return `El PDF supera el máximo de ${TAMANO_MAXIMO_MB} MB.`
  return null
}

/** El cuerpo del POST. Solo después de validarComprobante: los números ya
 *  son válidos. */
export function aComprobanteCrear(
  borrador: BorradorDeComprobante,
  archivoS3Key: string,
): ComprobanteCrear {
  const enPesos = borrador.moneda === 'ARS'
  return {
    tipo: borrador.tipo as TipoComprobante,
    cliente_id: borrador.cliente_id,
    punto_venta: leerEntero(borrador.punto_venta)!,
    numero: leerEntero(borrador.numero)!,
    fecha_emision: borrador.fecha_emision,
    moneda: borrador.moneda,
    // Texto, no número: un float pierde centavos.
    importe: normalizarImporte(borrador.importe)!,
    tipo_cambio: enPesos ? null : normalizarTipoDeCambio(borrador.tipo_cambio),
    archivo_s3_key: archivoS3Key,
  }
}

/** Errores de negocio que van en un campo, con un mensaje para quien
 *  transcribe (nunca el código). */
function porCodigo(
  codigo: string,
  detalles: Record<string, unknown>,
  datos: ComprobanteCrear,
): Partial<Record<CampoDeComprobante, string>> {
  switch (codigo) {
    case 'cliente_inexistente':
      return { cliente_id: 'Ese cliente ya no existe. Elegí otro.' }
    case 'letra_incoherente': {
      const esperada =
        typeof detalles.esperada === 'string' ? detalles.esperada : null
      return {
        tipo: esperada
          ? `A este cliente ARCA le emite factura ${esperada}, no ${datos.tipo}. Revisá la letra del PDF o el cliente.`
          : 'La letra no corresponde a este cliente. Revisá el PDF.',
      }
    }
    case 'archivo_inexistente':
      return {
        archivo: 'El PDF no quedó subido. Elegilo de nuevo y volvé a guardar.',
      }
    case 'comprobante_duplicado':
      return {
        numero: `Ya está cargada la factura ${datos.tipo} ${numeroImpreso(datos.punto_venta, datos.numero)}. Revisá el número en el PDF.`,
      }
    default:
      return {}
  }
}

const CAMPOS: readonly string[] = [
  'cliente_id',
  'tipo',
  'punto_venta',
  'numero',
  'fecha_emision',
  'moneda',
  'importe',
  'tipo_cambio',
]

/** Un error del POST repartido en los campos del formulario: los de negocio
 *  por su código y el 422 de Pydantic por su ruta (body.numero). Si queda
 *  vacío, el error va entero arriba de los botones. */
export function erroresDelAlta(
  error: unknown,
  datos: ComprobanteCrear,
): Errores {
  if (!esApiError(error)) return {}
  const errores: Errores = { ...porCodigo(error.codigo, error.detalles, datos) }

  const campos = error.detalles.campos
  if (Array.isArray(campos))
    for (const { campo, mensaje } of campos as {
      campo?: unknown
      mensaje?: unknown
    }[]) {
      const ruta = String(campo ?? '').replace(/^body\./, '')
      const destino = ruta === 'archivo_s3_key' ? 'archivo' : ruta
      if (CAMPOS.includes(ruta) || destino === 'archivo')
        errores[destino] ??= String(mensaje ?? 'Valor inválido.')
    }
  return errores
}

const PREFIJO_DE_PYDANTIC = /^Value error, /

/** Lo que va arriba de los botones cuando el error no es de un campo. El
 *  422 de la coherencia de la fila (fecha, moneda y tipo de cambio) llega
 *  con la ruta "body": su mensaje dice qué falló, el general no. */
export function mensajeDelAlta(error: unknown): string {
  if (!esApiError(error)) return 'No se pudo cargar el comprobante.'
  const campos = error.detalles.campos
  if (Array.isArray(campos)) {
    const deLaFila = (campos as { campo?: unknown; mensaje?: unknown }[]).find(
      (c) => c.campo === 'body' && typeof c.mensaje === 'string',
    )
    if (deLaFila)
      return String(deLaFila.mensaje).replace(PREFIJO_DE_PYDANTIC, '')
  }
  return error.mensaje
}
