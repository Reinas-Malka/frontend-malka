// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  asistenteHttp,
  type ApiAsistente,
  type Propuesta,
  type RespuestaAsistente,
} from '../src/api/asistente'
import { ApiError } from '../src/api/client'
import type { Rol } from '../src/auth/identidad'
import { ProveedorDeSesionFijo } from '../src/auth/sesion'
import { BotonAsistente } from '../src/modulos/asistente/BotonAsistente'
import { claveDelHistorial } from '../src/modulos/asistente/conversacion'
import PanelAsistente from '../src/modulos/asistente/PanelAsistente'

const BASE = 'https://api.malka.test'
const EMAIL = 'x@malka.test'
const TENANT = '11111111-1111-4111-8111-111111111111'

const propuesta = (cambios: Partial<Propuesta> = {}): Propuesta => ({
  id: '9b2f7a52-0c1e-4c55-9d7e-3f0a1b2c3d4e',
  accion: 'crear_pedido',
  metodo: 'POST',
  ruta: '/api/v1/pedidos',
  cuerpo: { cliente_id: 'c-1' },
  resumen: [
    { etiqueta: 'Cliente', valor: 'Apícola Don Emilio' },
    {
      etiqueta: 'Línea 1',
      valor: '10 reinas Buckfast (Reina fecundada) a 15000.00 ARS c/u',
    },
  ],
  roles_permitidos: ['admin', 'ventas'],
  ...cambios,
})

const conPropuesta: RespuestaAsistente = {
  texto: 'Te armé el pedido.',
  consultas: [
    {
      tool: 'ver_disponibilidad',
      resumen: 'Consulté la disponibilidad (Buckfast)',
    },
    { tool: 'buscar_clientes', resumen: 'Busqué el cliente' },
  ],
  propuestas: [propuesta()],
}

function apiFalsa() {
  return {
    conversar: vi.fn<ApiAsistente['conversar']>(),
    confirmar: vi.fn<ApiAsistente['confirmar']>(),
  }
}

function Proveedores({
  roles,
  children,
}: {
  roles: Rol[]
  children: ReactNode
}) {
  return (
    <ProveedorDeSesionFijo
      identidad={{ email: EMAIL, roles, tenantId: TENANT }}
    >
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { mutations: { retry: false } } })
        }
      >
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    </ProveedorDeSesionFijo>
  )
}

function abrirPanel(api: ApiAsistente, roles: Rol[] = ['ventas']) {
  const alCerrar = vi.fn()
  render(
    <Proveedores roles={roles}>
      <PanelAsistente abierto alCerrar={alCerrar} api={api} />
    </Proveedores>,
  )
  return { alCerrar }
}

async function escribirYEnviar(texto: string) {
  const usuario = userEvent.setup()
  await usuario.type(
    screen.getByLabelText('Mensaje para el asistente'),
    `${texto}{Enter}`,
  )
  return usuario
}

