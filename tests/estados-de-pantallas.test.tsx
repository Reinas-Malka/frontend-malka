// @vitest-environment jsdom
/** Los tres estados de cada pantalla que carga datos (#28): cargando, vacío
 *  y error. Una tabla por tipo de pantalla, y cada caso reemplaza solo la
 *  consulta principal; el resto sale de los datos simulados.
 *
 *  - Cargando: la consulta no termina nunca → skeleton con role="status".
 *  - Vacío: un listado sin filas → el Vacio de la pantalla. En un detalle,
 *    el vacío es el 404: "No encontramos…", no un error para reportar.
 *  - Error: un 500 → role="alert" con el código, el request_id y Reintentar. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentType } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
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
import type { ApiError as TipoApiError } from '../src/api/client'

const TENANT = '11111111-1111-4111-8111-111111111111'
const ID = '99999999-9999-4999-8999-999999999999'
const PAGINA_VACIA = { items: [], siguiente: null }

type Modulos = {
  client: typeof import('../src/api/client')
  sesion: typeof import('../src/auth/sesion')
  pedidos: typeof import('../src/api/pedidos').pedidos
  comprobantes: typeof import('../src/api/comprobantes').comprobantes
  embarques: typeof import('../src/api/embarques').embarques
  tandas: typeof import('../src/api/tandas').tandas
  movimientos: typeof import('../src/api/movimientos').movimientos
  disponibilidad: typeof import('../src/api/disponibilidad').disponibilidad
  kpis: typeof import('../src/api/kpis').kpis
  recursos: typeof import('../src/api/recursos')
}

let m: Modulos
const paginas: Record<string, ComponentType> = {}

/** La consulta que se reemplaza y con qué. */
type Reemplazo = (m: Modulos, respuesta: () => Promise<unknown>) => void

type Caso = {
  pantalla: string
  ruta: string
  patron: string
  reemplazar: Reemplazo
}

type Listado = Caso & {
  /** Lo que la consulta devuelve cuando no hay nada. */
  vacia: unknown
  titulo: string
}

type Detalle = Caso & { titulo: string }

const espiar =
  <T extends object>(objeto: (m: Modulos) => T, metodo: keyof T): Reemplazo =>
  (mods, respuesta) => {
    vi.spyOn(objeto(mods), metodo as never).mockImplementation(
      respuesta as never,
    )
  }

const LISTADOS: Listado[] = [
  {
    pantalla: 'PedidosPage',
    ruta: '/ventas/pedidos',
    patron: '/ventas/pedidos',
    reemplazar: espiar((x) => x.pedidos, 'listar'),
    vacia: PAGINA_VACIA,
    titulo: 'Todavía no hay pedidos',
  },
  {
    pantalla: 'ComprobantesPage',
    ruta: '/ventas/comprobantes',
    patron: '/ventas/comprobantes',
    reemplazar: espiar((x) => x.comprobantes, 'listar'),
    vacia: PAGINA_VACIA,
    titulo: 'Todavía no hay comprobantes',
  },
  {
    pantalla: 'EmbarquesPage',
    ruta: '/exportacion/embarques',
    patron: '/exportacion/embarques',
    reemplazar: espiar((x) => x.embarques, 'listar'),
    vacia: PAGINA_VACIA,
    titulo: 'Todavía no hay embarques',
  },
  {
    pantalla: 'TandasPage',
    // Sin ?estado muestra las en curso: "todas" es el listado sin filtros.
    ruta: '/produccion/tandas?estado=todas',
    patron: '/produccion/tandas',
    reemplazar: espiar((x) => x.tandas, 'listar'),
    vacia: PAGINA_VACIA,
    titulo: 'Todavía no hay tandas',
  },
  {
    pantalla: 'KpisPage',
    ruta: '/produccion/kpis',
    patron: '/produccion/kpis',
    reemplazar: espiar((x) => x.kpis, 'produccion'),
    vacia: [],
    titulo: 'Todavía no hay tandas',
  },
  {
    pantalla: 'DisponibilidadPage',
    ruta: '/ventas/disponibilidad',
    patron: '/ventas/disponibilidad',
    reemplazar: espiar((x) => x.disponibilidad, 'listar'),
    vacia: [],
    titulo: 'Todavía no hay razas',
  },
  {
    pantalla: 'NucleosPage',
    ruta: '/produccion/nucleos',
    patron: '/produccion/nucleos',
    reemplazar: espiar((x) => x.recursos.parques, 'listar'),
    vacia: PAGINA_VACIA,
    titulo: 'Todavía no hay parques',
  },
  // Las pantallas de catálogo comparten PaginaCatalogo: una alcanza para
  // probarla, y Parques porque la envuelve con su propio agregado.
  {
    pantalla: 'RazasPage',
    ruta: '/produccion/razas',
    patron: '/produccion/razas',
    reemplazar: espiar((x) => x.recursos.razas, 'listar'),
    vacia: PAGINA_VACIA,
    titulo: 'Todavía no hay razas.',
  },
  {
    pantalla: 'ParquesPage',
    ruta: '/produccion/parques',
    patron: '/produccion/parques',
    reemplazar: espiar((x) => x.recursos.parques, 'listar'),
    vacia: PAGINA_VACIA,
    titulo: 'Todavía no hay parques de fecundación.',
  },
]

