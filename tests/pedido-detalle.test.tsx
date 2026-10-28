// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
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

const TENANT = '11111111-1111-4111-8111-111111111111'
const [PARA_RESERVAR, RESERVADO, SIN_STOCK, CANCELADO] = DATOS_SIMULADOS.pedidos

describe('detalle del pedido', () => {
  let PedidosPage: ComponentType
  let PedidoPage: ComponentType
  let ProveedorDeSesionFijo: typeof import('../src/auth/sesion').ProveedorDeSesionFijo

  // Módulos nuevos en cada test: la API simulada arranca con la semilla y
  // una reserva o cancelación no se arrastra al test siguiente.
  beforeEach(async () => {
    vi.stubEnv('VITE_DATOS_SIMULADOS', 'true')
    vi.resetModules()
    PedidosPage = (await import('../src/pages/PedidosPage')).default
    PedidoPage = (await import('../src/pages/PedidoPage')).default
    ProveedorDeSesionFijo = (await import('../src/auth/sesion'))
      .ProveedorDeSesionFijo
  })
  afterAll(() => vi.unstubAllEnvs())
  afterEach(cleanup)

  function montar(ruta: string, roles: Rol[] = ['ventas']) {
    const router = createMemoryRouter(
      [
        { path: '/ventas/pedidos', element: <PedidosPage /> },
        { path: '/ventas/pedidos/:id', element: <PedidoPage /> },
      ],
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

  const abrir = (pedido: { id: string }, roles?: Rol[]) =>
    montar(`/ventas/pedidos/${pedido.id}`, roles)

  const titulo = () => screen.findByRole('heading', { level: 1 })

  it('muestra la cabecera y las líneas con nombres e importes de acá', async () => {
    abrir(RESERVADO)

    expect((await titulo()).textContent).toBe('Pedido de Bee Kingdom NZ Ltd')
    expect(screen.getByText(/Nueva Zelanda \(NZ\) · CPT · USD/)).toBeTruthy()
    expect(screen.getByText('Reservado')).toBeTruthy()

    const [, linea] = screen.getAllByRole('row')
    expect(within(linea).getByText('Reina fecundada')).toBeTruthy()
    expect(within(linea).getByText('Carniola')).toBeTruthy()
    expect(within(linea).getByText('38,50')).toBeTruthy()
    // 50 × 38,50, sin pasar por float.
    expect(within(linea).getByText('1.925,00')).toBeTruthy()
    expect(screen.getByText('USD 1.925,00')).toBeTruthy()
  })

  it('con rol de lectura no hay acciones', async () => {
    abrir(PARA_RESERVAR, ['lectura'])

    await titulo()
    expect(screen.queryByRole('button', { name: /Reservar/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Cancelar/ })).toBeNull()
  })

  it('un reservado se cancela pero no se reserva; un cancelado no tiene acciones', async () => {
    abrir(RESERVADO)
    await titulo()
    expect(screen.queryByRole('button', { name: /Reservar/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Cancelar pedido/ })).toBeTruthy()
    cleanup()

    abrir(CANCELADO)
    await titulo()
    expect(screen.queryByRole('button', { name: /Reservar/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Cancelar pedido/ })).toBeNull()
  })

  it('reserva un borrador y lo pasa a reservado', async () => {
    const { usuario } = abrir(PARA_RESERVAR)
    await titulo()

    await usuario.click(screen.getByRole('button', { name: /Reservar/ }))

    expect(
      await screen.findByText('Pedido reservado: 20 reinas apartadas.'),
    ).toBeTruthy()
    expect(await screen.findByText('Reservado')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Reservar/ })).toBeNull()
  })

  it('sin stock dice qué raza falta y cuánto, y no reserva nada', async () => {
    const { usuario } = abrir(SIN_STOCK)
    await titulo()

    await usuario.click(screen.getByRole('button', { name: /Reservar/ }))

    const alerta = await screen.findByRole('alert')
    expect(alerta.textContent).toContain('No hay reinas suficientes')
    expect(alerta.textContent).toContain(
      'Buckfast: pide 30, hay 0 (faltan 30).',
    )
    expect(screen.getByText('Borrador')).toBeTruthy()
  })

  it('cancela solo después de confirmar', async () => {
    const { usuario } = abrir(RESERVADO)
    await titulo()

    await usuario.click(screen.getByRole('button', { name: /Cancelar pedido/ }))
    let dialogo = await screen.findByRole('dialog', {
      name: '¿Cancelar el pedido?',
    })
    expect(within(dialogo).getByText(/Se liberan las reinas/)).toBeTruthy()
    await usuario.click(within(dialogo).getByRole('button', { name: 'Volver' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('Reservado')).toBeTruthy()

    await usuario.click(screen.getByRole('button', { name: /Cancelar pedido/ }))
    dialogo = await screen.findByRole('dialog')
    await usuario.click(
      within(dialogo).getByRole('button', { name: 'Cancelar pedido' }),
    )

    expect(await screen.findByText('Pedido cancelado.')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('Cancelado')).toBeTruthy()
  })

  it('al cancelar no queda a la vista el error de una reserva fallida', async () => {
    const { usuario } = abrir(SIN_STOCK)
    await titulo()
    await usuario.click(screen.getByRole('button', { name: /Reservar/ }))
    await screen.findByText(/No hay reinas suficientes/)

    await usuario.click(screen.getByRole('button', { name: /Cancelar pedido/ }))
    const dialogo = await screen.findByRole('dialog')
    await usuario.click(
      within(dialogo).getByRole('button', { name: 'Cancelar pedido' }),
    )

    expect(await screen.findByText('Pedido cancelado.')).toBeTruthy()
    expect(screen.queryByText(/No hay reinas suficientes/)).toBeNull()
  })

  it('se abre desde el listado y vuelve con los mismos filtros', async () => {
    const { usuario, router } = montar('/ventas/pedidos?estado=reservado')

    await usuario.click(
      await screen.findByRole('link', { name: 'Bee Kingdom NZ Ltd' }),
    )
    expect(await titulo()).toBeTruthy()
    expect(router.state.location.pathname).toBe(
      `/ventas/pedidos/${RESERVADO.id}`,
    )

    await usuario.click(screen.getByRole('link', { name: 'Pedidos' }))
    expect(router.state.location.search).toBe('?estado=reservado')
  })

  it('un pedido que no existe muestra el error', async () => {
    montar('/ventas/pedidos/no-existe')

    expect(await screen.findByText('No existe el pedido.')).toBeTruthy()
  })
})
