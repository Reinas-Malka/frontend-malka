import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, fijarProveedorDeToken, request } from '../src/api/client'

const BASE = 'https://api.malka.test'

function respuesta(
  status: number,
  cuerpo?: unknown,
  headers: Record<string, string> = {},
) {
  return new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', `${BASE}/`)
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  fijarProveedorDeToken(() => null)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('request', () => {
  it('arma la URL con la base sin barra final y los parámetros de consulta', async () => {
    fetchMock.mockResolvedValue(respuesta(200, { items: [], siguiente: null }))

    await request('/api/v1/razas', {
      query: { limite: 20, cursor: undefined, q: 'a b' },
    })

    expect(fetchMock.mock.calls[0][0]).toBe(
      `${BASE}/api/v1/razas?limite=20&q=a+b`,
    )
  })

  it('lee el formato único de errores del backend con su request_id', async () => {
    fetchMock.mockResolvedValue(
      respuesta(422, {
        error: {
          code: 'validacion',
          message: 'El nombre es obligatorio.',
          details: { campo: 'nombre' },
          request_id: 'req-123',
        },
      }),
    )

    const error = await request('/api/v1/razas').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 422,
      codigo: 'validacion',
      mensaje: 'El nombre es obligatorio.',
      requestId: 'req-123',
      detalles: { campo: 'nombre' },
    })
  })

  it('toma el request_id del header si el cuerpo no es del backend', async () => {
    fetchMock.mockResolvedValue(
      new Response('Bad gateway', {
        status: 502,
        headers: { 'x-request-id': 'gw-9' },
      }),
    )

    const error = await request('/health').catch((e: unknown) => e)

    expect(error).toMatchObject({
      status: 502,
      codigo: 'http_502',
      requestId: 'gw-9',
    })
  })

  it('distingue la falta de conexión de un error del backend', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    const error = await request('/health').catch((e: unknown) => e)

    expect(error).toMatchObject({ status: null, codigo: 'sin_conexion' })
  })

  it('manda el token del proveedor en Authorization', async () => {
    fijarProveedorDeToken(() => 'jwt-de-prueba')
    fetchMock.mockResolvedValue(respuesta(200, {}))

    await request('/api/v1/razas')

    const headers = new Headers(fetchMock.mock.calls[0][1].headers)
    expect(headers.get('Authorization')).toBe('Bearer jwt-de-prueba')
  })

  it('las altas llevan Idempotency-Key y el cuerpo en JSON', async () => {
    fetchMock.mockResolvedValue(respuesta(201, { id: '1' }))

    await request('/api/v1/razas', {
      metodo: 'POST',
      cuerpo: { nombre: 'Carniola' },
    })

    const [, init] = fetchMock.mock.calls[0]
    const headers = new Headers(init.headers)
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"nombre":"Carniola"}')
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('reusa la clave de idempotencia que le pasan (reintento del mismo alta)', async () => {
    fetchMock.mockResolvedValue(respuesta(201, { id: '1' }))

    await request('/api/v1/razas', {
      metodo: 'POST',
      cuerpo: {},
      claveIdempotencia: 'k-1',
    })

    expect(
      new Headers(fetchMock.mock.calls[0][1].headers).get('Idempotency-Key'),
    ).toBe('k-1')
  })

  it('un 204 no intenta leer cuerpo', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    await expect(
      request('/api/v1/razas/1', { metodo: 'DELETE' }),
    ).resolves.toBeUndefined()
  })

  it('sin VITE_API_BASE_URL falla con un error de configuración claro', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '')

    await expect(request('/health')).rejects.toMatchObject({
      codigo: 'sin_configuracion',
    })
  })
})
