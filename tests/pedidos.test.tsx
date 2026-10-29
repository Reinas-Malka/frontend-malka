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
  // La misma instancia simulada que usa la pantalla, para ver lo que se guardó.
  let api: typeof import('../src/api/pedidos').pedidos

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
    api = (await import('../src/api/pedidos')).pedidos
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

  // Al final: el alta simulada queda en memoria y cambia el listado.
  describe('alta', () => {
    type Zona = ReturnType<typeof within>

    async function abrirAlta(usuario: Usuario): Promise<Zona> {
      await usuario.click(
        await screen.findByRole('button', { name: 'Nuevo pedido' }),
      )
      const zona = within(
        await screen.findByRole('dialog', { name: 'Nuevo pedido' }),
      )
      // Espera los catálogos de clientes, ítems y razas.
      await zona.findByRole('combobox', { name: 'Cliente' })
      return zona
    }

    async function elegirEn(
      usuario: Usuario,
      zona: Zona,
      campo: string,
      opcion: string,
    ) {
      await usuario.click(zona.getByRole('combobox', { name: campo }))
      await usuario.click(await screen.findByRole('option', { name: opcion }))
    }

    const linea = (zona: Zona, n: number) =>
      within(zona.getByRole('group', { name: `Línea ${n}` }))

    it('solo admin y ventas ven "Nuevo pedido"', async () => {
      montar()
      await screen.findByRole('cell', { name: 'Bee Kingdom NZ Ltd' })
      expect(screen.queryByRole('button', { name: 'Nuevo pedido' })).toBeNull()
      cleanup()

      montar('/ventas/pedidos', ['ventas'])
      expect(
        await screen.findByRole('button', { name: 'Nuevo pedido' }),
      ).toBeTruthy()
    })

    it('un nacional va en ARS sin destino; los dados de baja no se ofrecen', async () => {
      const { usuario } = montar('/ventas/pedidos', ['ventas'])
      const zona = await abrirAlta(usuario)

      await usuario.click(zona.getByRole('combobox', { name: 'Cliente' }))
      expect(
        screen.queryByRole('option', { name: /Miel del Delta/ }),
      ).toBeNull()
      await usuario.click(
        await screen.findByRole('option', { name: 'Apícola Don Emilio' }),
      )

      expect(
        zona.getByText('Venta nacional: en ARS, sin destino ni incoterm.'),
      ).toBeTruthy()
      expect(zona.queryByRole('combobox', { name: 'Moneda' })).toBeNull()
      expect(zona.queryByRole('combobox', { name: 'Destino' })).toBeNull()
      expect(linea(zona, 1).getByLabelText('Precio (ARS)')).toBeTruthy()
    })

    it('marca cada error en su campo y en su línea sin mandar nada', async () => {
      const { usuario } = montar('/ventas/pedidos', ['ventas'])
      const zona = await abrirAlta(usuario)
      await usuario.click(zona.getByRole('button', { name: 'Agregar línea' }))
      await usuario.type(linea(zona, 1).getByLabelText(/Precio/), '12,345')

      await usuario.click(zona.getByRole('button', { name: 'Crear pedido' }))

      expect(zona.getByText('Elegí el cliente.')).toBeTruthy()
      expect(zona.getByText('Elegí la fecha de entrega.')).toBeTruthy()
      expect(linea(zona, 1).getByText(/hasta 2 decimales/)).toBeTruthy()
      expect(linea(zona, 2).getByText('Elegí el ítem.')).toBeTruthy()
      expect(
        linea(zona, 2).getByText('La cantidad es un número entero.'),
      ).toBeTruthy()

      // Corregir un campo borra solo su error.
      await usuario.type(linea(zona, 2).getByLabelText('Cantidad'), '3')
      expect(
        linea(zona, 2).queryByText('La cantidad es un número entero.'),
      ).toBeNull()
      expect(linea(zona, 2).getByText('Elegí el ítem.')).toBeTruthy()
    })

    it('quita líneas pero deja al menos una', async () => {
      const { usuario } = montar('/ventas/pedidos', ['ventas'])
      const zona = await abrirAlta(usuario)
      const quitar = (n: number) =>
        zona.getByRole('button', { name: `Quitar la línea ${n}` })

      expect(quitar(1).hasAttribute('disabled')).toBe(true)
      await usuario.click(zona.getByRole('button', { name: 'Agregar línea' }))
      await usuario.click(quitar(2))

      expect(zona.getAllByRole('group')).toHaveLength(1)
    })

    it('crea una exportación en borrador y la suma al listado', async () => {
      const { usuario } = montar('/ventas/pedidos', ['ventas'])
      await screen.findByRole('cell', { name: 'Bee Kingdom NZ Ltd' })
      const zona = await abrirAlta(usuario)

      await elegirEn(usuario, zona, 'Cliente', 'Bee Kingdom NZ Ltd')
      expect(zona.getByRole('combobox', { name: 'Moneda' }).textContent).toBe(
        'USD',
      )
      expect(
        zona.getByRole('combobox', { name: 'Destino' }).textContent,
      ).toContain('(NZ)')
      fireEvent.change(zona.getByLabelText('Fecha de entrega'), {
        target: { value: '2026-12-01' },
      })
      const primera = linea(zona, 1)
      await elegirEn(usuario, primera, 'Ítem', 'Reina fecundada')
      await elegirEn(usuario, primera, 'Raza', 'Carniola')
      await usuario.type(primera.getByLabelText('Cantidad'), '20')
      await usuario.type(primera.getByLabelText('Precio (USD)'), '1.500,50')

      await usuario.click(zona.getByRole('button', { name: 'Crear pedido' }))

      expect(await screen.findByText('Pedido creado en borrador.')).toBeTruthy()
      expect(screen.queryByRole('dialog')).toBeNull()
      await vi.waitFor(() => expect(filas()).toHaveLength(5))
      const [nuevo] = (await api.listar()).items
      expect(nuevo).toMatchObject({
        estado: 'borrador',
        moneda: 'USD',
        destino_pais: 'NZ',
        incoterm: null,
        fecha_entrega_solicitada: '2026-12-01',
      })
      expect(nuevo.items[0]).toMatchObject({
        cantidad: 20,
        precio_unitario: '1500.50',
      })
    }, 15_000) // tipea en varios campos y abre desplegables: en un CI cargado pasa los 5 s
  })
})
