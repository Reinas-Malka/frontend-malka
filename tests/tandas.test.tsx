// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
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
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { tandasSimuladas } from '../src/api/tandas'
import type { Rol } from '../src/auth/identidad'
import { validarValores } from '../src/components/catalogo/campos'
import { DATOS_SIMULADOS } from '../src/datos/simulados'
import {
  aTandaCrear,
  camposDelAlta,
  cupulasDe,
  edadEnDias,
  etapasDe,
  materialDeCupulas,
  valoresIniciales,
} from '../src/modulos/produccion/tandas'
import type { Tanda } from '../src/tipos/dominio'

const TENANT = '11111111-1111-4111-8111-111111111111'
const { razas, materiales, madres } = DATOS_SIMULADOS
const [CARNIOLA] = razas
const CUPULAS = materiales[0]
const MARTES = '2025-10-21'
const DOMINGO = '2025-10-19'

const tanda = (cambios: Partial<Tanda> = {}): Tanda => ({
  id: 't',
  raza_id: CARNIOLA.id,
  madre_id: null,
  fecha_traslarve: MARTES,
  retroactivo: false,
  fila_continuadora: null,
  posicion_continuadora: null,
  celdas: 270,
  celdas_por_estado: { trasladada: 270 },
  ...cambios,
})

const alta = (cambios: Record<string, string> = {}) => ({
  ...valoresIniciales(materiales),
  raza_id: CARNIOLA.id,
  fecha_traslarve: MARTES,
  ...cambios,
})

describe('reglas de la pantalla de tandas', () => {
  const campos = camposDelAlta(razas, materiales, madres)

  it('la edad son los días desde el traslarve (D0)', () => {
    expect(edadEnDias(tanda(), MARTES)).toBe(0)
    expect(edadEnDias(tanda(), '2025-11-01')).toBe(11)
  })

  it('cada cuadro son 135 cúpulas', () => {
    expect(cupulasDe(2)).toBe(270)
    const cuadros = campos.find((c) => c.nombre === 'cuadros')
    expect(cuadros?.opciones?.({}).map((o) => o.etiqueta)).toEqual([
      '1 cuadro · 135 cúpulas',
      '2 cuadros · 270 cúpulas',
      '3 cuadros · 405 cúpulas',
    ])
  })

  it('se propone el material de cúpulas', () => {
    expect(materialDeCupulas(materiales)?.id).toBe(CUPULAS.id)
    expect(valoresIniciales(materiales).material_id).toBe(CUPULAS.id)
  })

  it('solo se ofrecen razas activas', () => {
    const raza = campos.find((c) => c.nombre === 'raza_id')
    const conInactiva = camposDelAlta(
      [CARNIOLA, { ...razas[1], activo: false }],
      materiales,
      madres,
    ).find((c) => c.nombre === 'raza_id')
    expect(raza?.opciones?.({})).toHaveLength(razas.length)
    expect(conInactiva?.opciones?.({}).map((o) => o.valor)).toEqual([
      CARNIOLA.id,
    ])
  })

  it('un alta completa pasa la validación', () => {
    expect(validarValores(campos, alta())).toEqual({})
  })

  it('la raza es obligatoria', () => {
    expect(validarValores(campos, alta({ raza_id: '' }))).toHaveProperty(
      'raza_id',
    )
  })

  it('el traslarve no va en domingo, salvo que sea retroactivo', () => {
    expect(
      validarValores(campos, alta({ fecha_traslarve: DOMINGO })),
    ).toHaveProperty('fecha_traslarve')
    expect(
      validarValores(
        campos,
        alta({ fecha_traslarve: DOMINGO, retroactivo: 'si' }),
      ),
    ).toEqual({})
  })

  it('la fecha no puede ser futura', () => {
    expect(
      validarValores(campos, alta({ fecha_traslarve: '2999-01-05' })),
    ).toHaveProperty('fecha_traslarve')
  })

  it('fila y posición de la continuadora van las dos o ninguna', () => {
    expect(
      validarValores(campos, alta({ fila_continuadora: '3' })),
    ).toHaveProperty('fila_continuadora')
    expect(
      validarValores(
        campos,
        alta({ fila_continuadora: '3', posicion_continuadora: '7' }),
      ),
    ).toEqual({})
  })

  it('el formulario se convierte al TandaCrear del contrato', () => {
    expect(
      aTandaCrear(
        alta({
          cuadros: '3',
          fila_continuadora: '3',
          posicion_continuadora: '7',
          madre_id: madres[0].id,
        }),
      ),
    ).toEqual({
      raza_id: CARNIOLA.id,
      fecha_traslarve: MARTES,
      cuadros: 3,
      material_id: CUPULAS.id,
      retroactivo: false,
      fila_continuadora: 3,
      posicion_continuadora: 7,
      madre_id: madres[0].id,
    })
    expect(aTandaCrear(alta())).toMatchObject({
      madre_id: null,
      fila_continuadora: null,
      posicion_continuadora: null,
    })
  })

  it('las celdas se muestran por etapa, en el orden del ciclo', () => {
    const t = tanda({
      celdas_por_estado: { descartada: 30, enjaulada: 220, trasladada: 0 },
    })
    expect(etapasDe(t)).toEqual([
      { estado: 'enjaulada', cantidad: 220 },
      { estado: 'descartada', cantidad: 30 },
    ])
  })
})

