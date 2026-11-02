/** Comprobantes transcriptos: Factura A, B y E (backend #108). No es un
 *  catálogo: no tiene PATCH ni baja (lo transcripto es inmutable). Mismo
 *  esquema que api/embarques.ts: dos implementaciones con la misma firma y
 *  un solo swap por VITE_DATOS_SIMULADOS. */
import { ApiError, esApiError, request } from '@/api/client'
import type { Pagina } from '@/api/recurso'
import { clientes } from '@/api/recursos'
import { usaDatosSimulados } from '@/datos/cliente'
import { DATOS_SIMULADOS } from '@/datos/simulados'
import {
  NUMERO_MAXIMO,
  PUNTO_VENTA_MAXIMO,
  errorDeComprobante,
  letraEsperada,
  normalizarImporte,
  normalizarTipoDeCambio,
} from '@/lib/comprobantes'
import { hoyEnArgentina } from '@/lib/fechas'
import type { Cliente, Comprobante, ComprobanteCrear } from '@/tipos/dominio'

export type FiltrosDeComprobantes = { cliente_id?: string }

export interface ApiComprobantes {
  /** De la emisión más nueva a la más vieja, de a una página. */
  listar(
    filtros?: FiltrosDeComprobantes,
    cursor?: string,
  ): Promise<Pagina<Comprobante>>
  obtener(id: string): Promise<Comprobante>
  crear(
    datos: ComprobanteCrear,
    claveIdempotencia?: string,
  ): Promise<Comprobante>
}

const RUTA = '/api/v1/comprobantes'
/** Crecen sin tope: se piden de a una página ("Cargar más"). */
export const LIMITE_COMPROBANTES = 50

export function comprobantesHttp(): ApiComprobantes {
  return {
    listar: (filtros = {}, cursor) =>
      request<Pagina<Comprobante>>(RUTA, {
        query: { ...filtros, limite: LIMITE_COMPROBANTES, cursor },
      }),
    obtener: (id) => request<Comprobante>(`${RUTA}/${encodeURIComponent(id)}`),
    crear: (datos, claveIdempotencia) =>
      request<Comprobante>(RUTA, {
        metodo: 'POST',
        cuerpo: datos,
        claveIdempotencia,
      }),
  }
}

/** ArchivoS3 de app/schemas/embarques.py: la key bajo el prefijo del criadero. */
const CLAVE_DE_ARCHIVO = /^documentos\/[0-9a-f-]{36}\/[A-Za-z0-9._/-]+$/

const validacion = (codigo: string, mensaje: string, detalles = {}) =>
  new ApiError({ status: 422, codigo, mensaje, detalles })

/** Un 422 de Pydantic: details.campos con la ruta del campo, como el
 *  manejador de app/errores.py. */
const deCampo = (campo: string, mensaje: string) =>
  validacion('validacion', 'Los datos enviados no son validos.', {
    campos: [{ campo: `body.${campo}`, mensaje, tipo: 'value_error' }],
  })

/** El schema ComprobanteCrear: formato y coherencia de la propia fila. */
function validarFormato(datos: ComprobanteCrear, hoy: string) {
  const entero = (valor: number, maximo: number) =>
    Number.isInteger(valor) && valor >= 1 && valor <= maximo
  if (!entero(datos.punto_venta, PUNTO_VENTA_MAXIMO))
    throw deCampo('punto_venta', 'Punto de venta fuera de rango.')
  if (!entero(datos.numero, NUMERO_MAXIMO))
    throw deCampo('numero', 'Número fuera de rango.')
  if (!normalizarImporte(String(datos.importe)))
    throw deCampo('importe', 'Importe inválido.')
  if (
    datos.tipo_cambio !== undefined &&
    datos.tipo_cambio !== null &&
    !normalizarTipoDeCambio(String(datos.tipo_cambio))
  )
    throw deCampo('tipo_cambio', 'Tipo de cambio inválido.')
  if (!CLAVE_DE_ARCHIVO.test(datos.archivo_s3_key))
    throw deCampo('archivo_s3_key', 'Key de archivo inválida.')
  const incoherente = errorDeComprobante(datos, hoy)
  if (incoherente) throw validacion('validacion', incoherente)
}

type Semilla = {
  comprobantes?: readonly Comprobante[]
  /** El cliente del criadero, o undefined si no existe. */
  cliente?: (id: string) => Promise<Cliente | undefined>
  /** Si el PDF quedó subido en el criadero (la tabla documento). */
  archivoSubido?: (clave: string) => boolean
  hoy?: () => string
}

