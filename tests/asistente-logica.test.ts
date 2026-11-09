// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Propuesta } from '../src/api/asistente'
import { asistenteHttp } from '../src/api/asistente'
import { ApiError, fijarProveedorDeToken } from '../src/api/client'
import {
  bloquesDelTexto,
  enlaceDelResultado,
  esPropuestaEjecutable,
  historialParaEnviar,
  MAX_CARACTERES,
} from '../src/lib/asistente'
import {
  errorAlConfirmar,
  errorAlConversar,
  guardarHistorial,
  leerHistorial,
  type MensajeDelChat,
} from '../src/modulos/asistente/conversacion'

const BASE = 'https://api.malka.test'
const PEDIDO = '00000201-0000-4000-8000-000000000201'

const propuesta = (cambios: Partial<Propuesta> = {}): Propuesta => ({
  id: '9b2f7a52-0c1e-4c55-9d7e-3f0a1b2c3d4e',
  accion: 'crear_pedido',
  metodo: 'POST',
  ruta: '/api/v1/pedidos',
  cuerpo: { cliente_id: 'c-1' },
  resumen: [{ etiqueta: 'Cliente', valor: 'Apícola Don Emilio' }],
  roles_permitidos: ['admin', 'ventas'],
  ...cambios,
})

function respuesta(status: number, cuerpo?: unknown) {
  return new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('historial que se manda al asistente', () => {
  it('recorta a los últimos 20 mensajes y cada texto a 2000 caracteres', () => {
    const mensajes = Array.from({ length: 25 }, (_, i) => ({
      rol: i % 2 === 0 ? ('usuario' as const) : ('asistente' as const),
      texto: i === 24 ? 'x'.repeat(2500) : `mensaje ${i}`,
    }))

    const enviados = historialParaEnviar(mensajes)

    expect(enviados).toHaveLength(20)
    expect(enviados[0].texto).toBe('mensaje 5')
    expect(enviados.at(-1)?.texto).toHaveLength(MAX_CARACTERES)
  })
})

describe('propuestas', () => {
  it('solo se ejecuta una escritura conocida con su ruta', () => {
    expect(esPropuestaEjecutable(propuesta())).toBe(true)
    expect(
      esPropuestaEjecutable(
        propuesta({
          accion: 'reservar_pedido',
          ruta: `/api/v1/pedidos/${PEDIDO}/reservas`,
          cuerpo: null,
        }),
      ),
    ).toBe(true)
    expect(esPropuestaEjecutable(propuesta({ ruta: '/api/v1/usuarios' }))).toBe(
      false,
    )
    expect(
      esPropuestaEjecutable(
        propuesta({ ruta: 'https://otro.test/api/v1/pedidos' }),
      ),
    ).toBe(false)
    expect(
      esPropuestaEjecutable(
        propuesta({
          accion: 'reservar_pedido',
          ruta: '/api/v1/pedidos/../clientes/reservas',
        }),
      ),
    ).toBe(false)
  })

  it('lleva a lo creado: pedido, tanda, cliente o el pedido del borrador', () => {
    expect(enlaceDelResultado(propuesta(), { id: 'p-9' })?.a).toBe(
      '/ventas/pedidos/p-9',
    )
    expect(
      enlaceDelResultado(
        propuesta({
          accion: 'reservar_pedido',
          ruta: `/api/v1/pedidos/${PEDIDO}/reservas`,
        }),
        [],
      )?.a,
    ).toBe(`/ventas/pedidos/${PEDIDO}`)
    expect(
      enlaceDelResultado(
        propuesta({ accion: 'crear_tanda', ruta: '/api/v1/tandas' }),
        { id: 't-1' },
      )?.a,
    ).toBe('/produccion/tandas/t-1')
    expect(
      enlaceDelResultado(
        propuesta({ accion: 'crear_cliente', ruta: '/api/v1/clientes' }),
        { id: 'c-1' },
      )?.a,
    ).toBe('/ventas/clientes/c-1')
    expect(
      enlaceDelResultado(
        propuesta({
          accion: 'pedir_borrador',
          ruta: '/api/v1/documentos/borradores',
          cuerpo: { pedido_id: PEDIDO },
        }),
        { id: 'b-1', pedido_id: PEDIDO },
      )?.a,
    ).toBe(`/ventas/pedidos/${PEDIDO}`)
  })
})

describe('texto del asistente', () => {
  it('arma párrafos y listas simples sin interpretar marcas', () => {
    expect(
      bloquesDelTexto(
        'Disponible por raza:\n- **Carniola**: 40\n- Buckfast: 0\n\nPasos:\n1. Uno\n2. Dos\n\nFin <b>x</b>',
      ),
    ).toEqual([
      { tipo: 'parrafo', texto: 'Disponible por raza:' },
      {
        tipo: 'lista',
        ordenada: false,
        items: ['Carniola: 40', 'Buckfast: 0'],
      },
      { tipo: 'parrafo', texto: 'Pasos:' },
      { tipo: 'lista', ordenada: true, items: ['Uno', 'Dos'] },
      { tipo: 'parrafo', texto: 'Fin <b>x</b>' },
    ])
  })
})

describe('errores', () => {
  it('429: el límite con los segundos de Retry-After', () => {
    const error = new ApiError({
      status: 429,
      codigo: 'limite_ia_por_minuto',
      mensaje: 'Demasiadas llamadas.',
      reintentarEn: 30,
    })
    expect(errorAlConversar(error)).toEqual({
      mensaje: 'Llegaste al límite de consultas, probá en 30 segundos.',
      reintentable: false,
    })
  })

  it('503 y sin conexión se pueden reintentar; un 422 no', () => {
    expect(
      errorAlConversar(
        new ApiError({
          status: 503,
          codigo: 'asistente_no_disponible',
          mensaje: 'x',
        }),
      ),
    ).toEqual({
      mensaje:
        'El asistente no está disponible ahora. Probá de nuevo en unos minutos.',
      reintentable: true,
    })
    expect(
      errorAlConversar(
        new ApiError({ codigo: 'sin_conexion', mensaje: 'Sin red.' }),
      ),
    ).toEqual({ mensaje: 'Sin red.', reintentable: true })
    expect(
      errorAlConversar(
        new ApiError({
          status: 422,
          codigo: 'validacion',
          mensaje: 'Muy largo.',
        }),
      ).reintentable,
    ).toBe(false)
  })

  it('al confirmar, un 409 o 422 se muestra sin código; lo inesperado, con código', () => {
    expect(
      errorAlConfirmar(
        new ApiError({
          status: 409,
          codigo: 'stock_insuficiente',
          mensaje: 'No alcanza.',
        }),
      ),
    ).toEqual({ mensaje: 'No alcanza.' })
    expect(
      errorAlConfirmar(
        new ApiError({
          status: 500,
          codigo: 'error_interno',
          mensaje: 'Falló.',
        }),
      ),
    ).toEqual({ mensaje: 'Falló.', codigo: 'error_interno' })
  })
})

describe('historial en sessionStorage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    sessionStorage.clear()
  })

  it('guarda y restaura; una propuesta que quedó confirmando vuelve a pendiente', () => {
    const historial: MensajeDelChat[] = [
      { id: '1', rol: 'usuario', texto: 'hola' },
      {
        id: '2',
        rol: 'asistente',
        texto: 'chau',
        consultas: [],
        propuestas: [{ propuesta: propuesta(), estado: 'confirmando' }],
      },
    ]
    guardarHistorial('clave', historial)

    const leido = leerHistorial('clave')

    expect(leido[0]).toEqual(historial[0])
    expect(leido[1].rol === 'asistente' && leido[1].propuestas[0].estado).toBe(
      'pendiente',
    )
  })

  it('si sessionStorage falla o tiene basura, sigue con el historial vacío', () => {
    sessionStorage.setItem('clave', '{no es json')
    expect(leerHistorial('clave')).toEqual([])
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('cuota')
    })
    expect(leerHistorial('clave')).toEqual([])
    expect(() =>
      guardarHistorial('clave', [{ id: '1', rol: 'usuario', texto: 'x' }]),
    ).not.toThrow()
  })
})

