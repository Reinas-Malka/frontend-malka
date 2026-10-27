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

const TENANT = '11111111-1111-4111-8111-111111111111'

describe('listado de pedidos', () => {
  // api/pedidos.ts decide simulado/real al cargarse: el flag va antes.
  let PedidosPage: ComponentType
  // Del mismo grafo de módulos que la pantalla: si no, el contexto de sesión es otro.
  let ProveedorDeSesionFijo: typeof import('../src/auth/sesion').ProveedorDeSesionFijo

  beforeAll(async () => {
    // El Select de Radix usa APIs de puntero y scroll que jsdom no implementa.
    Element.prototype.hasPointerCapture = () => false
    Element.prototype.releasePointerCapture = () => {}
    Element.prototype.scrollIntoView = () => {}
    vi.stubEnv('VITE_DATOS_SIMULADOS', 'true')
    vi.resetModules()
    PedidosPage = (await import('../src/pages/PedidosPage')).default
    ProveedorDeSesionFijo = (await import('../src/auth/sesion'))
      .ProveedorDeSesionFijo
  })
  afterAll(() => vi.unstubAllEnvs())
  afterEach(cleanup)

  function montar(ruta = '/ventas/pedidos', roles: Rol[] = ['lectura']) {
    const router = createMemoryRouter(
      [{ path: '/ventas/pedidos', element: <PedidosPage /> }],
      { initialEntries: [ruta] },
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
    return { usuario: userEvent.setup(), router }
  }

  type Usuario = ReturnType<typeof userEvent.setup>

  async function elegir(usuario: Usuario, filtro: string, opcion: string) {
    await usuario.click(screen.getByRole('combobox', { name: filtro }))
    await usuario.click(await screen.findByRole('option', { name: opcion }))
  }

  /** Las filas de la tabla, sin el encabezado. */
  const filas = () => screen.getAllByRole('row').slice(1)

  it('muestra cada pedido con su cliente, estado, destino y tamaño', async () => {
    montar()

    const exportacion = (
      await screen.findByRole('cell', { name: 'Bee Kingdom NZ Ltd' })
    ).closest('tr') as HTMLElement
    expect(filas()).toHaveLength(4)
    expect(within(exportacion).getByText('Reservado')).toBeTruthy()
    expect(
      within(exportacion).getByText('Nueva Zelanda (NZ) · CPT'),
    ).toBeTruthy()
    expect(within(exportacion).getByText('1 línea · 50 reinas')).toBeTruthy()
    expect(within(exportacion).getByText('USD')).toBeTruthy()
    expect(screen.getAllByText('Nacional')).toHaveLength(3)
  })

  it('filtra por estado y la URL lo recuerda', async () => {
    const { usuario, router } = montar()
    await screen.findByRole('cell', { name: 'Bee Kingdom NZ Ltd' })

    await elegir(usuario, 'Estado', 'Borrador')

    await vi.waitFor(() => expect(filas()).toHaveLength(2))
    expect(
      screen.queryByRole('cell', { name: 'Bee Kingdom NZ Ltd' }),
    ).toBeNull()
    expect(router.state.location.search).toBe('?estado=borrador')
  })

  it('filtra por cliente', async () => {
    const { usuario } = montar()
    await screen.findByRole('cell', { name: 'Bee Kingdom NZ Ltd' })

    await elegir(usuario, 'Cliente', 'Bee Kingdom NZ Ltd')

    await vi.waitFor(() => expect(filas()).toHaveLength(1))
    expect(
      screen.getByRole('cell', { name: 'Bee Kingdom NZ Ltd' }),
    ).toBeTruthy()
  })

  it('sin resultados lo dice y ofrece volver a ver todos', async () => {
    const { usuario } = montar('/ventas/pedidos?estado=entregado')

    expect(
      await screen.findByText('Ningún pedido con estos filtros'),
    ).toBeTruthy()
    await usuario.click(
      screen.getByRole('button', { name: 'Ver todos los pedidos' }),
    )

    await screen.findByRole('cell', { name: 'Bee Kingdom NZ Ltd' })
    expect(filas()).toHaveLength(4)
  })

  it('un estado inventado en la URL se ignora en lugar de mandarlo', async () => {
    montar('/ventas/pedidos?estado=perdido')

    await screen.findByRole('cell', { name: 'Bee Kingdom NZ Ltd' })
    expect(filas()).toHaveLength(4)
  })

  it('el filtro incluye a los clientes dados de baja, marcados', async () => {
    const { usuario } = montar()
    await screen.findByRole('cell', { name: 'Bee Kingdom NZ Ltd' })

    await usuario.click(screen.getByRole('combobox', { name: 'Cliente' }))

    expect(
      await screen.findByRole('option', {
        name: 'Miel del Delta (dado de baja)',
      }),
    ).toBeTruthy()
  })
})
