// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  configure,
  render,
  screen,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
import { embarquesSimulados } from '../src/api/embarques'
import { recursoSimulado } from '../src/api/recurso'
import type { Identidad, Rol } from '../src/auth/identidad'
import { DATOS_SIMULADOS } from '../src/datos/simulados'
import { formatearFecha } from '../src/lib/fechas'
import { leerFiltrosDeEmbarques } from '../src/modulos/exportacion/embarques'
import { leerFiltrosDeTandas } from '../src/modulos/produccion/tandas'

const { tandas, razas, parques, nucleos, embarques, clientes } = DATOS_SIMULADOS
const [COSECHADA, EN_PARQUE, RECIEN] = tandas
const BUCKFAST = razas[1]
const [LA_LOMA, MONTE_CHICO] = parques
const [EN_TRANSITO] = embarques
const [DON_EMILIO] = clientes

describe('filtros de las APIs simuladas, como el backend', () => {
  it('un recurso simulado aplica sus filtros propios además de las bajas', async () => {
    const api = recursoSimulado<
      { id: string; activo: boolean; grupo: string },
      never,
      never
    >(
      [
        { id: '1', activo: true, grupo: 'a' },
        { id: '2', activo: true, grupo: 'b' },
        { id: '3', activo: false, grupo: 'a' },
      ],
      () => {
        throw new Error('sin altas')
      },
      undefined,
      (fila, { grupo }) => !grupo || fila.grupo === grupo,
    )
    const ids = async (filtros: Record<string, string>) =>
      (await api.listar({ filtros })).items.map((f) => f.id)
    expect(await ids({ grupo: 'a' })).toEqual(['1'])
    expect(await ids({ grupo: 'a', incluir_inactivos: 'true' })).toEqual([
      '1',
      '3',
    ])
    expect(await ids({})).toEqual(['1', '2'])
  })

  it('los embarques se filtran por estado', async () => {
    const api = embarquesSimulados()
    const deEstado = async (estado?: (typeof embarques)[number]['estado']) =>
      (await api.listar(undefined, { estado })).items.map((e) => e.id)
    expect(await deEstado('en_transito')).toEqual([EN_TRANSITO.id])
    expect(await deEstado('entregado')).toEqual([])
    expect(await deEstado()).toHaveLength(embarques.length)
  })

  it('los filtros de la URL ignoran lo que no se entiende', () => {
    expect(
      leerFiltrosDeEmbarques(new URLSearchParams('estado=perdido')),
    ).toEqual({ estado: undefined })
    expect(
      leerFiltrosDeEmbarques(new URLSearchParams('estado=entregado')),
    ).toEqual({ estado: 'entregado' })
    expect(
      leerFiltrosDeTandas(
        new URLSearchParams(
          `raza=${BUCKFAST.id}&desde=2026-13-01&hasta=2026-09-30`,
        ),
      ),
    ).toEqual({ raza_id: BUCKFAST.id, desde: undefined, hasta: '2026-09-30' })
  })
})

