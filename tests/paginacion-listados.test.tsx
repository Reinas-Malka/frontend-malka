// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
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
import type { Embarque, MovimientoMaterial } from '../src/tipos/dominio'

const TENANT = '11111111-1111-4111-8111-111111111111'

// Van antes que los vi.mock, que se elevan al principio del archivo.
const { EXTRA, dia } = vi.hoisted(() => ({
  /** Las filas que sobran de la primera página: llegan con "Cargar más". */
  EXTRA: 3,
  // Un día por fila, del más nuevo al más viejo: así el orden del backend
  // deja las EXTRA filas más viejas en la segunda página.
  dia: (i: number) =>
    new Date(Date.UTC(2026, 9, 31) - i * 86_400_000).toISOString().slice(0, 10),
}))

// Más embarques que el límite: los primeros a Chile, los más viejos a
// Nueva Zelanda. Se mockean antes de que las pantallas importen la API.
vi.mock('../src/api/embarques', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/api/embarques')>()
  const { DATOS_SIMULADOS } = await import('../src/datos/simulados')
  const total = original.LIMITE_EMBARQUES + EXTRA
  const semilla: Embarque[] = Array.from({ length: total }, (_, i) => ({
    ...DATOS_SIMULADOS.embarques[0],
    id: `embarque-${i}`,
    destino_pais: i < original.LIMITE_EMBARQUES ? 'CL' : 'NZ',
    fecha_vuelo: dia(i),
    awb: null,
  }))
  return { ...original, embarques: original.embarquesSimulados(semilla, []) }
})

// Lo mismo con los movimientos de un material: los más viejos son ajustes
// con un motivo que se reconoce.
vi.mock('../src/api/movimientos', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../src/api/movimientos')>()
  const { DATOS_SIMULADOS } = await import('../src/datos/simulados')
  const material = DATOS_SIMULADOS.materiales[0]
  const total = original.LIMITE_MOVIMIENTOS + EXTRA
  const semilla: MovimientoMaterial[] = Array.from(
    { length: total },
    (_, i) => ({
      ...DATOS_SIMULADOS.movimientos[0],
      id: `movimiento-${i}`,
      material_id: material.id,
      tipo: i < original.LIMITE_MOVIMIENTOS ? 'compra' : 'ajuste',
      cantidad: '10',
      tanda_id: null,
      motivo: i < original.LIMITE_MOVIMIENTOS ? null : `Conteo viejo ${i}`,
      fecha: dia(i),
    }),
  )
  return {
    ...original,
    movimientos: original.movimientosSimulados(semilla),
  }
})

/** Más de 100 filas en jsdom: en un CI cargado pasan los 5 s por defecto. */
const LENTO = 15_000

