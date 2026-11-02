// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentType } from 'react'
import {
  createMemoryRouter,
  RouterProvider,
  type RouteObject,
} from 'react-router'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import type { Rol } from '../src/auth/identidad'
import { DATOS_SIMULADOS } from '../src/datos/simulados'
import { formatearFecha } from '../src/lib/fechas'

const TENANT = '11111111-1111-4111-8111-111111111111'
const [COSECHADA, EN_PARQUE, RECIEN] = DATOS_SIMULADOS.tandas

// Cómo responde la API en cada test: la simulación, vacía o con error. Va
// antes que el vi.mock, que se eleva al principio del archivo.
const control = vi.hoisted(() => ({
  modo: 'simulado' as 'simulado' | 'vacio' | 'error',
  llamadas: 0,
}))

vi.mock('../src/api/kpis', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/api/kpis')>()
  const { ApiError } = await import('../src/api/client')
  const kpis: typeof original.kpis = {
    produccion: async (parametros) => {
      control.llamadas += 1
      if (control.modo === 'vacio') return []
      if (control.modo === 'error')
        throw new ApiError({
          status: 503,
          codigo: 'base_no_disponible',
          mensaje: 'La base de datos no responde.',
        })
      return original.kpis.produccion(parametros)
    },
  }
  return { ...original, kpis }
})

