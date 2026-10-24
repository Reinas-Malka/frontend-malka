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
import { movimientosSimulados } from '../src/api/movimientos'
import type { Rol } from '../src/auth/identidad'
import { camposVisibles } from '../src/components/catalogo/campos'
import { DATOS_SIMULADOS } from '../src/datos/simulados'
import { catalogoNucleos } from '../src/modulos/produccion/catalogos'

const TENANT = '11111111-1111-4111-8111-111111111111'
const [NORTE, SUR] = DATOS_SIMULADOS.parques
const CUPULAS = DATOS_SIMULADOS.materiales[0]

describe('catálogo de núcleos', () => {
  const config = catalogoNucleos([NORTE, { ...SUR, activo: false }])

  it('al crear se elige el parque; al editar no, porque el backend no deja cambiarlo', () => {
    expect(camposVisibles(config.campos, {}).map((c) => c.nombre)).toContain(
      'parque_id',
    )
    const enEdicion = config.valoresDeFila(DATOS_SIMULADOS.nucleos[0])
    expect(
      camposVisibles(config.campos, enEdicion).map((c) => c.nombre),
    ).not.toContain('parque_id')
  })

  it('solo se ofrecen los parques activos', () => {
    const parque = config.campos.find((c) => c.nombre === 'parque_id')
    expect(parque?.opciones?.({}).map((o) => o.valor)).toEqual([NORTE.id])
  })

  it('fila y posición viajan como números', () => {
    expect(
      config.aCrear({ parque_id: NORTE.id, fila: '2', posicion: '3' }),
    ).toEqual({ parque_id: NORTE.id, fila: 2, posicion: 3 })
    expect(config.aActualizar({ fila: '4', posicion: '1' })).toEqual({
      fila: 4,
      posicion: 1,
    })
  })
})

describe('movimientos simulados (el stock es la suma)', () => {
  it('una compra suma y un ajuste negativo que deja el stock bajo cero avisa', async () => {
    const api = movimientosSimulados([])
    const compra = await api.registrar('m', { tipo: 'compra', cantidad: '100' })
    const ajuste = await api.registrar('m', {
      tipo: 'ajuste',
      cantidad: '-150',
      motivo: 'Conteo',
    })

    expect(compra.stock).toBe('100')
    expect(compra.advertencias).toEqual([])
    expect(ajuste.stock).toBe('-50')
    expect(ajuste.advertencias.map((a) => a.code)).toEqual(['stock_negativo'])
  })

  it('lista del más nuevo al más viejo, solo del material pedido', async () => {
    const api = movimientosSimulados()
    const { items } = await api.listar(CUPULAS.id)
    expect(items.every((m) => m.material_id === CUPULAS.id)).toBe(true)
    const fechas = items.map((m) => m.fecha)
    expect(fechas).toEqual([...fechas].sort().reverse())
  })
})

describe('pantallas', () => {
  // Los módulos de api deciden simulado/real al cargarse: el flag va antes.
  let MaterialPage: ComponentType
  let EmbarquePage: ComponentType
  let ProveedorDeSesionFijo: typeof import('../src/auth/sesion').ProveedorDeSesionFijo

  beforeAll(async () => {
    vi.stubEnv('VITE_DATOS_SIMULADOS', 'true')
    vi.resetModules()
    MaterialPage = (await import('../src/pages/MaterialPage')).default
    EmbarquePage = (await import('../src/pages/EmbarquePage')).default
    ProveedorDeSesionFijo = (await import('../src/auth/sesion'))
      .ProveedorDeSesionFijo
  })
  afterAll(() => vi.unstubAllEnvs())
  afterEach(cleanup)

  function montar(ruta: string, roles: Rol[]) {
    const router = createMemoryRouter(
      [
        { path: '/produccion/materiales/:id', element: <MaterialPage /> },
        { path: '/exportacion/embarques/:id', element: <EmbarquePage /> },
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
  }

  it('el material muestra su stock y sus movimientos; lectura no registra', async () => {
    montar(`/produccion/materiales/${CUPULAS.id}`, ['lectura'])

    expect(
      await screen.findByRole('heading', { name: CUPULAS.nombre }),
    ).toBeTruthy()
    expect(screen.getAllByText('compra').length).toBeGreaterThan(0)
    expect(
      screen.queryByRole('button', { name: /registrar compra o ajuste/i }),
    ).toBeNull()
  })

  it('producción registra una compra y ve el stock nuevo', async () => {
    const usuario = userEvent.setup()
    montar(`/produccion/materiales/${CUPULAS.id}`, ['produccion'])

    await usuario.click(
      await screen.findByRole('button', { name: /registrar compra o ajuste/i }),
    )
    await usuario.type(screen.getByLabelText('Cantidad'), '500')
    await usuario.click(screen.getByRole('button', { name: 'Registrar' }))

    expect(await screen.findByText(/Registrado\. Stock actual/)).toBeTruthy()
  })

  it('en la demo, descargar un documento explica que no hay archivos reales', async () => {
    const usuario = userEvent.setup()
    montar(`/exportacion/embarques/${DATOS_SIMULADOS.embarques[0].id}`, [
      'lectura',
    ])

    await usuario.click(
      await screen.findByRole('button', { name: 'Descargar Factura E' }),
    )

    expect(await screen.findByText(/no hay archivos para bajar/)).toBeTruthy()
  })
})