const clienteDeLaSemilla = async (id: string) =>
  DATOS_SIMULADOS.clientes.find((c) => c.id === id)

/** En memoria para la demo sin backend. Repite las reglas del schema y del
 *  repositorio_comprobantes del backend, en el mismo orden, así la pantalla
 *  se comporta igual que con la API: 422 cliente_inexistente,
 *  letra_incoherente (con details.esperada) y archivo_inexistente, y 409
 *  comprobante_duplicado. */
export function comprobantesSimulados({
  comprobantes: semilla = DATOS_SIMULADOS.comprobantes,
  cliente = clienteDeLaSemilla,
  archivoSubido = (clave) => CLAVE_DE_ARCHIVO.test(clave),
  hoy = hoyEnArgentina,
}: Semilla = {}): ApiComprobantes {
  let comprobantes = semilla.map((c) => ({ ...c }))
  // Como el backend: solo se guarda lo que salió bien, así que después de
  // un error la misma clave vuelve a intentar.
  const porClave = new Map<string, Comprobante>()

  // ORDER BY fecha_emision DESC, id DESC.
  const ordenados = () =>
    [...comprobantes].sort(
      (a, b) =>
        b.fecha_emision.localeCompare(a.fecha_emision) ||
        b.id.localeCompare(a.id),
    )

  return {
    listar: async ({ cliente_id } = {}, cursor) => {
      const filtrados = ordenados().filter(
        (c) => !cliente_id || c.cliente_id === cliente_id,
      )
      const desde = cursor ? Number(cursor) : 0
      const hasta = desde + LIMITE_COMPROBANTES
      return {
        items: filtrados.slice(desde, hasta),
        siguiente: hasta < filtrados.length ? String(hasta) : null,
      }
    },
    obtener: async (id) => {
      const comprobante = comprobantes.find((c) => c.id === id)
      if (!comprobante)
        throw new ApiError({
          status: 404,
          codigo: 'comprobante_no_encontrado',
          mensaje: 'No existe el comprobante.',
        })
      return comprobante
    },
    crear: async (datos, clave) => {
      const previa = clave ? porClave.get(clave) : undefined
      if (previa) return previa

      validarFormato(datos, hoy())
      const delCriadero = await cliente(datos.cliente_id)
      // Un cliente dado de baja conserva su facturación: solo importa que exista.
      if (!delCriadero)
        throw validacion('cliente_inexistente', 'No existe el cliente.')
      const esperada = letraEsperada(delCriadero)
      if (datos.tipo !== esperada)
        throw validacion(
          'letra_incoherente',
          `A este cliente ARCA le emite factura ${esperada}, no ${datos.tipo}.`,
          { esperada },
        )
      if (!archivoSubido(datos.archivo_s3_key))
        throw validacion(
          'archivo_inexistente',
          'El archivo no esta subido en este criadero.',
        )
      if (
        comprobantes.some(
          (c) =>
            c.tipo === datos.tipo &&
            c.punto_venta === datos.punto_venta &&
            c.numero === datos.numero,
        )
      )
        throw new ApiError({
          status: 409,
          codigo: 'comprobante_duplicado',
          mensaje:
            'Ya hay un comprobante con ese tipo, punto de venta y numero.',
        })

      const nuevo: Comprobante = {
        id: crypto.randomUUID(),
        tipo: datos.tipo,
        cliente_id: datos.cliente_id,
        punto_venta: datos.punto_venta,
        numero: datos.numero,
        fecha_emision: datos.fecha_emision,
        moneda: datos.moneda,
        importe: String(datos.importe),
        tipo_cambio:
          datos.tipo_cambio === undefined || datos.tipo_cambio === null
            ? null
            : String(datos.tipo_cambio),
        archivo_s3_key: datos.archivo_s3_key,
        cargado_por: 'demo@malka.test',
        creado_en: new Date().toISOString(),
      }
      comprobantes = [...comprobantes, nuevo]
      if (clave) porClave.set(clave, nuevo)
      return nuevo
    },
  }
}

/** El catálogo de clientes de las pantallas como fuente: un cliente dado de
 *  alta en la demo ya puede tener comprobantes. El 404 es "no existe". */
async function clienteDelCatalogo(id: string): Promise<Cliente | undefined> {
  try {
    return await clientes.obtener(id)
  } catch (error) {
    if (esApiError(error) && error.status === 404) return undefined
    throw error
  }
}

export const comprobantes: ApiComprobantes = usaDatosSimulados(
  import.meta.env.VITE_DATOS_SIMULADOS,
)
  ? comprobantesSimulados({ cliente: clienteDelCatalogo })
  : comprobantesHttp()
