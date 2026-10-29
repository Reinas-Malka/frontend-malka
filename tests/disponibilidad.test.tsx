// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentType } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import type { Rol } from '../src/auth/identidad'

describe('disponibilidad por raza (#13)', () => {
  // api/disponibilidad.ts decide simulado/real al cargarse: el flag va antes.
  let DisponibilidadPage: ComponentType
  // Del mismo grafo de módulos que la pantalla: si no, el contexto de sesión es otro.
  let ProveedorDeSesionFijo: typeof import('../src/auth/sesion').ProveedorDeSesionFijo
  // La misma API simulada que usa la pantalla.
  let api: typeof import('../src/api/disponibilidad').disponibilidad

  beforeAll(async () => {
    vi.stubEnv('VITE_DATOS_SIMULADOS', 'true')
    vi.resetModules()
    DisponibilidadPage = (await import('../src/pages/DisponibilidadPage'))
      .default
    ProveedorDeSesionFijo = (await import('../src/auth/sesion'))
      .ProveedorDeSesionFijo
    api = (await import('../src/api/disponibilidad')).disponibilidad
  })
  afterAll(() => vi.unstubAllEnvs())
  afterEach(cleanup)

  function montar(roles: Rol[]) {
    const router = createMemoryRouter(
      [
        { path: '/ventas/disponibilidad', element: <DisponibilidadPage /> },
        { path: '/produccion/bancos', element: <h1>Bancos</h1> },
      ],
      { initialEntries: ['/ventas/disponibilidad'] },
    )
    render(
      <ProveedorDeSesionFijo
        identidad={{ email: 'x@malka.test', roles, tenantId: 't' }}
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

  it('cada raza muestra lo mismo que la API, con sus bancos', async () => {
    const esperado = await api.listar()
    expect(esperado.length).toBeGreaterThan(0)
    montar(['lectura'])

    for (const d of esperado) {
      const fila = (await screen.findByText(d.raza)).closest('tr')!
      const celdas = within(fila)
        .getAllByRole('cell')
        .map((c) => c.textContent)
      expect(celdas.slice(0, 4)).toEqual([
        d.raza,
        String(d.enjauladas),
        String(d.reservadas),
        String(d.disponible),
      ])
      const bancos = within(fila)
        .queryAllByRole('listitem')
        .map((b) => b.textContent)
      expect(bancos).toEqual(
        d.bancos.map((b) => `${b.identificador ?? 'Sin banco'}${b.reinas}`),
      )
    }
  })

  it('producción tiene el enlace a Bancos', async () => {
    const { usuario, router } = montar(['produccion'])

    await usuario.click(await screen.findByRole('link', { name: 'Ver bancos' }))

    expect(router.state.location.pathname).toBe('/produccion/bancos')
  })

  it('ventas no lo ve: Producción no se abre con su rol', async () => {
    montar(['ventas'])

    await screen.findAllByRole('row')
    expect(screen.queryByRole('link', { name: 'Ver bancos' })).toBeNull()
  })
})