describe('pantalla de indicadores de producción', () => {
  // Los módulos de api deciden simulado/real al cargarse: el flag va antes.
  let KpisPage: ComponentType
  let TandaPage: ComponentType
  let ProveedorDeSesionFijo: typeof import('../src/auth/sesion').ProveedorDeSesionFijo
  let navegacion: typeof import('../src/app/navegacion')

  beforeAll(async () => {
    vi.stubEnv('VITE_DATOS_SIMULADOS', 'true')
    vi.resetModules()
    KpisPage = (await import('../src/pages/KpisPage')).default
    TandaPage = (await import('../src/pages/TandaPage')).default
    ProveedorDeSesionFijo = (await import('../src/auth/sesion'))
      .ProveedorDeSesionFijo
    navegacion = await import('../src/app/navegacion')
  })
  beforeEach(() => {
    control.modo = 'simulado'
    control.llamadas = 0
  })
  afterAll(() => vi.unstubAllEnvs())
  afterEach(cleanup)

  function montar(ruta = '/produccion/kpis', roles: Rol[] = ['lectura']) {
    const rutas: RouteObject[] = [
      { path: '/produccion/kpis', element: <KpisPage /> },
      { path: '/produccion/tandas/:id', element: <TandaPage /> },
    ]
    const router = createMemoryRouter(rutas, { initialEntries: [ruta] })
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
    return { usuario: userEvent.setup(), router }
  }

  /** La fila de la tabla que tiene ese texto en su primera celda. */
  const fila = async (texto: string) =>
    (await screen.findByRole('cell', { name: texto })).closest(
      'tr',
    ) as HTMLElement

  it('muestra cargando y después una fila por tanda con sus % y el enlace al detalle', async () => {
    montar()
    expect(screen.getByRole('status', { name: 'Cargando datos' })).toBeTruthy()

    const cosechada = within(
      await fila(formatearFecha(COSECHADA.fecha_traslarve)),
    )
    const enlace = cosechada.getByRole('link', {
      name: formatearFecha(COSECHADA.fecha_traslarve),
    })
    expect(enlace.getAttribute('href')).toBe(
      `/produccion/tandas/${COSECHADA.id}`,
    )
    expect(cosechada.getByRole('cell', { name: 'Carniola' })).toBeTruthy()
    // 250 introducidas, 220 cosechadas, 30 perdidas y 0 en el parque.
    expect(cosechada.getByRole('cell', { name: '250' })).toBeTruthy()
    expect(cosechada.getByRole('cell', { name: '220' })).toBeTruthy()
    expect(cosechada.getByRole('cell', { name: '30' })).toBeTruthy()
    expect(cosechada.getByText('88,0 %')).toBeTruthy()
    expect(cosechada.getByText('12,0 %')).toBeTruthy()

    // La recién traslarvada sale, pero sin %: todavía no entró al parque.
    const recien = within(await fila(formatearFecha(RECIEN.fecha_traslarve)))
    expect(recien.getAllByText('todavía sin introducidas')).toHaveLength(2)
    expect(recien.queryByText(/%$/)).toBeNull()

    // La explicación de cada indicador, para el apicultor.
    expect(screen.getByText('% de cosecha')).toBeTruthy()
    expect(screen.getByText('% de pérdida en el parque')).toBeTruthy()
    expect(screen.getByText(/es el % de fecundación/i)).toBeTruthy()
  })

  it('por raza suma las celdas de sus tandas y queda en la URL', async () => {
    const { usuario, router } = montar()
    await fila(formatearFecha(COSECHADA.fecha_traslarve))

    await usuario.click(screen.getByRole('button', { name: 'Por raza' }))

    const carniola = within(await fila('Carniola'))
    // Dos tandas (la cosechada y la recién traslarvada).
    expect(carniola.getByRole('cell', { name: '2' })).toBeTruthy()
    expect(carniola.getByText('88,0 %')).toBeTruthy()
    expect(within(await fila('Buckfast')).getAllByText('0,0 %')).toHaveLength(2)
    expect(screen.queryByRole('cell', { name: 'Italiana' })).toBeNull()
    expect(
      screen
        .getByRole('button', { name: 'Por raza' })
        .getAttribute('aria-pressed'),
    ).toBe('true')
    expect(router.state.location.search).toBe('?agrupar=raza')
  })

  it('filtra por la fecha de traslarve, con los dos días incluidos', async () => {
    const { router } = montar()
    await fila(formatearFecha(COSECHADA.fecha_traslarve))

    fireEvent.change(screen.getByLabelText('Traslarve desde'), {
      target: { value: EN_PARQUE.fecha_traslarve },
    })
    fireEvent.change(screen.getByLabelText('Traslarve hasta'), {
      target: { value: EN_PARQUE.fecha_traslarve },
    })

    expect(await fila(formatearFecha(EN_PARQUE.fecha_traslarve))).toBeTruthy()
    expect(
      screen.queryByRole('cell', {
        name: formatearFecha(COSECHADA.fecha_traslarve),
      }),
    ).toBeNull()
    expect(router.state.location.search).toBe(
      `?desde=${EN_PARQUE.fecha_traslarve}&hasta=${EN_PARQUE.fecha_traslarve}`,
    )
  })

  it('un período que termina antes de empezar se avisa y no se pide', async () => {
    montar('/produccion/kpis?desde=2026-09-10&hasta=2026-09-01')

    expect((await screen.findByRole('alert')).textContent).toBe(
      'La fecha final no puede ser anterior a la inicial.',
    )
    expect(screen.getByText('Revisá el período')).toBeTruthy()
    expect(
      screen.getByLabelText('Traslarve hasta').getAttribute('aria-invalid'),
    ).toBe('true')
    expect(screen.queryByRole('table')).toBeNull()
    expect(control.llamadas).toBe(0)
  })

  it('sin tandas en el período lo dice y deja volver a todo el historial', async () => {
    const { usuario } = montar(
      '/produccion/kpis?desde=2020-01-01&hasta=2020-01-31',
    )

    expect(
      await screen.findByText('No hay tandas traslarvadas en ese período'),
    ).toBeTruthy()
    await usuario.click(
      screen.getByRole('button', { name: 'Quitar el período' }),
    )

    expect(await fila(formatearFecha(COSECHADA.fecha_traslarve))).toBeTruthy()
  })

  it('sin ninguna tanda muestra el vacío con el camino a Tandas', async () => {
    control.modo = 'vacio'
    montar()

    expect(await screen.findByText('Todavía no hay tandas')).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'Ir a Tandas' }).getAttribute('href'),
    ).toBe('/produccion/tandas')
  })

  it('si la API falla muestra el error con reintentar', async () => {
    control.modo = 'error'
    const { usuario } = montar()

    const alerta = await screen.findByRole('alert')
    expect(alerta.textContent).toContain('La base de datos no responde.')

    control.modo = 'simulado'
    await usuario.click(
      within(alerta).getByRole('button', { name: 'Reintentar' }),
    )
    expect(await fila(formatearFecha(COSECHADA.fecha_traslarve))).toBeTruthy()
  })

  it('la abren los roles que abren producción y está en su menú', async () => {
    const como = (rol: Rol) => ({
      email: 'x@malka.test',
      roles: [rol],
      tenantId: 't',
    })
    for (const rol of ['admin', 'produccion', 'lectura'] as const)
      expect(navegacion.puedeAbrir(como(rol), '/produccion/kpis'), rol).toBe(
        true,
      )
    expect(navegacion.puedeAbrir(como('ventas'), '/produccion/kpis')).toBe(
      false,
    )

    const produccion = navegacion.NAVEGACION.find(
      (g) => g.titulo === 'Producción',
    )
    expect(produccion?.enlaces.map((e) => e.texto)).toContain('Indicadores')

    // Es solo lectura: fuera de la tabla (que ordena por columna) no hay
    // más botones que los de la agrupación, para ningún rol.
    montar('/produccion/kpis', ['produccion'])
    await fila(formatearFecha(COSECHADA.fecha_traslarve))
    expect(
      screen
        .getAllByRole('button')
        .filter((b) => !b.closest('table'))
        .map((b) => b.textContent),
    ).toEqual(['Por tanda', 'Por raza'])
  })
})

