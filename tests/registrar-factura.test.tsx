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
import { DATOS_SIMULADOS } from '../src/datos/simulados'

const TENANT = '11111111-1111-4111-8111-111111111111'
// Bee Kingdom NZ Ltd, en USD y reservado; y uno cancelado.
const [, EXPORTACION, , CANCELADO] = DATOS_SIMULADOS.pedidos

vi.mock('../src/documentos/leerQrDelPdf', () => ({
  leerQrDelPdf: async () => null,
}))

describe('registrar la factura desde el pedido', () => {
  let PedidoPage: ComponentType
  let ComprobantesPage: ComponentType
  let ProveedorDeSesionFijo: typeof import('../src/auth/sesion').ProveedorDeSesionFijo

  beforeAll(async () => {
    Element.prototype.hasPointerCapture = () => false
    Element.prototype.releasePointerCapture = () => {}
    Element.prototype.scrollIntoView = () => {}
    vi.stubEnv('VITE_DATOS_SIMULADOS', 'true')
    vi.resetModules()
    PedidoPage = (await import('../src/pages/PedidoPage')).default
    ComprobantesPage = (await import('../src/pages/ComprobantesPage')).default
    ProveedorDeSesionFijo = (await import('../src/auth/sesion'))
      .ProveedorDeSesionFijo
  })
  afterAll(() => vi.unstubAllEnvs())
  afterEach(cleanup)

  function montar(pedido: { id: string }, roles: Rol[]) {
    const router = createMemoryRouter(
      [
        { path: '/ventas/pedidos/:id', element: <PedidoPage /> },
        { path: '/ventas/comprobantes', element: <ComprobantesPage /> },
      ],
      { initialEntries: [`/ventas/pedidos/${pedido.id}`] },
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

  it('abre el alta del comprobante con el cliente y la moneda del pedido', async () => {
    const { usuario, router } = montar(EXPORTACION, ['ventas'])

    await usuario.click(
      await screen.findByRole('link', { name: 'Registrar factura' }),
    )

    const dialogo = await screen.findByRole('dialog', {
      name: 'Cargar comprobante',
    })
    const combo = (nombre: string) =>
      within(dialogo).getByRole('combobox', { name: nombre }).textContent
    await within(dialogo).findByRole('combobox', { name: 'Cliente' })
    expect(combo('Cliente')).toMatch('Bee Kingdom NZ Ltd')
    expect(combo('Moneda')).toMatch('USD')
    expect(combo('Letra')).toMatch('Factura E')
    expect(router.state.location.pathname).toBe('/ventas/comprobantes')
    expect(router.state.location.search).toBe(
      `?alta=1&cliente=${EXPORTACION.cliente_id}&moneda=USD`,
    )

    // Al cerrar se limpia el pedido de alta: volver no la reabre.
    await usuario.click(
      within(dialogo).getByRole('button', { name: 'Cancelar' }),
    )
    expect(router.state.location.search).toBe(
      `?cliente=${EXPORTACION.cliente_id}`,
    )
  }, 15_000)

  it('admin también lo ve', async () => {
    montar(EXPORTACION, ['admin'])

    expect(
      await screen.findByRole('link', { name: 'Registrar factura' }),
    ).toBeTruthy()
  })

  it('lectura no ve "Registrar factura"', async () => {
    montar(EXPORTACION, ['lectura'])

    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('link', { name: 'Registrar factura' })).toBeNull()
  })

  it('un pedido cancelado no ofrece registrar la factura', async () => {
    montar(CANCELADO, ['ventas'])

    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('link', { name: 'Registrar factura' })).toBeNull()
  })
})
