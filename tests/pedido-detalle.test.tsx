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
const [CARNIOLA] = DATOS_SIMULADOS.razas

describe('detalle del pedido', () => {
  let PedidosPage: ComponentType
  let PedidoPage: ComponentType
  let ProveedorDeSesionFijo: typeof import('../src/auth/sesion').ProveedorDeSesionFijo
  // La misma simulación que la pantalla: para ver qué quedó en los bancos.
  let stock: typeof import('../src/api/disponibilidad').disponibilidad

  // Módulos nuevos en cada test: la API simulada arranca con la semilla y
  // una reserva o cancelación no se arrastra al test siguiente.
  beforeEach(async () => {
    // El Select de Radix usa APIs de puntero y scroll que jsdom no implementa.
    Element.prototype.hasPointerCapture = () => false
    Element.prototype.releasePointerCapture = () => {}
    Element.prototype.scrollIntoView = () => {}
    vi.stubEnv('VITE_DATOS_SIMULADOS', 'true')
    vi.resetModules()
    PedidosPage = (await import('../src/pages/PedidosPage')).default
    PedidoPage = (await import('../src/pages/PedidoPage')).default
    ProveedorDeSesionFijo = (await import('../src/auth/sesion'))
      .ProveedorDeSesionFijo
    stock = (await import('../src/api/disponibilidad')).disponibilidad
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

  type Usuario = ReturnType<typeof userEvent.setup>
  type Zona = ReturnType<typeof within>

  async function elegir(
    usuario: Usuario,
    zona: Zona,
    campo: string,
    opcion: string | RegExp,
  ) {
    await usuario.click(zona.getByRole('combobox', { name: campo }))
    await usuario.click(await screen.findByRole('option', { name: opcion }))
  }

  /** Las reinas de Carniola en B-01 y B-02, en ese orden. */
  const enLosBancos = async () =>
    (await stock.listar(CARNIOLA.id))[0].bancos.map((b) => b.reinas)

  /** Espera la celda de una tabla y devuelve su fila. */
  const waitForCell = async (texto: string) =>
    (await screen.findByRole('cell', { name: texto })).closest(
      'tr',
    ) as HTMLElement

  const acciones = () =>
    ['Reservar', 'Entregar', 'Cancelar pedido'].filter((nombre) =>
      screen.queryByRole('button', { name: nombre }),
    )

  /** Abre Entregar y espera la disponibilidad. */
  async function abrirEntrega(usuario: Usuario): Promise<Zona> {
    await usuario.click(screen.getByRole('button', { name: 'Entregar' }))
    const zona = within(
      await screen.findByRole('dialog', { name: 'Entregar el pedido' }),
    )
    await zona.findAllByRole('combobox', { name: 'Banco' })
    return zona
  }
  const fila = (zona: Zona, n: number, linea = 1) =>
    within(zona.getByRole('group', { name: `Banco ${n} de la línea ${linea}` }))

  /** Reparte la línea 1 entre B-01 y B-02: la primera cantidad se escribe,
   *  la segunda la completa el formulario con lo que falta. */
  async function repartirEntreDosBancos(
    usuario: Usuario,
    zona: Zona,
    enElPrimero: number,
  ) {
    await elegir(usuario, fila(zona, 1), 'Banco', /B-01/)
    const cantidad = fila(zona, 1).getByLabelText('Reinas')
    await usuario.clear(cantidad)
    await usuario.type(cantidad, String(enElPrimero))
    await usuario.click(zona.getByRole('button', { name: 'Agregar banco' }))
    await elegir(usuario, fila(zona, 2), 'Banco', /B-02/)
  }

  it('muestra la cabecera y las líneas con nombres e importes de acá', async () => {
    abrir(RESERVADO)

    expect((await titulo()).textContent).toBe('Pedido de Bee Kingdom NZ Ltd')
    expect(screen.getByText(/Nueva Zelanda \(NZ\) · CPT · USD/)).toBeTruthy()
    expect(screen.getByText('Reservado')).toBeTruthy()

    const [, linea] = screen.getAllByRole('row')
    expect(within(linea).getByText('Reina fecundada')).toBeTruthy()
    expect(within(linea).getByText('Carniola')).toBeTruthy()
    expect(within(linea).getByText('38,50')).toBeTruthy()
    // El neto de la línea y los totales los manda el backend (#113).
    expect(within(linea).getByText('1.925,00')).toBeTruthy()
    // Exportación: neto y total iguales, IVA en cero.
    expect(screen.getAllByText('USD 1.925,00')).toHaveLength(2)
    expect(screen.getByText('USD 0,00')).toBeTruthy()
    expect(screen.getByText('Exportación: sin IVA.')).toBeTruthy()
  })

  it('un pedido nacional muestra neto, IVA y total del backend', async () => {
    abrir(PARA_RESERVAR)
    await titulo()

    expect(screen.getByText('ARS 900.000,00')).toBeTruthy()
    expect(screen.getByText('ARS 189.000,00')).toBeTruthy()
    expect(screen.getByText('ARS 1.089.000,00')).toBeTruthy()
    expect(screen.queryByText('Exportación: sin IVA.')).toBeNull()
  })

  it('la trazabilidad muestra la reserva y, sin entregar, ningún despacho', async () => {
    abrir(RESERVADO)
    await titulo()

    const reserva = (
      await screen.findByText('Línea 1 · Reina fecundada · Carniola')
    ).closest('tr') as HTMLElement
    expect(within(reserva).getByText('50')).toBeTruthy()
    expect(within(reserva).getByText('Activa')).toBeTruthy()
    expect(screen.getByText('Todavía no se entregó.')).toBeTruthy()
    cleanup()

    abrir(PARA_RESERVAR)
    await titulo()
    expect(await screen.findByText('Todavía no se reservó.')).toBeTruthy()
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

  it('entrega un reservado repartido entre dos bancos', async () => {
    const [b01, b02] = await enLosBancos()
    const { usuario } = abrir(RESERVADO)
    await titulo()
    const zona = await abrirEntrega(usuario)

    // Al elegir el banco se propone lo que falta: las 50 de la línea.
    await elegir(usuario, fila(zona, 1), 'Banco', /B-01/)
    expect(
      (fila(zona, 1).getByLabelText('Reinas') as HTMLInputElement).value,
    ).toBe('50')
    await usuario.clear(fila(zona, 1).getByLabelText('Reinas'))
    await usuario.type(fila(zona, 1).getByLabelText('Reinas'), '30')
    expect(zona.getByText('30 de 50')).toBeTruthy()
    await usuario.click(zona.getByRole('button', { name: 'Agregar banco' }))
    // B-01 ya está en la línea: no se ofrece de nuevo.
    await usuario.click(fila(zona, 2).getByRole('combobox', { name: 'Banco' }))
    expect(screen.queryByRole('option', { name: /B-01/ })).toBeNull()
    await usuario.click(screen.getByRole('option', { name: /B-02/ }))
    expect(zona.getByText('50 de 50')).toBeTruthy()

    await usuario.click(zona.getByRole('button', { name: 'Entregar pedido' }))

    expect(
      await screen.findByText('Pedido entregado: 50 reinas despachadas.'),
    ).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('Entregado')).toBeTruthy()
    expect(acciones()).toEqual([])
    expect(await enLosBancos()).toEqual([b01 - 30, b02 - 20])

    // Trazabilidad: la reserva quedó consumida y se ve qué salió de cada banco.
    expect(await screen.findByText('Consumida')).toBeTruthy()
    const salida = (banco: string) =>
      screen.getByRole('cell', { name: banco }).closest('tr') as HTMLElement
    expect(within(await waitForCell('B-01')).getByText('30')).toBeTruthy()
    expect(within(salida('B-02')).getByText('20')).toBeTruthy()
  })

  it('no entrega si a una línea le falta asignar', async () => {
    const { usuario } = abrir(RESERVADO)
    await titulo()
    const zona = await abrirEntrega(usuario)
    await elegir(usuario, fila(zona, 1), 'Banco', /B-01/)
    await usuario.clear(fila(zona, 1).getByLabelText('Reinas'))
    await usuario.type(fila(zona, 1).getByLabelText('Reinas'), '10')

    await usuario.click(zona.getByRole('button', { name: 'Entregar pedido' }))

    expect(zona.getByText('Faltan 40 por asignar.')).toBeTruthy()
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText('Reservado')).toBeTruthy()
  })

  // El DoD del issue: un pedido se crea, se reserva, se entrega repartido
  // entre dos bancos y muestra solo las transiciones habilitadas.
  it('criterio de terminado: crear, reservar y entregar entre dos bancos', async () => {
    const [b01, b02] = await enLosBancos()
    const { usuario } = montar('/ventas/pedidos')
    await usuario.click(
      await screen.findByRole('button', { name: 'Nuevo pedido' }),
    )
    const alta = within(
      await screen.findByRole('dialog', { name: 'Nuevo pedido' }),
    )
    await alta.findByRole('combobox', { name: 'Cliente' })
    await elegir(usuario, alta, 'Cliente', 'Apícola Don Emilio')
    fireEvent.change(alta.getByLabelText('Fecha de entrega'), {
      target: { value: '2026-12-01' },
    })
    const linea = within(alta.getByRole('group', { name: 'Línea 1' }))
    await elegir(usuario, linea, 'Ítem', 'Reina fecundada')
    await elegir(usuario, linea, 'Raza', 'Carniola')
    await usuario.type(linea.getByLabelText('Cantidad'), '12')
    await usuario.type(linea.getByLabelText('Precio (ARS)'), '45000')
    await usuario.click(alta.getByRole('button', { name: 'Crear pedido' }))
    await screen.findByText('Pedido creado en borrador.')

    // El más nuevo va primero en el listado.
    const [nuevo] = await screen.findAllByRole('link', {
      name: 'Apícola Don Emilio',
    })
    await usuario.click(nuevo)
    await titulo()
    expect(screen.getByText('Borrador')).toBeTruthy()
    expect(acciones()).toEqual(['Reservar', 'Cancelar pedido'])

    await usuario.click(screen.getByRole('button', { name: 'Reservar' }))
    await screen.findByText('Pedido reservado: 12 reinas apartadas.')
    expect(screen.getByText('Reservado')).toBeTruthy()
    expect(acciones()).toEqual(['Entregar', 'Cancelar pedido'])

    const zona = await abrirEntrega(usuario)
    await repartirEntreDosBancos(usuario, zona, 5)
    expect(zona.getByText('12 de 12')).toBeTruthy()
    await usuario.click(zona.getByRole('button', { name: 'Entregar pedido' }))

    await screen.findByText('Pedido entregado: 12 reinas despachadas.')
    expect(screen.getByText('Entregado')).toBeTruthy()
    expect(acciones()).toEqual([])
    // 5 de B-01 y 7 de B-02: salieron de los dos bancos.
    expect(await enLosBancos()).toEqual([b01 - 5, b02 - 7])
  })
})