describe('indicadores en el detalle de la tanda', () => {
  let TandaPage: ComponentType
  let ProveedorDeSesionFijo: typeof import('../src/auth/sesion').ProveedorDeSesionFijo

  beforeAll(async () => {
    vi.stubEnv('VITE_DATOS_SIMULADOS', 'true')
    vi.resetModules()
    TandaPage = (await import('../src/pages/TandaPage')).default
    ProveedorDeSesionFijo = (await import('../src/auth/sesion'))
      .ProveedorDeSesionFijo
  })
  beforeEach(() => {
    control.modo = 'simulado'
  })
  afterAll(() => vi.unstubAllEnvs())
  afterEach(cleanup)

  function abrir(tanda: { id: string }) {
    const router = createMemoryRouter(
      [{ path: '/produccion/tandas/:id', element: <TandaPage /> }],
      { initialEntries: [`/produccion/tandas/${tanda.id}`] },
    )
    render(
      <ProveedorDeSesionFijo
        identidad={{
          email: 'x@malka.test',
          roles: ['lectura'],
          tenantId: TENANT,
        }}
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
  }

  const indicadores = async () =>
    within(await screen.findByRole('region', { name: 'Indicadores' }))

  it('muestra el % de cosecha y el de pérdida de esa tanda', async () => {
    abrir(COSECHADA)
    const zona = await indicadores()
    expect(await zona.findByText('88,0 %')).toBeTruthy()
    expect(zona.getByText('12,0 %')).toBeTruthy()
    expect(
      zona.getByText(/220 celdas cosechadas de 250 introducidas/),
    ).toBeTruthy()
  })

  it('con celdas en el parque dice cuántas siguen ahí', async () => {
    abrir(EN_PARQUE)
    const zona = await indicadores()
    expect(await zona.findByText(/400 celdas siguen en el parque/)).toBeTruthy()
  })

  it('sin introducidas no inventa un %', async () => {
    abrir(RECIEN)
    const zona = await indicadores()
    expect(await zona.findAllByText('todavía sin introducidas')).toHaveLength(2)
    expect(zona.queryByText(/\d %$/)).toBeNull()
  })

  it('si los indicadores fallan, la tanda se sigue viendo', async () => {
    control.modo = 'error'
    abrir(COSECHADA)
    const zona = await indicadores()
    expect((await zona.findByRole('alert')).textContent).toContain(
      'No se pudieron calcular los indicadores',
    )
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
      'Carniola',
    )
  })
})
