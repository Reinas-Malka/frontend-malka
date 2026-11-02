// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentType } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import type { Rol } from '../src/auth/identidad'
import { DATOS_SIMULADOS } from '../src/datos/simulados'
import { formatearImporte } from '../src/lib/importes'
import type { Borrador } from '../src/tipos/dominio'

const TENANT = '11111111-1111-4111-8111-111111111111'
const [PEDIDO] = DATOS_SIMULADOS.pedidos
const CLIENTE = DATOS_SIMULADOS.clientes.find(
  (c) => c.id === PEDIDO.cliente_id,
)!

const generando = (id = 'b-1'): Borrador => ({
  id,
  pedido_id: PEDIDO.id,
  estado: 'generando',
  contenido: null,
  motivo_rechazo: null,
  version_prompt: null,
  creado_en: '2026-11-01T15:30:00Z',
  actualizado_en: '2026-11-01T15:30:00Z',
})

describe('borrador con IA en el detalle del pedido', () => {
  let PedidoPage: ComponentType
  let ProveedorDeSesionFijo: typeof import('../src/auth/sesion').ProveedorDeSesionFijo
  // La misma simulación que la pantalla.
  let api: typeof import('../src/api/borradores').borradores
  let ApiError: typeof import('../src/api/client').ApiError

  // Módulos nuevos en cada test: la simulación arranca sin borradores.
  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.stubEnv('VITE_DATOS_SIMULADOS', 'true')
    vi.resetModules()
    PedidoPage = (await import('../src/pages/PedidoPage')).default
    ProveedorDeSesionFijo = (await import('../src/auth/sesion'))
      .ProveedorDeSesionFijo
    api = (await import('../src/api/borradores')).borradores
    ApiError = (await import('../src/api/client')).ApiError
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })
  afterAll(() => vi.unstubAllEnvs())

  function abrir(roles: Rol[] = ['ventas']) {
    const router = createMemoryRouter(
      [{ path: '/ventas/pedidos/:id', element: <PedidoPage /> }],
      { initialEntries: [`/ventas/pedidos/${PEDIDO.id}`] },
    )
    render(
      <ProveedorDeSesionFijo
        identidad={{ email: 'x@malka.test', roles, tenantId: TENANT }}
      >
        <QueryClientProvider
          client={
            new QueryClient({ defaultOptions: { queries: { retry: false } } })
          }
        >
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ProveedorDeSesionFijo>,
    )
    return userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  }

  const seccion = async () =>
    within(await screen.findByRole('region', { name: 'Borrador con IA' }))
  const avanzar = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))
  const botonGenerar = (zona: Awaited<ReturnType<typeof seccion>>) =>
    zona.getByRole('button', { name: 'Generar borrador' })

  it('pasa de redactando a borrador consultando cada 2 s y muestra el texto', async () => {
    const usuario = abrir()
    const zona = await seccion()
    expect(
      await zona.findByText('Todavía no hay borradores de este pedido.'),
    ).toBeTruthy()

    await usuario.click(botonGenerar(zona))

    expect(
      await zona.findByText(/La IA está redactando el borrador/),
    ).toBeTruthy()
    expect(zona.getByText('Redactando')).toBeTruthy()
    // El worker simulado tarda 2 s; la consulta siguiente ya lo trae.
    await avanzar(2000)
    await avanzar(2000)

    expect(
      await zona.findByRole('heading', {
        name: `Nota de venta de reinas a ${CLIENTE.nombre}`,
      }),
    ).toBeTruthy()
    const texto = within(
      zona.getByRole('article', { name: 'Texto del borrador' }),
    )
    expect(
      texto.getByText(/20 reinas de raza Carniola \(ítem Reina fecundada\)/),
    ).toBeTruthy()
    // Las secciones del cuerpo y, debajo, el detalle que calcula el sistema.
    expect(texto.getByRole('heading', { name: 'OBJETO' })).toBeTruthy()
    const detalle = within(
      zona.getByRole('region', {
        name: 'Detalle del pedido (calculado por el sistema)',
      }),
    )
    expect(
      detalle.getByText(`ARS ${formatearImporte(PEDIDO.total)}`),
    ).toBeTruthy()
    expect(zona.getByRole('button', { name: 'Copiar texto' })).toBeTruthy()
    expect(zona.getByText('Para revisar')).toBeTruthy()
    expect(zona.queryByText(/La IA está redactando/)).toBeNull()
    // Siempre a la vista: lo redacta una IA y lo fiscal lo carga una persona.
    expect(zona.getByText(/lo redacta una IA/)).toBeTruthy()
    expect(zona.getByText(/números fiscales/)).toBeTruthy()
    expect(
      zona.getByText(/La aprobación todavía no está disponible/),
    ).toBeTruthy()
  })

  it('un rechazo explica el motivo en castellano y ofrece generar otro', async () => {
    const pedir = vi
      .spyOn(api, 'pedir')
      .mockResolvedValueOnce(generando('b-1'))
      .mockResolvedValueOnce(generando('b-2'))
    vi.spyOn(api, 'obtener').mockImplementation(async (id) => ({
      ...generando(id),
      estado: 'rechazado',
      motivo_rechazo: 'salida_invalida',
    }))
    const usuario = abrir()
    const zona = await seccion()
    await zona.findByText('Todavía no hay borradores de este pedido.')

    await usuario.click(botonGenerar(zona))

    expect(
      await zona.findByRole('heading', {
        name: 'No se pudo generar este borrador',
      }),
    ).toBeTruthy()
    expect(zona.getByText(/incluía montos o datos fiscales/)).toBeTruthy()
    expect(zona.queryByText('salida_invalida')).toBeNull()

    await usuario.click(
      zona.getByRole('button', { name: 'Generar otro borrador' }),
    )
    await waitFor(() => expect(pedir).toHaveBeenCalledTimes(2))
    // Cada pedido nuevo lleva su propia Idempotency-Key.
    expect(pedir.mock.calls[1][1]).not.toBe(pedir.mock.calls[0][1])
  })

  it('un 429 dice cuántos segundos esperar (Retry-After) y bloquea el botón', async () => {
    vi.spyOn(api, 'pedir').mockRejectedValueOnce(
      new ApiError({
        status: 429,
        codigo: 'limite_ia_por_minuto',
        mensaje: 'Demasiadas llamadas a la IA seguidas. Esperá un minuto.',
        reintentarEn: 30,
      }),
    )
    const usuario = abrir()
    const zona = await seccion()
    await zona.findByText('Todavía no hay borradores de este pedido.')

    await usuario.click(botonGenerar(zona))

    expect(
      await zona.findByText('Esperá 30 segundos para generar otro.'),
    ).toBeTruthy()
    expect(zona.queryByText(/limite_ia/)).toBeNull()
    expect(botonGenerar(zona)).toHaveProperty('disabled', true)

    await avanzar(1000)
    expect(zona.getByText('Esperá 29 segundos para generar otro.')).toBeTruthy()

    await avanzar(29_000)
    await waitFor(() =>
      expect(botonGenerar(zona)).toHaveProperty('disabled', false),
    )
    expect(zona.queryByText(/Esperá/)).toBeNull()
  })

  it('el límite diario avisa que se renueva a la medianoche', async () => {
    vi.spyOn(api, 'pedir').mockRejectedValueOnce(
      new ApiError({
        status: 429,
        codigo: 'limite_ia_diario',
        mensaje: 'El criadero ya usó hoy todas las llamadas a la IA.',
        reintentarEn: 3 * 3600 + 20 * 60,
      }),
    )
    const usuario = abrir(['admin'])
    const zona = await seccion()
    await zona.findByText('Todavía no hay borradores de este pedido.')

    await usuario.click(botonGenerar(zona))

    expect(await zona.findByText(/se renuevan a la medianoche/)).toBeTruthy()
    expect(zona.getByText('Esperá 3 h 20 min para generar otro.')).toBeTruthy()
  })

  it('un doble clic manda un solo pedido', async () => {
    const pedir = vi.spyOn(api, 'pedir')
    const usuario = abrir()
    const zona = await seccion()
    await zona.findByText('Todavía no hay borradores de este pedido.')

    await usuario.dblClick(botonGenerar(zona))

    await zona.findByText(/La IA está redactando el borrador/)
    expect(pedir).toHaveBeenCalledTimes(1)
    const lista = within(
      zona.getByRole('list', { name: 'Borradores del pedido' }),
    )
    expect(lista.getAllByRole('listitem')).toHaveLength(1)
  })

  it('lectura ve el borrador pero no lo genera ni lo edita', async () => {
    await api.pedir(PEDIDO.id)
    await avanzar(2000)
    abrir(['lectura'])
    const zona = await seccion()

    expect(
      await zona.findByRole('heading', {
        name: `Nota de venta de reinas a ${CLIENTE.nombre}`,
      }),
    ).toBeTruthy()
    expect(zona.queryByRole('button', { name: 'Generar borrador' })).toBeNull()
    expect(zona.queryByRole('button', { name: /Editar texto/ })).toBeNull()
    expect(zona.getByText(/lo redacta una IA/)).toBeTruthy()
  })

  it('lectura sin borradores ve quién los genera', async () => {
    abrir(['lectura'])
    const zona = await seccion()

    expect(
      await zona.findByText('Los generan administración y ventas.'),
    ).toBeTruthy()
    expect(zona.queryByRole('button', { name: 'Generar borrador' })).toBeNull()
  })

  it('ventas edita el texto en la pantalla y puede volver al de la IA', async () => {
    await api.pedir(PEDIDO.id)
    await avanzar(2000)
    const usuario = abrir()
    const zona = await seccion()
    await zona.findByRole('heading', {
      name: `Nota de venta de reinas a ${CLIENTE.nombre}`,
    })

    await usuario.click(zona.getByRole('button', { name: /Editar texto/ }))
    const encabezado = zona.getByLabelText('Encabezado')
    await usuario.clear(encabezado)
    await usuario.type(encabezado, 'Remito revisado')
    await usuario.click(zona.getByRole('button', { name: 'Listo' }))

    expect(zona.getByRole('heading', { name: 'Remito revisado' })).toBeTruthy()
    expect(zona.getByText('Con cambios sin guardar')).toBeTruthy()

    await usuario.click(
      zona.getByRole('button', { name: /Volver al texto de la IA/ }),
    )
    expect(
      zona.getByRole('heading', {
        name: `Nota de venta de reinas a ${CLIENTE.nombre}`,
      }),
    ).toBeTruthy()
    expect(zona.queryByText('Con cambios sin guardar')).toBeNull()
  })

  it('deja de consultar al llegar al tope y ofrece seguir esperando', async () => {
    vi.spyOn(api, 'pedir').mockResolvedValue(generando())
    const obtener = vi
      .spyOn(api, 'obtener')
      .mockImplementation(async (id) => generando(id))
    const usuario = abrir()
    const zona = await seccion()
    await zona.findByText('Todavía no hay borradores de este pedido.')

    await usuario.click(botonGenerar(zona))
    await zona.findByText(/La IA está redactando el borrador/)
    // 60 consultas de 2 s: dos minutos sin salir de generando.
    for (let n = 0; n < 62; n++) await avanzar(2000)

    expect(
      await zona.findByText('Está tardando más de lo normal.'),
    ).toBeTruthy()
    const hechas = obtener.mock.calls.length
    await avanzar(10_000)
    expect(obtener.mock.calls.length).toBe(hechas)

    await usuario.click(zona.getByRole('button', { name: 'Seguir esperando' }))
    await waitFor(() =>
      expect(obtener.mock.calls.length).toBeGreaterThan(hechas),
    )
    expect(
      await zona.findByText(/La IA está redactando el borrador/),
    ).toBeTruthy()
  })
})
