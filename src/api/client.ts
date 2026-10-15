/** Cliente HTTP único (issue #5). Habla el contrato del backend:
 *  - errores: { error: { code, message, details, request_id } } (backend #24)
 *  - request_id también en el header x-request-id (expuesto por CORS)
 *  - altas con Idempotency-Key (24 h, docs/dominio.md del backend)
 *  - Authorization: Bearer <token> cuando hay sesión (#6). */

export type Detalles = Record<string, unknown>

export class ApiError extends Error {
  readonly status: number | null
  readonly codigo: string
  readonly mensaje: string
  readonly requestId: string | null
  readonly detalles: Detalles

  constructor({
    mensaje,
    codigo,
    status = null,
    requestId = null,
    detalles = {},
  }: {
    mensaje: string
    codigo: string
    status?: number | null
    requestId?: string | null
    detalles?: Detalles
  }) {
    super(mensaje)
    this.name = 'ApiError'
    this.mensaje = mensaje
    this.codigo = codigo
    this.status = status
    this.requestId = requestId
    this.detalles = detalles
  }
}

export function esApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

export type ErrorParaMostrar = {
  codigo?: string
  mensaje: string
  requestId?: string | null
}

/** Lo que una pantalla muestra de un error cualquiera (ApiError o no). */
export function describirError(error: unknown): ErrorParaMostrar {
  if (esApiError(error)) {
    return {
      codigo: error.codigo,
      mensaje: error.mensaje,
      requestId: error.requestId,
    }
  }
  return { mensaje: error instanceof Error ? error.message : 'Algo falló.' }
}

type ProveedorDeToken = () => string | null | Promise<string | null>
let proveedorDeToken: ProveedorDeToken = () => null

/** El módulo de sesión (#6) registra acá cómo obtener el JWT vigente. */
export function fijarProveedorDeToken(proveedor: ProveedorDeToken): void {
  proveedorDeToken = proveedor
}

export type Metodo = 'GET' | 'POST' | 'PATCH' | 'DELETE'
export type Query = Record<string, string | number | boolean | null | undefined>

export type OpcionesDeRequest = {
  metodo?: Metodo
  cuerpo?: unknown
  query?: Query
  /** Para reintentar la MISMA alta: si no se pasa, cada POST genera una. */
  claveIdempotencia?: string
  senal?: AbortSignal
  timeoutMs?: number
}

const TIMEOUT_MS = 15_000

function urlBase(): string {
  const base = import.meta.env.VITE_API_BASE_URL
  if (!base) {
    throw new ApiError({
      codigo: 'sin_configuracion',
      mensaje: 'Falta configurar VITE_API_BASE_URL en el archivo .env.',
    })
  }
  return base.replace(/\/+$/, '')
}

function armarUrl(path: string, query?: Query): string {
  const params = new URLSearchParams()
  for (const [clave, valor] of Object.entries(query ?? {})) {
    if (valor !== undefined && valor !== null && valor !== '')
      params.append(clave, String(valor))
  }
  const qs = params.toString()
  return `${urlBase()}${path}${qs ? `?${qs}` : ''}`
}

async function armarHeaders(opciones: OpcionesDeRequest): Promise<Headers> {
  const headers = new Headers({ Accept: 'application/json' })
  const token = await proveedorDeToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (opciones.cuerpo !== undefined)
    headers.set('Content-Type', 'application/json')
  if (opciones.metodo === 'POST') {
    headers.set(
      'Idempotency-Key',
      opciones.claveIdempotencia ?? crypto.randomUUID(),
    )
  }
  return headers
}

type CuerpoDeError = {
  error?: {
    code?: string
    message?: string
    details?: Detalles
    request_id?: string
  }
}

async function errorDesdeRespuesta(respuesta: Response): Promise<ApiError> {
  const requestIdHeader = respuesta.headers.get('x-request-id')
  let cuerpo: CuerpoDeError = {}
  try {
    cuerpo = (await respuesta.json()) as CuerpoDeError
  } catch {
    // No es JSON del backend (API Gateway, CloudFront): queda el genérico.
  }
  const error = cuerpo.error
  return new ApiError({
    status: respuesta.status,
    codigo: error?.code ?? `http_${respuesta.status}`,
    mensaje:
      error?.message ?? `La API respondió con el estado ${respuesta.status}.`,
    requestId: error?.request_id ?? requestIdHeader,
    detalles: error?.details ?? {},
  })
}

export async function request<T>(
  path: string,
  opciones: OpcionesDeRequest = {},
): Promise<T> {
  const url = armarUrl(path, opciones.query)
  const timeout = AbortSignal.timeout(opciones.timeoutMs ?? TIMEOUT_MS)
  const senal = opciones.senal
    ? AbortSignal.any([opciones.senal, timeout])
    : timeout

  let respuesta: Response
  try {
    respuesta = await fetch(url, {
      method: opciones.metodo ?? 'GET',
      headers: await armarHeaders(opciones),
      body:
        opciones.cuerpo === undefined
          ? undefined
          : JSON.stringify(opciones.cuerpo),
      signal: senal,
    })
  } catch (error) {
    if (timeout.aborted) {
      throw new ApiError({
        codigo: 'tiempo_agotado',
        mensaje: 'La API tardó demasiado en responder.',
      })
    }
    if (error instanceof DOMException && error.name === 'AbortError')
      throw error
    throw new ApiError({
      codigo: 'sin_conexion',
      mensaje:
        'No se pudo conectar con la API. Revisá la conexión e intentá de nuevo.',
    })
  }

  if (!respuesta.ok) throw await errorDesdeRespuesta(respuesta)
  if (respuesta.status === 204) return undefined as T
  return (await respuesta.json()) as T
}
