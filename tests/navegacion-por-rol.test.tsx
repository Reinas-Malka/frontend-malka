// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import {
  createMemoryRouter,
  RouterProvider,
  type RouteObject,
} from 'react-router'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import type { Identidad, Rol } from '../src/auth/identidad'

// api/recursos.ts decide simulado/real al cargarse: el flag va antes del import.
let rutas: RouteObject[]
let ProveedorDeSesionFijo: (p: {
  identidad: Identidad
  children: ReactNode
}) => ReactNode

beforeAll(async () => {
  vi.stubEnv('VITE_DATOS_SIMULADOS', 'true')
  rutas = (await import('../src/app/router')).rutas
  ProveedorDeSesionFijo = (await import('../src/auth/sesion'))
    .ProveedorDeSesionFijo
})

afterAll(() => vi.unstubAllEnvs())
afterEach(cleanup)

function montarComo(roles: Rol[], ruta = '/') {
  const router = createMemoryRouter(rutas, { initialEntries: [ruta] })
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ProveedorDeSesionFijo
        identidad={{ email: 'x@malka.test', roles, tenantId: 't' }}
      >
        <RouterProvider router={router} />
      </ProveedorDeSesionFijo>
    </QueryClientProvider>,
  )
}

async function enlacesDelMenu(): Promise<string[]> {
  const menu = await screen.findByRole('navigation', { name: 'Principal' })
  return within(menu)
    .queryAllByRole('link')
    .map((enlace) => enlace.textContent ?? '')
}

// DoD del #4: cada rol ve solo lo suyo. Si cambia la tabla de ACCESOS,
// este es el test que hay que actualizar.
const MENU_POR_ROL: Record<Rol, string[]> = {
  admin: [
    'Tandas',
    'Razas',
    'Parques',
    'Núcleos',
    'Bancos',
    'Materiales',
    'Pedidos',
    'Clientes',
    'Ítems vendibles',
    'Embarques',
    'Estado del sistema',
  ],
  produccion: [
    'Tandas',
    'Razas',
    'Parques',
    'Núcleos',
    'Bancos',
    'Materiales',
    'Ítems vendibles',
  ],
  ventas: ['Pedidos', 'Clientes', 'Ítems vendibles', 'Embarques'],
  lectura: [
    'Tandas',
    'Razas',
    'Parques',
    'Núcleos',
    'Bancos',
    'Materiales',
    'Pedidos',
    'Clientes',
    'Ítems vendibles',
    'Embarques',
  ],
}

describe('menú por rol', () => {
  it.each(Object.entries(MENU_POR_ROL))(
    '%s ve solo sus secciones',
    async (rol, esperado) => {
      montarComo([rol as Rol])

      expect(await enlacesDelMenu()).toEqual(esperado)
    },
  )

  it('un grupo sin enlaces para el rol no muestra su título', async () => {
    montarComo(['produccion'])
    const menu = await screen.findByRole('navigation', { name: 'Principal' })

    for (const titulo of ['Exportación', 'Equipo']) {
      expect(within(menu).queryByText(titulo), titulo).toBeNull()
    }
    // Ítems vendibles, que también carga producción, vive en Ventas.
    expect(within(menu).getByText('Ventas')).toBeTruthy()
  })
})

// El inicio no es una pantalla técnica: lleva a la primera sección del rol.
describe('inicio', () => {
  it.each([
    [['admin'], 'Tandas'],
    [['produccion'], 'Tandas'],
    [['ventas'], 'Pedidos'],
    [['lectura'], 'Tandas'],
  ] as [Rol[], string][])('%s entra a %s', async (roles, pantalla) => {
    montarComo(roles, '/')

    expect(
      await screen.findByRole('heading', { level: 1, name: pantalla }),
    ).toBeTruthy()
  })

  it('el estado del sistema queda solo para admin', async () => {
    montarComo(['ventas'], '/estado')

    expect(
      await screen.findByText(/no está disponible para tu rol/i),
    ).toBeTruthy()
  })
})

describe('entrar por URL a una sección de otro rol', () => {
  it('muestra el aviso dentro del layout y no la pantalla', async () => {
    montarComo(['produccion'], '/ventas/clientes')

    expect(
      await screen.findByText(/no está disponible para tu rol/i),
    ).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Clientes' })).toBeNull()
    // El menú sigue ahí para volver a una sección propia.
    expect(await enlacesDelMenu()).toEqual(MENU_POR_ROL.produccion)
  })

  it('también para las rutas fuera del menú', async () => {
    montarComo(['ventas'], '/produccion/madres')

    expect(
      await screen.findByText(/no está disponible para tu rol/i),
    ).toBeTruthy()
  })

  it('la sección propia se abre', async () => {
    montarComo(['ventas'], '/ventas/clientes')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Clientes' }),
    ).toBeTruthy()
  })

  it('sin rol asignado, no hay secciones y lo dice', async () => {
    montarComo([], '/')

    expect(await screen.findByText(/no tiene un rol asignado/i)).toBeTruthy()
    expect(await enlacesDelMenu()).toEqual([])
  })
})