describe('listados que pasan del límite de una página', () => {
  // Los módulos de api deciden simulado/real al cargarse: el flag va antes.
  let EmbarquesPage: ComponentType
  let MaterialPage: ComponentType
  let ProveedorDeSesionFijo: typeof import('../src/auth/sesion').ProveedorDeSesionFijo
  let api: typeof import('../src/api/embarques')
  let materialId: string
  let limiteMovimientos: number

  beforeAll(async () => {
    vi.stubEnv('VITE_DATOS_SIMULADOS', 'true')
    vi.resetModules()
    EmbarquesPage = (await import('../src/pages/EmbarquesPage')).default
    MaterialPage = (await import('../src/pages/MaterialPage')).default
    ProveedorDeSesionFijo = (await import('../src/auth/sesion'))
      .ProveedorDeSesionFijo
    api = await import('../src/api/embarques')
    materialId = (await import('../src/datos/simulados')).DATOS_SIMULADOS
      .materiales[0].id
    limiteMovimientos = (await import('../src/api/movimientos'))
      .LIMITE_MOVIMIENTOS
  })
  afterAll(() => vi.unstubAllEnvs())
  afterEach(cleanup)

  function montar(ruta: string, roles: Rol[]) {
    const consultas = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const router = createMemoryRouter(
      [
        { path: '/exportacion/embarques', element: <EmbarquesPage /> },
        { path: '/produccion/materiales/:id', element: <MaterialPage /> },
      ],
      { initialEntries: [ruta] },
    )
    render(
      <ProveedorDeSesionFijo
        identidad={{ email: 'x@malka.test', roles, tenantId: TENANT }}
      >
        <QueryClientProvider client={consultas}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ProveedorDeSesionFijo>,
    )
    return consultas
  }

  it(
    'embarques: muestra la primera página y "Cargar más" suma las siguientes',
    async () => {
      const usuario = userEvent.setup()
      montar('/exportacion/embarques', ['lectura'])

      const cargarMas = await screen.findByRole('button', {
        name: 'Cargar más embarques',
      })
      expect(screen.getAllByRole('link', { name: 'Chile (CL)' }).length).toBe(
        api.LIMITE_EMBARQUES,
      )
      expect(
        screen.queryByRole('link', { name: 'Nueva Zelanda (NZ)' }),
      ).toBeNull()

      await usuario.click(cargarMas)

      expect(
        await screen.findAllByRole('link', { name: 'Nueva Zelanda (NZ)' }),
      ).toHaveLength(EXTRA)
      // Se suman, no reemplazan: las de la primera página siguen ahí.
      expect(screen.getAllByRole('link', { name: 'Chile (CL)' }).length).toBe(
        api.LIMITE_EMBARQUES,
      )
      // Ya no hay más páginas: el botón se va.
      expect(
        screen.queryByRole('button', { name: 'Cargar más embarques' }),
      ).toBeNull()
    },
    LENTO,
  )

  it(
    'embarques: invalidar [CLAVE_EMBARQUES] refresca todas las páginas cargadas',
    async () => {
      const usuario = userEvent.setup()
      const consultas = montar('/exportacion/embarques', ['lectura'])
      const { CLAVE_EMBARQUES } =
        await import('../src/modulos/exportacion/embarques')

      await usuario.click(
        await screen.findByRole('button', { name: 'Cargar más embarques' }),
      )
      await screen.findAllByRole('link', { name: 'Nueva Zelanda (NZ)' })

      // El vuelo más nuevo de todos: entra primero en la página 1.
      await api.embarques.crear({
        destino_pais: 'UY',
        fecha_vuelo: '2027-01-15',
      })
      await consultas.invalidateQueries({ queryKey: [CLAVE_EMBARQUES] })

      expect(
        await screen.findByRole('link', { name: 'Uruguay (UY)' }),
      ).toBeTruthy()
      // Las páginas ya cargadas se vuelven a pedir, no se pierden.
      expect(
        screen.getAllByRole('link', { name: 'Nueva Zelanda (NZ)' }),
      ).toHaveLength(EXTRA)
    },
    LENTO,
  )

  it(
    'movimientos: "Cargar más" trae los más viejos del material',
    async () => {
      const usuario = userEvent.setup()
      montar(`/produccion/materiales/${materialId}`, ['lectura'])

      const cargarMas = await screen.findByRole('button', {
        name: 'Cargar más movimientos',
      })
      expect(screen.getAllByText('compra')).toHaveLength(limiteMovimientos)
      expect(screen.queryByText(/Conteo viejo/)).toBeNull()

      await usuario.click(cargarMas)

      expect(await screen.findAllByText(/Conteo viejo/)).toHaveLength(EXTRA)
      expect(screen.getAllByText('compra')).toHaveLength(limiteMovimientos)
      expect(
        screen.queryByRole('button', { name: 'Cargar más movimientos' }),
      ).toBeNull()
    },
    LENTO,
  )

  it(
    'movimientos: registrar una compra refresca el listado sin perder páginas',
    async () => {
      const usuario = userEvent.setup()
      montar(`/produccion/materiales/${materialId}`, ['produccion'])

      await usuario.click(
        await screen.findByRole('button', { name: 'Cargar más movimientos' }),
      )
      await screen.findAllByText(/Conteo viejo/)

      await usuario.click(
        screen.getByRole('button', { name: /registrar compra o ajuste/i }),
      )
      await usuario.type(screen.getByLabelText('Cantidad'), '777')
      await usuario.click(screen.getByRole('button', { name: 'Registrar' }))

      expect(await screen.findByText('+777')).toBeTruthy()
      expect(screen.getAllByText(/Conteo viejo/)).toHaveLength(EXTRA)
    },
    LENTO,
  )
})