const DETALLES: Detalle[] = [
  {
    pantalla: 'PedidoPage',
    ruta: `/ventas/pedidos/${ID}`,
    patron: '/ventas/pedidos/:id',
    reemplazar: espiar((x) => x.pedidos, 'obtener'),
    titulo: 'No encontramos este pedido',
  },
  {
    pantalla: 'ComprobantePage',
    ruta: `/ventas/comprobantes/${ID}`,
    patron: '/ventas/comprobantes/:id',
    reemplazar: espiar((x) => x.comprobantes, 'obtener'),
    titulo: 'No encontramos este comprobante',
  },
  {
    pantalla: 'ClientePage',
    ruta: `/ventas/clientes/${ID}`,
    patron: '/ventas/clientes/:id',
    reemplazar: espiar((x) => x.recursos.clientes, 'obtener'),
    titulo: 'No encontramos este cliente',
  },
  {
    pantalla: 'EmbarquePage',
    ruta: `/exportacion/embarques/${ID}`,
    patron: '/exportacion/embarques/:id',
    reemplazar: espiar((x) => x.embarques, 'obtener'),
    titulo: 'No encontramos este embarque',
  },
  {
    pantalla: 'TandaPage',
    ruta: `/produccion/tandas/${ID}`,
    patron: '/produccion/tandas/:id',
    reemplazar: espiar((x) => x.tandas, 'obtener'),
    titulo: 'No encontramos esta tanda',
  },
]

const nunca = () => new Promise<never>(() => {})

function errorDelServidor(): TipoApiError {
  return new m.client.ApiError({
    mensaje: 'Falló el servidor.',
    codigo: 'error_interno',
    status: 500,
    requestId: 'req-estados-500',
  })
}

function noEncontrado(): TipoApiError {
  return new m.client.ApiError({
    mensaje: 'No existe.',
    codigo: 'no_encontrado',
    status: 404,
    requestId: 'req-estados-404',
  })
}

function montar({ pantalla, ruta, patron }: Caso) {
  const Pagina = paginas[pantalla]
  const router = createMemoryRouter(
    [
      { path: patron, element: <Pagina /> },
      // Los enlaces de "volver" y de acción no tienen que romper nada.
      { path: '*', element: null },
    ],
    { initialEntries: [ruta] },
  )
  render(
    <m.sesion.ProveedorDeSesionFijo
      identidad={{ email: 'x@malka.test', roles: ['admin'], tenantId: TENANT }}
    >
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <RouterProvider router={router} />
      </QueryClientProvider>
    </m.sesion.ProveedorDeSesionFijo>,
  )
  return userEvent.setup()
}

async function verCargando() {
  const estado = await screen.findByRole('status', { name: 'Cargando datos' })
  expect(estado).toBeTruthy()
  expect(screen.queryByRole('alert')).toBeNull()
}

/** Un 500 se reporta: código, request_id y Reintentar, que vuelve a pedir. */
async function verError(espia: () => number) {
  const alerta = await screen.findByRole('alert')
  expect(alerta.textContent).toContain('error_interno')
  expect(alerta.textContent).toContain('req-estados-500')
  const antes = espia()
  await userEvent
    .setup()
    .click(within(alerta).getByRole('button', { name: 'Reintentar' }))
  await vi.waitFor(() => expect(espia()).toBeGreaterThan(antes))
}