beforeEach(() => sessionStorage.clear())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('panel del asistente', () => {
  it('manda el mensaje con Enter, muestra Pensando… y la respuesta', async () => {
    const api = apiFalsa()
    let responder: (r: RespuestaAsistente) => void = () => {}
    api.conversar.mockReturnValue(new Promise((listo) => (responder = listo)))
    abrirPanel(api)

    await escribirYEnviar('¿Qué disponibilidad hay?')

    expect(api.conversar).toHaveBeenCalledWith([
      { rol: 'usuario', texto: '¿Qué disponibilidad hay?' },
    ])
    expect(screen.getByRole('status')).toHaveProperty(
      'textContent',
      'Pensando…',
    )
    expect(screen.getByLabelText('Mensaje para el asistente')).toHaveProperty(
      'value',
      '',
    )
    responder({ texto: 'Hay 40 Carniola.', consultas: [], propuestas: [] })
    const log = screen.getByRole('log')
    expect(await within(log).findByText('Hay 40 Carniola.')).toBeTruthy()
    expect(screen.queryByText('Pensando…')).toBeNull()
    expect(log.getAttribute('aria-live')).toBe('polite')
  })

  it('Shift+Enter baja de línea sin enviar', async () => {
    const api = apiFalsa()
    abrirPanel(api)
    const usuario = userEvent.setup()
    const campo = screen.getByLabelText('Mensaje para el asistente')

    await usuario.type(campo, 'uno{Shift>}{Enter}{/Shift}dos')

    expect(campo).toHaveProperty('value', 'uno\ndos')
    expect(api.conversar).not.toHaveBeenCalled()
  })

  it('muestra las consultas como chips y la propuesta con su resumen', async () => {
    const api = apiFalsa()
    api.conversar.mockResolvedValue(conPropuesta)
    abrirPanel(api)

    await escribirYEnviar('crear pedido')

    const chips = await screen.findByRole('list', { name: 'Lo que consultó' })
    expect(
      within(chips).getByText('Consulté la disponibilidad (Buckfast)'),
    ).toBeTruthy()
    expect(within(chips).getByText('Busqué el cliente')).toBeTruthy()
    const tarjeta = screen.getByRole('article', { name: 'Crear pedido' })
    expect(within(tarjeta).getByText('Cliente')).toBeTruthy()
    expect(within(tarjeta).getByText('Apícola Don Emilio')).toBeTruthy()
    expect(
      within(tarjeta).getByText(
        '10 reinas Buckfast (Reina fecundada) a 15000.00 ARS c/u',
      ),
    ).toBeTruthy()
    expect(
      screen.getByText(
        'El asistente propone; nada se guarda hasta que confirmás.',
      ),
    ).toBeTruthy()
  })

  it('confirmar llama a la ruta con Idempotency-Key = id, una sola vez, y enlaza lo creado', async () => {
    vi.stubEnv('VITE_API_BASE_URL', BASE)
    let terminarAlta: (r: Response) => void = () => {}
    const fetchMock = vi.fn((url: string) =>
      url.endsWith('/api/v1/asistente')
        ? Promise.resolve(Response.json(conPropuesta))
        : new Promise<Response>((listo) => (terminarAlta = listo)),
    )
    vi.stubGlobal('fetch', fetchMock)
    abrirPanel(asistenteHttp())
    const usuario = await escribirYEnviar('crear pedido')
    const tarjeta = await screen.findByRole('article', { name: 'Crear pedido' })
    const confirmar = within(tarjeta).getByRole('button', { name: 'Confirmar' })

    await usuario.click(confirmar)
    await usuario.click(confirmar)
    await usuario.dblClick(confirmar)

    const altas = fetchMock.mock.calls.filter(
      ([url]) => url === `${BASE}/api/v1/pedidos`,
    )
    expect(altas).toHaveLength(1)
    const init = (
      fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    )[1]
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe(
      propuesta().id,
    )
    expect(JSON.parse(String(init.body))).toEqual({ cliente_id: 'c-1' })

    terminarAlta(Response.json({ id: 'p-77' }, { status: 201 }))
    const enlace = await within(tarjeta).findByRole('link', {
      name: 'Ver el pedido',
    })
    expect(enlace.getAttribute('href')).toBe('/ventas/pedidos/p-77')
    expect(within(tarjeta).getByText('Confirmada')).toBeTruthy()
    expect(
      within(tarjeta).queryByRole('button', { name: 'Confirmar' }),
    ).toBeNull()
    expect(
      within(tarjeta).queryByRole('button', { name: 'Descartar' }),
    ).toBeNull()
  })

  it('si falla, muestra el error claro y el reintento usa la misma propuesta', async () => {
    const api = apiFalsa()
    api.conversar.mockResolvedValue(conPropuesta)
    api.confirmar
      .mockRejectedValueOnce(
        new ApiError({
          status: 409,
          codigo: 'stock_insuficiente',
          mensaje: 'No alcanzan las reinas.',
        }),
      )
      .mockResolvedValueOnce({ id: 'p-1' })
    abrirPanel(api)
    const usuario = await escribirYEnviar('crear pedido')
    const tarjeta = await screen.findByRole('article', { name: 'Crear pedido' })

    await usuario.click(
      within(tarjeta).getByRole('button', { name: 'Confirmar' }),
    )

    const alerta = await within(tarjeta).findByRole('alert')
    expect(alerta.textContent).toContain('No alcanzan las reinas.')
    expect(alerta.textContent).not.toContain('stock_insuficiente')
    await usuario.click(
      within(tarjeta).getByRole('button', { name: 'Reintentar' }),
    )
    expect(await within(tarjeta).findByText('Confirmada')).toBeTruthy()
    expect(api.confirmar).toHaveBeenCalledTimes(2)
    expect(api.confirmar.mock.calls[1][0].id).toBe(
      api.confirmar.mock.calls[0][0].id,
    )
  })

  it('sin ninguno de los roles permitidos, Confirmar está deshabilitado y explica por qué', async () => {
    const api = apiFalsa()
    api.conversar.mockResolvedValue(conPropuesta)
    abrirPanel(api, ['lectura'])

    await escribirYEnviar('crear pedido')

    const tarjeta = await screen.findByRole('article', { name: 'Crear pedido' })
    const confirmar = within(tarjeta).getByRole('button', { name: 'Confirmar' })
    expect(confirmar).toHaveProperty('disabled', true)
    expect(
      within(tarjeta).getByText(/Tu rol no puede confirmarla/).textContent,
    ).toContain('Administración o Ventas')
    expect(confirmar.getAttribute('aria-describedby')).toBeTruthy()
  })

  it('descartar cierra la propuesta sin llamar a la API', async () => {
    const api = apiFalsa()
    api.conversar.mockResolvedValue(conPropuesta)
    abrirPanel(api)
    const usuario = await escribirYEnviar('crear pedido')
    const tarjeta = await screen.findByRole('article', { name: 'Crear pedido' })

    await usuario.click(
      within(tarjeta).getByRole('button', { name: 'Descartar' }),
    )

    expect(
      within(tarjeta).getByText('La descartaste: no se guardó nada.'),
    ).toBeTruthy()
    expect(within(tarjeta).queryByRole('button')).toBeNull()
    expect(api.confirmar).not.toHaveBeenCalled()
  })

  it('429: avisa el límite con los segundos', async () => {
    const api = apiFalsa()
    api.conversar.mockRejectedValue(
      new ApiError({
        status: 429,
        codigo: 'limite_ia_por_minuto',
        mensaje: 'Demasiadas llamadas.',
        reintentarEn: 42,
      }),
    )
    abrirPanel(api)

    await escribirYEnviar('hola')

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Llegaste al límite de consultas, probá en 42 segundos.',
    )
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull()
  })

  it('503: no disponible, y Reintentar vuelve a mandar el mismo historial', async () => {
    const api = apiFalsa()
    api.conversar
      .mockRejectedValueOnce(
        new ApiError({
          status: 503,
          codigo: 'asistente_no_disponible',
          mensaje: 'x',
        }),
      )
      .mockResolvedValueOnce({
        texto: 'Ahora sí.',
        consultas: [],
        propuestas: [],
      })
    abrirPanel(api)
    const usuario = await escribirYEnviar('hola')

    expect((await screen.findByRole('alert')).textContent).toContain(
      'El asistente no está disponible ahora',
    )
    await usuario.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('Ahora sí.')).toBeTruthy()
    expect(api.conversar.mock.calls[1][0]).toEqual([
      { rol: 'usuario', texto: 'hola' },
    ])
  })

  it('manda como mucho los últimos 20 mensajes', async () => {
    const viejos = Array.from({ length: 24 }, (_, i) => ({
      id: `m-${i}`,
      rol: i % 2 === 0 ? 'usuario' : 'asistente',
      texto: `mensaje ${i}`,
      ...(i % 2 === 0 ? {} : { consultas: [], propuestas: [] }),
    }))
    sessionStorage.setItem(
      claveDelHistorial(EMAIL, TENANT),
      JSON.stringify(viejos),
    )
    const api = apiFalsa()
    api.conversar.mockResolvedValue({
      texto: 'ok',
      consultas: [],
      propuestas: [],
    })
    abrirPanel(api)
    expect(screen.getByText('mensaje 0')).toBeTruthy()

    await escribirYEnviar('el nuevo')

    const enviados = api.conversar.mock.calls[0][0]
    expect(enviados).toHaveLength(20)
    expect(enviados[0].texto).toBe('mensaje 5')
    expect(enviados.at(-1)).toEqual({ rol: 'usuario', texto: 'el nuevo' })
  })

  it('el texto del modelo se muestra como texto, nunca como HTML', async () => {
    const api = apiFalsa()
    const malicioso = '<img src=x onerror="alert(1)"><b>hola</b>'
    api.conversar.mockResolvedValue({
      texto: malicioso,
      consultas: [],
      propuestas: [],
    })
    abrirPanel(api)

    await escribirYEnviar('hola')

    const log = screen.getByRole('log')
    expect(await within(log).findByText(malicioso)).toBeTruthy()
    expect(log.querySelector('img')).toBeNull()
    expect(log.querySelector('b')).toBeNull()
  })

  it('Nueva conversación vacía el historial y el almacenamiento', async () => {
    const api = apiFalsa()
    api.conversar.mockResolvedValue({
      texto: 'Respuesta',
      consultas: [],
      propuestas: [],
    })
    abrirPanel(api)
    const usuario = await escribirYEnviar('hola')
    await screen.findByText('Respuesta')

    await usuario.click(
      screen.getByRole('button', { name: /Nueva conversación/ }),
    )

    expect(screen.queryByText('Respuesta')).toBeNull()
    await waitFor(() =>
      expect(
        sessionStorage.getItem(claveDelHistorial(EMAIL, TENANT)),
      ).toBeNull(),
    )
  })

  it('Escape cierra el panel', async () => {
    const { alCerrar } = abrirPanel(apiFalsa())
    const usuario = userEvent.setup()

    await usuario.keyboard('{Escape}')

    expect(alCerrar).toHaveBeenCalled()
  })
})

describe('botón flotante', () => {
  it('abre el panel con el foco en el campo y, al cerrar con Escape, vuelve al botón', async () => {
    const usuario = userEvent.setup()
    render(
      <Proveedores roles={['ventas']}>
        <BotonAsistente />
      </Proveedores>,
    )
    const boton = screen.getByRole('button', { name: 'Asistente' })

    await usuario.click(boton)

    const panel = await screen.findByRole('dialog', { name: 'Asistente' })
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(panel).getByLabelText('Mensaje para el asistente'),
      ),
    )
    expect(boton.getAttribute('aria-expanded')).toBe('true')

    await usuario.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(boton))
    expect(boton.getAttribute('aria-expanded')).toBe('false')
  })
})