describe('pantallas con los filtros del backend', () => {
  // Los módulos de api deciden simulado/real al cargarse: el flag va antes.
  let rutas: RouteObject[]
  let ProveedorDeSesionFijo: (p: {
    identidad: Identidad
    children: ReactNode
  }) => ReactNode
  let nucleosApi: typeof import('../src/api/recursos').nucleos

  beforeAll(async () => {
    // Las pantallas son lazy: la primera que baja su chunk en una máquina
    // lenta tarda más que el segundo por defecto (como en rutas.test.tsx).
    configure({ asyncUtilTimeout: 5000 })
    // El Select de Radix usa APIs de puntero y scroll que jsdom no implementa.
    Element.prototype.hasPointerCapture = () => false
    Element.prototype.releasePointerCapture = () => {}
    Element.prototype.scrollIntoView = () => {}
    vi.stubEnv('VITE_DATOS_SIMULADOS', 'true')
    vi.resetModules()
    rutas = (await import('../src/app/router')).rutas
    ProveedorDeSesionFijo = (await import('../src/auth/sesion'))
      .ProveedorDeSesionFijo
    nucleosApi = (await import('../src/api/recursos')).nucleos
  })
  afterAll(() => {
    configure({ asyncUtilTimeout: 1000 })
    vi.unstubAllEnvs()
  })
  afterEach(cleanup)

  function montar(ruta: string, roles: Rol[] = ['admin']) {
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
    return { usuario: userEvent.setup(), router }
  }

  const principal = async () => within(await screen.findByRole('main'))

  async function elegir(
    usuario: ReturnType<typeof userEvent.setup>,
    campo: string,
    opcion: string,
  ) {
    await usuario.click(await screen.findByRole('combobox', { name: campo }))
    await usuario.click(await screen.findByRole('option', { name: opcion }))
  }

  describe('tandas por raza y período de traslarve', () => {
    const fecha = (t: { fecha_traslarve: string }) =>
      formatearFecha(t.fecha_traslarve)

    it('con ?raza= muestra solo las tandas de esa raza', async () => {
      montar(`/produccion/tandas?raza=${BUCKFAST.id}`)
      expect(
        await screen.findByRole('link', { name: fecha(EN_PARQUE) }),
      ).toBeTruthy()
      expect(screen.queryByRole('link', { name: fecha(COSECHADA) })).toBeNull()
      expect(screen.queryByRole('link', { name: fecha(RECIEN) })).toBeNull()
    })

    it('elegir la raza la pone en la URL y se puede volver a todas', async () => {
      const { usuario, router } = montar('/produccion/tandas')
      await screen.findByRole('link', { name: fecha(COSECHADA) })

      await elegir(usuario, 'Raza', 'Buckfast')

      expect(router.state.location.search).toBe(`?raza=${BUCKFAST.id}`)
      await vi.waitFor(() =>
        expect(
          screen.queryByRole('link', { name: fecha(COSECHADA) }),
        ).toBeNull(),
      )
      await elegir(usuario, 'Raza', 'Todas las razas')
      expect(router.state.location.search).toBe('')
      expect(
        await screen.findByRole('link', { name: fecha(COSECHADA) }),
      ).toBeTruthy()
    })

    it('filtra por período de traslarve, con los dos días incluidos', async () => {
      montar(
        `/produccion/tandas?desde=${EN_PARQUE.fecha_traslarve}&hasta=${RECIEN.fecha_traslarve}`,
      )
      expect(
        await screen.findByRole('link', { name: fecha(EN_PARQUE) }),
      ).toBeTruthy()
      expect(screen.getByRole('link', { name: fecha(RECIEN) })).toBeTruthy()
      expect(screen.queryByRole('link', { name: fecha(COSECHADA) })).toBeNull()
    })

    it('un período al revés se avisa en el campo y no muestra el listado', async () => {
      montar('/produccion/tandas?desde=2026-09-30&hasta=2026-09-01')
      const main = await principal()
      expect((await main.findByRole('alert')).textContent).toBe(
        'La fecha final no puede ser anterior a la inicial.',
      )
      expect(main.getByText('Revisá el período')).toBeTruthy()
      expect(main.queryByRole('table')).toBeNull()
    })

    it('sin resultados lo dice y deja ver todas', async () => {
      const { usuario } = montar(
        `/produccion/tandas?raza=${BUCKFAST.id}&hasta=2026-09-01`,
      )
      expect(
        await screen.findByText('Ninguna tanda con estos filtros'),
      ).toBeTruthy()
      await usuario.click(
        screen.getByRole('button', { name: 'Ver todas las tandas' }),
      )
      expect(
        await screen.findByRole('link', { name: fecha(COSECHADA) }),
      ).toBeTruthy()
    })
  })

  describe('embarques por estado', () => {
    it('con ?estado= muestra solo los de ese estado', async () => {
      montar('/exportacion/embarques?estado=en_transito', ['ventas'])
      expect(
        await screen.findByRole('link', { name: 'Chile (CL)' }),
      ).toBeTruthy()
      expect(screen.queryByRole('link', { name: 'España (ES)' })).toBeNull()
    })

    it('elegir un estado sin embarques lo dice y deja volver a todos', async () => {
      const { usuario, router } = montar('/exportacion/embarques', ['lectura'])
      await screen.findByRole('link', { name: 'Chile (CL)' })

      await elegir(usuario, 'Estado', 'Entregado')

      expect(router.state.location.search).toBe('?estado=entregado')
      expect(await screen.findByText('Ningún embarque entregado')).toBeTruthy()
      await usuario.click(
        screen.getByRole('button', { name: 'Ver todos los embarques' }),
      )
      expect(
        await screen.findByRole('link', { name: 'Chile (CL)' }),
      ).toBeTruthy()
      expect(screen.getByRole('link', { name: 'España (ES)' })).toBeTruthy()
    })
  })

  describe('núcleos por parque', () => {
    const celdasDeParque = async () =>
      (await principal())
        .getAllByRole('row')
        .slice(1)
        .map((fila) => within(fila).getAllByRole('cell')[0].textContent)

    it('el recurso simulado filtra por ?parque_id= como el backend', async () => {
      const { items } = await nucleosApi.listar({
        limite: 100,
        filtros: { parque_id: MONTE_CHICO.id },
      })
      expect(items).toHaveLength(
        nucleos.filter((n) => n.parque_id === MONTE_CHICO.id).length,
      )
      expect(items.every((n) => n.parque_id === MONTE_CHICO.id)).toBe(true)
    })

    it('con ?parque= muestra solo los núcleos de ese parque', async () => {
      montar(`/produccion/nucleos?parque=${MONTE_CHICO.id}`, ['lectura'])
      await screen.findAllByRole('cell', { name: MONTE_CHICO.nombre })
      expect(new Set(await celdasDeParque())).toEqual(
        new Set([MONTE_CHICO.nombre]),
      )
    })

    it('elegir el parque filtra y lo pone en la URL', async () => {
      const { usuario, router } = montar('/produccion/nucleos', ['produccion'])
      await screen.findAllByRole('cell', { name: LA_LOMA.nombre })

      await elegir(usuario, 'Parque', MONTE_CHICO.nombre)

      expect(router.state.location.search).toBe(`?parque=${MONTE_CHICO.id}`)
      await vi.waitFor(async () =>
        expect(new Set(await celdasDeParque())).toEqual(
          new Set([MONTE_CHICO.nombre]),
        ),
      )
    })

    it('un parque que no existe no filtra', async () => {
      montar('/produccion/nucleos?parque=no-existe', ['lectura'])
      expect(
        await screen.findAllByRole('cell', { name: LA_LOMA.nombre }),
      ).toBeTruthy()
    })

    it('desde Parques se llega a los núcleos de cada parque', async () => {
      montar('/produccion/parques', ['lectura'])
      const enlace = await screen.findByRole('link', {
        name: new RegExp(`^Ver los núcleos de ${MONTE_CHICO.nombre}`),
      })
      expect(enlace.getAttribute('href')).toBe(
        `/produccion/nucleos?parque=${MONTE_CHICO.id}`,
      )
    })
  })

  describe('detalle de un cliente', () => {
    it('desde Clientes, el nombre lleva a su detalle', async () => {
      montar('/ventas/clientes', ['ventas'])
      const enlace = await screen.findByRole('link', {
        name: DON_EMILIO.nombre,
      })
      expect(enlace.getAttribute('href')).toBe(
        `/ventas/clientes/${DON_EMILIO.id}`,
      )
    })

    it('muestra sus datos fiscales y lleva a sus pedidos y comprobantes', async () => {
      montar(`/ventas/clientes/${DON_EMILIO.id}`, ['lectura'])
      const main = await principal()
      expect((await main.findByRole('heading', { level: 1 })).textContent).toBe(
        DON_EMILIO.nombre,
      )
      expect(main.getByText('Responsable inscripto')).toBeTruthy()
      expect(main.getByText('CUIT 20-30521189-4')).toBeTruthy()
      expect(main.getByText('Factura A')).toBeTruthy()
      expect(
        main
          .getByRole('link', { name: 'Ver sus pedidos' })
          .getAttribute('href'),
      ).toBe(`/ventas/pedidos?cliente=${DON_EMILIO.id}`)
      expect(
        main
          .getByRole('link', { name: 'Ver sus comprobantes' })
          .getAttribute('href'),
      ).toBe(`/ventas/comprobantes?cliente=${DON_EMILIO.id}`)
    })

    it('uno que no existe lo dice, sin códigos', async () => {
      montar('/ventas/clientes/no-existe', ['ventas'])
      expect(
        await screen.findByText('No encontramos este cliente'),
      ).toBeTruthy()
    })

    it('producción no lo abre: es de ventas', async () => {
      montar(`/ventas/clientes/${DON_EMILIO.id}`, ['produccion'])
      expect(
        await screen.findByText('Esta sección no está disponible para tu rol.'),
      ).toBeTruthy()
    })
  })
})