describe('los tres estados de cada pantalla', () => {
  beforeAll(async () => {
    // El Select de Radix usa APIs de puntero y scroll que jsdom no implementa.
    Element.prototype.hasPointerCapture = () => false
    Element.prototype.releasePointerCapture = () => {}
    Element.prototype.scrollIntoView = () => {}
    vi.stubEnv('VITE_DATOS_SIMULADOS', 'true')
    vi.resetModules()
    // Del mismo grafo que las pantallas: los espías tienen que ser sobre
    // los mismos objetos que ellas usan.
    for (const nombre of [
      'PedidosPage',
      'ComprobantesPage',
      'EmbarquesPage',
      'TandasPage',
      'KpisPage',
      'DisponibilidadPage',
      'NucleosPage',
      'PedidoPage',
      'ComprobantePage',
      'ClientePage',
      'EmbarquePage',
      'TandaPage',
      'MaterialPage',
      'StatusPage',
      'ParquesPage',
    ])
      paginas[nombre] = (
        (await import(`../src/pages/${nombre}.tsx`)) as {
          default: ComponentType
        }
      ).default
    paginas.RazasPage = (await import('../src/pages/CatalogoPages')).RazasPage
    m = {
      client: await import('../src/api/client'),
      sesion: await import('../src/auth/sesion'),
      pedidos: (await import('../src/api/pedidos')).pedidos,
      comprobantes: (await import('../src/api/comprobantes')).comprobantes,
      embarques: (await import('../src/api/embarques')).embarques,
      tandas: (await import('../src/api/tandas')).tandas,
      movimientos: (await import('../src/api/movimientos')).movimientos,
      disponibilidad: (await import('../src/api/disponibilidad'))
        .disponibilidad,
      kpis: (await import('../src/api/kpis')).kpis,
      recursos: await import('../src/api/recursos'),
    }
  })
  afterAll(() => vi.unstubAllEnvs())
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  describe.each(LISTADOS)('$pantalla', (caso) => {
    it('muestra el skeleton mientras carga', async () => {
      caso.reemplazar(m, nunca)
      montar(caso)
      await verCargando()
    })

    it('sin filas muestra el vacío y no una tabla en blanco', async () => {
      caso.reemplazar(m, () => Promise.resolve(caso.vacia))
      montar(caso)
      expect(await screen.findByText(caso.titulo)).toBeTruthy()
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('un 500 muestra el error con su request_id y deja reintentar', async () => {
      const llamada = vi.fn(() => Promise.reject(errorDelServidor()))
      caso.reemplazar(m, llamada)
      montar(caso)
      await verError(() => llamada.mock.calls.length)
    })
  })

  describe.each(DETALLES)('$pantalla', (caso) => {
    it('muestra el skeleton mientras carga', async () => {
      caso.reemplazar(m, nunca)
      montar(caso)
      await verCargando()
    })

    it('un 404 dice que no existe, sin código para reportar', async () => {
      caso.reemplazar(m, () => Promise.reject(noEncontrado()))
      montar(caso)
      expect(await screen.findByText(caso.titulo)).toBeTruthy()
      expect(screen.queryByRole('alert')).toBeNull()
      expect(screen.queryByText(/req-estados-404/)).toBeNull()
    })

    it('un 500 muestra el error con su request_id y deja reintentar', async () => {
      const llamada = vi.fn(() => Promise.reject(errorDelServidor()))
      caso.reemplazar(m, llamada)
      montar(caso)
      await verError(() => llamada.mock.calls.length)
    })
  })

  describe('MaterialPage', () => {
    // Detalle con un listado adentro: el material sale de la simulación y
    // lo que se reemplaza son sus movimientos.
    async function caso(): Promise<Caso> {
      const {
        items: [material],
      } = await m.recursos.materiales.listar({})
      return {
        pantalla: 'MaterialPage',
        ruta: `/produccion/materiales/${material.id}`,
        patron: '/produccion/materiales/:id',
        reemplazar: espiar((x) => x.movimientos, 'listar'),
      }
    }

    it('muestra el skeleton mientras carga', async () => {
      const c = await caso()
      c.reemplazar(m, nunca)
      montar(c)
      await verCargando()
    })

    it('sin movimientos muestra el vacío', async () => {
      const c = await caso()
      c.reemplazar(m, () => Promise.resolve(PAGINA_VACIA))
      montar(c)
      expect(await screen.findByText('Sin movimientos todavía')).toBeTruthy()
    })

    it('un 500 muestra el error con su request_id y deja reintentar', async () => {
      const c = await caso()
      const llamada = vi.fn(() => Promise.reject(errorDelServidor()))
      c.reemplazar(m, llamada)
      montar(c)
      await verError(() => llamada.mock.calls.length)
    })
  })

  describe('StatusPage', () => {
    // /health no pasa por las APIs simuladas: se reemplaza fetch, y el
    // cliente necesita una URL base para llegar a llamarlo.
    beforeEach(() => vi.stubEnv('VITE_API_BASE_URL', 'https://api.test'))

    const caso: Caso = {
      pantalla: 'StatusPage',
      ruta: '/estado',
      patron: '/estado',
      reemplazar: () => {},
    }

    it('muestra el skeleton mientras carga', async () => {
      vi.stubGlobal('fetch', vi.fn(nunca))
      montar(caso)
      await verCargando()
    })

    it('un 500 muestra el error con su request_id y deja reintentar', async () => {
      const fetch = vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              error: {
                code: 'error_interno',
                message: 'Falló el servidor.',
                details: {},
                request_id: 'req-estados-500',
              },
            }),
            {
              status: 500,
              headers: {
                'content-type': 'application/json',
                'x-request-id': 'req-estados-500',
              },
            },
          ),
        ),
      )
      vi.stubGlobal('fetch', fetch)
      montar(caso)
      // fetch también lo usa /health/ready: se cuentan los de /health.
      await verError(
        () =>
          fetch.mock.calls.filter((args: unknown[]) =>
            String(args[0]).endsWith('/health'),
          ).length,
      )
    })
  })
})