describe('asistenteHttp', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', BASE)
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    fijarProveedorDeToken(() => 'token-del-usuario')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    fijarProveedorDeToken(() => null)
  })

  it('conversa con POST /api/v1/asistente y el historial', async () => {
    fetchMock.mockResolvedValue(
      respuesta(200, { texto: 'Hola', consultas: [], propuestas: [] }),
    )

    await asistenteHttp().conversar([{ rol: 'usuario', texto: 'hola' }])

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE}/api/v1/asistente`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({
      mensajes: [{ rol: 'usuario', texto: 'hola' }],
    })
  })

  it('confirmar llama a la ruta con el token y la Idempotency-Key = id', async () => {
    fetchMock.mockResolvedValue(respuesta(201, { id: 'p-1' }))
    const p = propuesta()

    await asistenteHttp().confirmar(p)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const headers = new Headers(init.headers)
    expect(url).toBe(`${BASE}/api/v1/pedidos`)
    expect(init.method).toBe('POST')
    expect(headers.get('Idempotency-Key')).toBe(p.id)
    expect(headers.get('Authorization')).toBe('Bearer token-del-usuario')
    expect(JSON.parse(String(init.body))).toEqual(p.cuerpo)
  })

  it('reservar un pedido va sin cuerpo', async () => {
    fetchMock.mockResolvedValue(respuesta(201, []))

    await asistenteHttp().confirmar(
      propuesta({
        accion: 'reservar_pedido',
        ruta: `/api/v1/pedidos/${PEDIDO}/reservas`,
        cuerpo: null,
      }),
    )

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE}/api/v1/pedidos/${PEDIDO}/reservas`)
    expect(init.body).toBeUndefined()
  })

  it('una propuesta con una ruta desconocida no llama a la red', async () => {
    const error = await asistenteHttp()
      .confirmar(propuesta({ ruta: '/api/v1/usuarios' }))
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('asistente simulado', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DATOS_SIMULADOS', 'true')
    vi.resetModules()
  })
  afterEach(() => vi.unstubAllEnvs())

  it('responde la disponibilidad con la consulta que hizo', async () => {
    const { asistenteSimulado } = await import('../src/api/asistenteSimulado')

    const r = await asistenteSimulado({ demoraMs: 0 }).conversar([
      { rol: 'usuario', texto: '¿Qué disponibilidad hay de Carniola?' },
    ])

    expect(r.consultas).toEqual([
      {
        tool: 'ver_disponibilidad',
        resumen: 'Consulté la disponibilidad (Carniola)',
      },
    ])
    expect(r.texto).toMatch(/Carniola: \d+ reinas?/)
    expect(r.propuestas).toEqual([])
  })

  it('propone un pedido y confirmarlo lo crea en la API simulada, una sola vez', async () => {
    const { asistenteSimulado } = await import('../src/api/asistenteSimulado')
    const { pedidos } = await import('../src/api/pedidos')
    const api = asistenteSimulado({ demoraMs: 0 })

    const r = await api.conversar([
      { rol: 'usuario', texto: 'Crear un pedido de 12 reinas Buckfast' },
    ])
    const [p] = r.propuestas
    expect(p.accion).toBe('crear_pedido')
    expect(p.resumen).toContainEqual({
      etiqueta: 'Línea 1',
      valor: '12 reinas Buckfast (Reina fecundada) a 15000.00 ARS c/u',
    })

    const antes = (await pedidos.listar()).items.length
    const creado = (await api.confirmar(p)) as { id: string }
    const otraVez = (await api.confirmar(p)) as { id: string }

    expect(otraVez.id).toBe(creado.id)
    expect((await pedidos.listar()).items).toHaveLength(antes + 1)
    expect((await pedidos.obtener(creado.id)).items[0].cantidad).toBe(12)
  })
})