describe('tandas simuladas (mismas reglas que el backend)', () => {
  const datos = aTandaCrear(alta())

  it('2 cuadros crean 270 celdas trasladadas y descuentan las cúpulas', async () => {
    const api = tandasSimuladas([])
    const creada = await api.crear(datos)

    expect(creada.celdas).toBe(270)
    expect(creada.celdas_por_estado).toEqual({ trasladada: 270 })
    expect(creada.consumo.cantidad).toBe('-270')
    expect(creada.stock).toBe(String(Number(CUPULAS.stock) - 270))
    expect((await api.listar()).items).toHaveLength(1)
  })

  it('si no alcanzan las cúpulas avisa, pero crea igual', async () => {
    const api = tandasSimuladas([], razas, [{ ...CUPULAS, stock: '100' }])
    const creada = await api.crear(datos)

    expect(creada.stock).toBe('-170')
    expect(creada.advertencias.map((a) => a.code)).toEqual(['stock_negativo'])
  })

  it('rechaza el domingo sin retroactivo', async () => {
    const api = tandasSimuladas([])
    await expect(
      api.crear({ ...datos, fecha_traslarve: DOMINGO }),
    ).rejects.toMatchObject({ status: 422, codigo: 'fecha_no_laborable' })
    await expect(
      api.crear({ ...datos, fecha_traslarve: DOMINGO, retroactivo: true }),
    ).resolves.toMatchObject({ retroactivo: true })
  })

  it('la misma clave de idempotencia no crea dos tandas', async () => {
    const api = tandasSimuladas([])
    const primera = await api.crear(datos, 'clave')
    const repetida = await api.crear(datos, 'clave')

    expect(repetida.id).toBe(primera.id)
    expect((await api.listar()).items).toHaveLength(1)
  })

  it('lista de la más nueva a la más vieja y filtra por raza', async () => {
    const api = tandasSimuladas()
    const { items } = await api.listar()
    const fechas = items.map((t) => t.fecha_traslarve)
    expect(fechas).toEqual([...fechas].sort().reverse())

    const { items: deCarniola } = await api.listar({ raza_id: CARNIOLA.id })
    expect(deCarniola.every((t) => t.raza_id === CARNIOLA.id)).toBe(true)
  })
})

describe('pantalla de tandas', () => {
  // Los módulos de api deciden simulado/real al cargarse: el flag va antes.
  let TandasPage: ComponentType
  let ProveedorDeSesionFijo: typeof import('../src/auth/sesion').ProveedorDeSesionFijo

  beforeAll(async () => {
    // jsdom no trae lo que usa el Select de Radix para abrirse.
    Element.prototype.hasPointerCapture ??= () => false
    Element.prototype.releasePointerCapture ??= () => {}
    Element.prototype.scrollIntoView ??= () => {}
    vi.stubEnv('VITE_DATOS_SIMULADOS', 'true')
    vi.resetModules()
    TandasPage = (await import('../src/pages/TandasPage')).default
    ProveedorDeSesionFijo = (await import('../src/auth/sesion'))
      .ProveedorDeSesionFijo
  })
  afterAll(() => vi.unstubAllEnvs())
  afterEach(cleanup)

  function montar(roles: Rol[]) {
    const router = createMemoryRouter(
      [{ path: '/produccion/tandas', element: <TandasPage /> }],
      { initialEntries: ['/produccion/tandas'] },
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

  it('lista las tandas con su edad y celdas por estado; lectura no da de alta', async () => {
    montar(['lectura'])

    expect((await screen.findAllByLabelText('Celdas por estado')).length).toBe(
      DATOS_SIMULADOS.tandas.length,
    )
    expect(screen.getAllByText(/\d+ días/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/en el parque/).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /nueva tanda/i })).toBeNull()
  })

  it('producción da de alta una tanda de 2 cuadros y aparece con 270 trasladadas', async () => {
    const usuario = userEvent.setup()
    montar(['produccion'])

    await usuario.click(
      await screen.findByRole('button', { name: /nueva tanda/i }),
    )
    const dialogo = await screen.findByRole('dialog')
    await usuario.click(within(dialogo).getByRole('combobox', { name: 'Raza' }))
    await usuario.click(await screen.findByRole('option', { name: 'Italiana' }))
    fireEvent.change(within(dialogo).getByLabelText('Fecha de traslarve'), {
      target: { value: MARTES },
    })
    await usuario.click(
      within(dialogo).getByRole('button', { name: 'Crear tanda' }),
    )

    expect(
      await screen.findByText(/Tanda creada con 270 celdas trasladadas/),
    ).toBeTruthy()
    // La tabla se refresca sola: la tanda nueva aparece con sus 270 celdas.
    await waitFor(() => {
      const listas = screen.getAllByLabelText('Celdas por estado')
      expect(listas).toHaveLength(DATOS_SIMULADOS.tandas.length + 1)
      expect(listas.map((l) => l.textContent)).toContain('270 trasladadas')
    })
  })
})
