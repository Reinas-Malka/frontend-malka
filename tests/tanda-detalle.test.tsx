// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
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
import { formatearFecha } from '../src/lib/fechas'

const TENANT = '11111111-1111-4111-8111-111111111111'
// Cosechada, en el parque (Buckfast, en Monte Chico) y recién traslarvada.
const [COSECHADA, EN_PARQUE, RECIEN] = DATOS_SIMULADOS.tandas
const ACCIONES = ['Descartar', 'Introducir', 'Cosechar', 'Pasar a banco']

describe('detalle de la tanda', () => {
  let TandasPage: ComponentType
  let TandaPage: ComponentType
  let ProveedorDeSesionFijo: typeof import('../src/auth/sesion').ProveedorDeSesionFijo
  // La misma simulación que la pantalla.
  let api: typeof import('../src/api/tandas').tandas
  let recursos: typeof import('../src/api/recursos')

  // Módulos nuevos en cada test: la simulación arranca con la semilla y una
  // operación no se arrastra al test siguiente.
  beforeEach(async () => {
    // El Select de Radix usa APIs de puntero y scroll que jsdom no implementa.
    Element.prototype.hasPointerCapture = () => false
    Element.prototype.releasePointerCapture = () => {}
    Element.prototype.scrollIntoView = () => {}
    vi.stubEnv('VITE_DATOS_SIMULADOS', 'true')
    vi.resetModules()
    TandasPage = (await import('../src/pages/TandasPage')).default
    TandaPage = (await import('../src/pages/TandaPage')).default
    ProveedorDeSesionFijo = (await import('../src/auth/sesion'))
      .ProveedorDeSesionFijo
    api = (await import('../src/api/tandas')).tandas
    recursos = await import('../src/api/recursos')
  })
  afterAll(() => vi.unstubAllEnvs())
  afterEach(cleanup)

  function montar(ruta: string, roles: Rol[] = ['produccion']) {
    const router = createMemoryRouter(
      [
        { path: '/produccion/tandas', element: <TandasPage /> },
        { path: '/produccion/tandas/:id', element: <TandaPage /> },
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

  const abrir = (tanda: { id: string }, roles?: Rol[]) =>
    montar(`/produccion/tandas/${tanda.id}`, roles)

  type Usuario = ReturnType<typeof userEvent.setup>

  const acciones = () =>
    ACCIONES.filter((nombre) => screen.queryByRole('button', { name: nombre }))

  async function operar(usuario: Usuario, boton: string, titulo: string) {
    await usuario.click(screen.getByRole('button', { name: boton }))
    return within(await screen.findByRole('dialog', { name: titulo }))
  }

  async function escribir(usuario: Usuario, campo: HTMLElement, valor: string) {
    await usuario.clear(campo)
    await usuario.type(campo, valor)
  }

  async function elegir(
    usuario: Usuario,
    zona: ReturnType<typeof within>,
    campo: string,
    opcion: RegExp,
  ) {
    await usuario.click(zona.getByRole('combobox', { name: campo }))
    await usuario.click(await screen.findByRole('option', { name: opcion }))
  }

  /** El cartel con lo que devolvió la última operación. */
  const resultado = () =>
    screen.findByText(/^(Se |Pasaron |Pasó )/, { selector: 'p' })

  it('muestra cargando y después la tanda con sus celdas y dónde están', async () => {
    abrir(EN_PARQUE, ['lectura'])
    expect(screen.getByRole('status', { name: 'Cargando datos' })).toBeTruthy()

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Tanda de Buckfast',
      }),
    ).toBeTruthy()
    expect(
      screen.getByText(
        new RegExp(`Traslarve: ${formatearFecha(EN_PARQUE.fecha_traslarve)}`),
      ),
    ).toBeTruthy()
    expect(screen.getByText(/fila 3, posición 3/)).toBeTruthy()
    // 400 celdas en los 9 núcleos de Monte Chico, con fila y posición.
    expect(
      screen.getByText(/400 celdas en 9 núcleos/, { selector: 'span' }),
    ).toBeTruthy()
    const nucleos = screen.getByRole('table', {
      name: 'Núcleos ocupados en Parque Monte Chico',
    })
    expect(within(nucleos).getAllByRole('row')).toHaveLength(10)
    expect(screen.getByText('Todavía no hay reinas cosechadas.')).toBeTruthy()
  })

  it('de una tanda cosechada muestra los bancos y los núcleos libres', async () => {
    abrir(COSECHADA, ['lectura'])

    const bancos = await screen.findByRole('region', { name: 'En bancos' })
    expect(within(bancos).getByText('Banco B-01')).toBeTruthy()
    expect(within(bancos).getAllByText('110 reinas')).toHaveLength(2)
    expect(
      screen.getByText('Ya se cosechó: los núcleos quedaron libres.'),
    ).toBeTruthy()
  })

  it('si la tanda no existe, lo dice y ofrece reintentar', async () => {
    montar('/produccion/tandas/no-existe')

    const alerta = await screen.findByRole('alert')
    expect(alerta.textContent).toMatch(/No existe la tanda/)
    expect(
      within(alerta).getByRole('button', { name: 'Reintentar' }),
    ).toBeTruthy()
  })

  it('lectura y ventas ven la tanda pero no las operaciones', async () => {
    for (const rol of ['lectura', 'ventas'] as Rol[]) {
      abrir(RECIEN, [rol])
      await screen.findByRole('heading', { level: 1 })
      expect(acciones()).toEqual([])
      cleanup()
    }
  })

  it('producción ve solo las operaciones que tienen sentido', async () => {
    abrir(RECIEN)
    await screen.findByRole('heading', { level: 1 })
    expect(acciones()).toEqual(['Descartar', 'Introducir'])
    cleanup()

    abrir(EN_PARQUE, ['admin'])
    await screen.findByRole('heading', { level: 1 })
    expect(acciones()).toEqual(['Cosechar'])
  })

  it('flujo completo: introducir, cosechar y pasar a banco', async () => {
    const { usuario } = abrir(RECIEN)
    await screen.findByRole('heading', { level: 1 })

    // Introducir: parque y cantidad; los núcleos los elige el sistema.
    let modal = await operar(usuario, 'Introducir', 'Introducir en un parque')
    await elegir(usuario, modal, 'Parque', /Parque La Loma/)
    expect(
      (modal.getByLabelText('Celdas a introducir') as HTMLInputElement).value,
    ).toBe('134')
    await escribir(usuario, modal.getByLabelText('Celdas a introducir'), '120')
    await usuario.click(
      modal.getByRole('button', { name: 'Introducir celdas' }),
    )
    expect((await resultado()).textContent).toBe(
      'Se introdujeron 120 celdas en Parque La Loma, repartidas en 15 núcleos.',
    )
    const reparto = screen.getByRole('table', {
      name: 'Reparto de la introducción',
    })
    expect(within(reparto).getAllByRole('row')).toHaveLength(16)
    expect(
      await screen.findByText(/120 celdas en 15 núcleos/, {
        selector: 'span',
      }),
    ).toBeTruthy()

    // Cosechar: cuántas reinas; el resto del parque queda descartado.
    modal = await operar(usuario, 'Cosechar', 'Cosechar la tanda')
    await escribir(usuario, modal.getByLabelText('Reinas cosechadas'), '95')
    expect(
      modal.getByText(/Las otras 25 celdas quedan descartadas/),
    ).toBeTruthy()
    await usuario.click(modal.getByRole('button', { name: 'Cosechar' }))
    expect((await resultado()).textContent).toBe(
      'Se cosecharon 95 reinas. Las otras 25 celdas del parque quedaron descartadas.',
    )
    expect(
      await screen.findByText('Ya se cosechó: los núcleos quedaron libres.'),
    ).toBeTruthy()
    expect(
      screen.getByText('95 reinas cosechadas todavía sin banco.'),
    ).toBeTruthy()
    // Cosechada: ya no se introduce ni se cosecha otra vez.
    expect(acciones()).toEqual(['Descartar', 'Pasar a banco'])

    // Pasar a banco: al elegir el banco se propone lo que entra.
    modal = await operar(usuario, 'Pasar a banco', 'Pasar reinas a un banco')
    await elegir(usuario, modal, 'Banco', /B-01 · caben 166/)
    expect(
      (modal.getByLabelText('Reinas a pasar') as HTMLInputElement).value,
    ).toBe('95')
    await usuario.click(modal.getByRole('button', { name: 'Pasar a banco' }))
    expect((await resultado()).textContent).toBe(
      'Pasaron 95 reinas al banco B-01.',
    )
    const bancos = screen.getByRole('region', { name: 'En bancos' })
    await waitFor(() =>
      expect(within(bancos).getByText('Banco B-01')).toBeTruthy(),
    )
    expect(within(bancos).getByText('95 reinas')).toBeTruthy()
    expect(acciones()).toEqual(['Descartar'])

    const detalle = await api.obtener(RECIEN.id)
    expect(detalle.celdas_por_estado).toEqual({
      descartada: 26,
      trasladada: 14,
      enjaulada: 95,
    })
  })

  it('valida antes de mandar y no deja pedir más de lo que hay', async () => {
    const { usuario } = abrir(RECIEN)
    await screen.findByRole('heading', { level: 1 })

    const modal = await operar(usuario, 'Descartar', 'Descartar celdas')
    await escribir(usuario, modal.getByLabelText('Celdas a descartar'), '500')
    await usuario.click(modal.getByRole('button', { name: 'Descartar celdas' }))

    expect((await modal.findByRole('alert')).textContent).toMatch(
      /No pueden ser más de 134/,
    )
    // No se mandó nada.
    expect((await api.obtener(RECIEN.id)).celdas_por_estado.trasladada).toBe(
      134,
    )
  })

  it('un error del backend se muestra claro, sin códigos, en su campo', async () => {
    // Un parque nuevo, todavía sin núcleos.
    await recursos.parques.crear({
      nombre: 'Parque Vacío',
      ubicacion: 'Predio nuevo',
      capacidad_max: 10,
    })
    const { usuario } = abrir(RECIEN)
    await screen.findByRole('heading', { level: 1 })

    const modal = await operar(usuario, 'Introducir', 'Introducir en un parque')
    await elegir(usuario, modal, 'Parque', /Parque Vacío/)
    await usuario.click(
      modal.getByRole('button', { name: 'Introducir celdas' }),
    )

    const alerta = await modal.findByRole('alert')
    expect(alerta.textContent).toBe(
      'El parque no tiene núcleos activos: cargale núcleos o elegí otro parque.',
    )
    expect(alerta.textContent).not.toMatch(/parque_sin_nucleos/)
    // El modal sigue abierto para elegir otro parque.
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('desde el listado, la fecha de traslarve lleva al detalle', async () => {
    const { usuario } = montar('/produccion/tandas', ['lectura'])

    await usuario.click(
      await screen.findByRole('link', {
        name: formatearFecha(COSECHADA.fecha_traslarve),
      }),
    )
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Tanda de Carniola',
      }),
    ).toBeTruthy()
    await usuario.click(screen.getByRole('link', { name: 'Tandas' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Tandas' }),
    ).toBeTruthy()
  })

  it('el listado se pide de a una página y trae más con "Cargar más"', async () => {
    const { LIMITE_TANDAS } = await import('../src/api/tandas')
    const [carniola] = DATOS_SIMULADOS.razas
    const [cupulas] = DATOS_SIMULADOS.materiales
    const nuevas = LIMITE_TANDAS
    for (let i = 0; i < nuevas; i++)
      await api.crear({
        raza_id: carniola.id,
        material_id: cupulas.id,
        fecha_traslarve: '2026-10-20',
        cuadros: 1,
      })
    const { usuario } = montar('/produccion/tandas', ['lectura'])

    await waitFor(() =>
      expect(screen.getAllByLabelText('Celdas por estado')).toHaveLength(
        LIMITE_TANDAS,
      ),
    )
    await usuario.click(
      screen.getByRole('button', { name: 'Cargar más tandas' }),
    )
    await waitFor(() =>
      expect(screen.getAllByLabelText('Celdas por estado')).toHaveLength(
        nuevas + DATOS_SIMULADOS.tandas.length,
      ),
    )
    expect(
      screen.queryByRole('button', { name: 'Cargar más tandas' }),
    ).toBeNull()
  })
})
