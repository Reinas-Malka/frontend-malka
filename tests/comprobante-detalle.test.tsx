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
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { ApiError } from '../src/api/client'
import type { Identidad } from '../src/auth/identidad'
import type { DescargaPreparada } from '../src/tipos/dominio'

const TENANT = '11111111-1111-4111-8111-111111111111'
const id = (n: number) =>
  `${n.toString().padStart(8, '0')}-0000-4000-8000-${n.toString().padStart(12, '0')}`
const FACTURA_A = id(72)
const FACTURA_E = id(71)

// La URL prefirmada la da el backend: acá se reemplaza la llamada.
const pedirDescarga = vi.hoisted(() =>
  vi.fn<(clave: string) => Promise<DescargaPreparada>>(),
)
vi.mock('../src/api/documentos', async (original) => ({
  ...(await original<typeof import('../src/api/documentos')>()),
  pedirDescarga,
}))

describe('detalle del comprobante', () => {
  let ComprobantePage: ComponentType
  let ComprobantesPage: ComponentType
  let ProveedorDeSesionFijo: typeof import('../src/auth/sesion').ProveedorDeSesionFijo
  let api: typeof import('../src/api/comprobantes').comprobantes

  beforeAll(async () => {
    Element.prototype.hasPointerCapture = () => false
    Element.prototype.releasePointerCapture = () => {}
    Element.prototype.scrollIntoView = () => {}
    vi.stubEnv('VITE_DATOS_SIMULADOS', 'true')
    vi.resetModules()
    ComprobantePage = (await import('../src/pages/ComprobantePage')).default
    ComprobantesPage = (await import('../src/pages/ComprobantesPage')).default
    ProveedorDeSesionFijo = (await import('../src/auth/sesion'))
      .ProveedorDeSesionFijo
    api = (await import('../src/api/comprobantes')).comprobantes
  })
  afterAll(() => vi.unstubAllEnvs())
  beforeEach(() => {
    pedirDescarga.mockReset()
    pedirDescarga.mockResolvedValue({
      url_descarga: 'https://documentos.s3.amazonaws.com/factura.pdf?firma=x',
      expira_en_segundos: 120,
    } as DescargaPreparada)
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  const YO: Identidad = {
    email: 'ventas@tenant-a.malka.test',
    roles: ['lectura'],
    tenantId: TENANT,
  }

  function montar(ruta: string, identidad: Identidad = YO) {
    const router = createMemoryRouter(
      [
        { path: '/ventas/comprobantes', element: <ComprobantesPage /> },
        { path: '/ventas/comprobantes/:id', element: <ComprobantePage /> },
      ],
      { initialEntries: [ruta] },
    )
    render(
      <ProveedorDeSesionFijo identidad={identidad}>
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

  const dato = (nombre: string) =>
    screen.getByText(nombre, { selector: 'dt' }).nextElementSibling?.textContent

  it('muestra todo lo cargado: número impreso, cliente, fecha, moneda, importe, autor y el PDF', async () => {
    montar(`/ventas/comprobantes/${FACTURA_A}`)

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Factura A 0001-00000128',
      }),
    ).toBeTruthy()
    expect(dato('Comprobante')).toBe('Factura A 0001-00000128')
    expect(dato('Cliente')).toMatch('Apícola Don Emilio')
    expect(dato('Cliente')).toMatch('CUIT 20-30521189-4')
    expect(dato('Fecha de emisión')).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)
    expect(dato('Moneda')).toBe('Pesos (ARS)')
    expect(dato('Importe total')).toBe('ARS 640.500,00')
    // En pesos no hay tipo de cambio.
    expect(screen.queryByText('Tipo de cambio', { selector: 'dt' })).toBeNull()
    // Lo cargó quien está mirando.
    expect(dato('Cargado')).toMatch(
      /^por vos el \d{2}\/\d{2}\/\d{4},? \d{2}:\d{2}:\d{2}$/,
    )
    expect(
      screen.getByText(
        'Los comprobantes no se editan: si hay un error, se corrige en ARCA con una nota de crédito.',
      ),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', {
        name: 'Abrir el PDF de la Factura A 0001-00000128 en otra pestaña',
      }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', {
        name: 'Descargar el PDF de la Factura A 0001-00000128',
      }),
    ).toBeTruthy()
    // Nada técnico a la vista: ni la key del archivo ni ids.
    expect(screen.queryByText(/documentos\//)).toBeNull()
    expect(screen.queryByText(/[0-9a-f]{8}-[0-9a-f]{4}-/)).toBeNull()
    // Inmutable: no hay cómo editarlo.
    expect(screen.queryByRole('button', { name: /editar/i })).toBeNull()
  })

  it('una factura E muestra el tipo de cambio y el tax id; el autor es otra persona', async () => {
    montar(`/ventas/comprobantes/${FACTURA_E}`)

    await screen.findByRole('heading', { name: 'Factura E 0003-00000041' })
    expect(dato('Moneda')).toBe('Dólares (USD)')
    expect(dato('Importe total')).toBe('USD 4.820,50')
    expect(dato('Tipo de cambio')).toBe('1.180,00 pesos por USD')
    expect(dato('Cliente')).toMatch('Tax ID NZ-9429038')
    expect(dato('Cargado')).toMatch(/^por admin@tenant-a\.malka\.test el /)
  })

  it('con el sub de Cognito del usuario actual dice "vos"; con el de otro no muestra el código', async () => {
    const real = await api.obtener(FACTURA_A)
    const SUB = '6c1e9d2a-0b7f-4d51-9a3e-2f8c4b7a1d00'
    vi.spyOn(api, 'obtener').mockResolvedValue({ ...real, cargado_por: SUB })

    montar(`/ventas/comprobantes/${FACTURA_A}`, { ...YO, sub: SUB })
    await screen.findByRole('heading', { name: 'Factura A 0001-00000128' })
    expect(dato('Cargado')).toMatch(/^por vos el /)
    cleanup()

    montar(`/ventas/comprobantes/${FACTURA_A}`, {
      ...YO,
      email: 'otra@malka.test',
      sub: 'otro-sub',
    })
    await screen.findByRole('heading', { name: 'Factura A 0001-00000128' })
    expect(dato('Cargado')).toMatch(/^por otra persona del equipo el /)
    expect(screen.queryByText(new RegExp(SUB))).toBeNull()
  })

  it('el cliente lleva a sus comprobantes', async () => {
    const { usuario, router } = montar(`/ventas/comprobantes/${FACTURA_E}`)

    await usuario.click(
      await screen.findByRole('link', { name: 'Ver sus comprobantes' }),
    )

    expect(router.state.location.pathname).toBe('/ventas/comprobantes')
    expect(router.state.location.search).toBe(`?cliente=${id(62)}`)
  })

  it('"Abrir" pide la URL recién al tocar y la abre en otra pestaña', async () => {
    const pestana = {
      opener: {} as unknown,
      location: { href: '' },
      close: vi.fn(),
    }
    const abrir = vi
      .spyOn(window, 'open')
      .mockReturnValue(pestana as unknown as Window)
    const { usuario } = montar(`/ventas/comprobantes/${FACTURA_A}`)
    await screen.findByRole('heading', { name: 'Factura A 0001-00000128' })
    expect(pedirDescarga).not.toHaveBeenCalled()

    await usuario.click(screen.getByRole('button', { name: /^abrir/i }))

    await vi.waitFor(() =>
      expect(pestana.location.href).toBe(
        'https://documentos.s3.amazonaws.com/factura.pdf?firma=x',
      ),
    )
    // Se abre en el clic (si no, el navegador la bloquea) y sin opener.
    expect(abrir).toHaveBeenCalledWith('', '_blank')
    expect(pestana.opener).toBeNull()
    expect(pedirDescarga).toHaveBeenCalledWith(
      `documentos/${TENANT}/factura-a-0001-00000128.pdf`,
    )
  })

  it('si no se puede abrir, cierra la pestaña y explica por qué', async () => {
    const pestana = { opener: null, location: { href: '' }, close: vi.fn() }
    vi.spyOn(window, 'open').mockReturnValue(pestana as unknown as Window)
    pedirDescarga.mockRejectedValue(
      new ApiError({
        codigo: 'descarga_no_disponible',
        mensaje: 'En la demo con datos de ejemplo no hay archivos para bajar.',
      }),
    )
    const { usuario } = montar(`/ventas/comprobantes/${FACTURA_A}`)
    await screen.findByRole('heading', { name: 'Factura A 0001-00000128' })

    await usuario.click(screen.getByRole('button', { name: /^abrir/i }))

    expect(
      await screen.findByText(
        'En la demo con datos de ejemplo no hay archivos para bajar.',
      ),
    ).toBeTruthy()
    expect(pestana.close).toHaveBeenCalled()
  })

  it('"Descargar" también explica si no se puede bajar', async () => {
    pedirDescarga.mockRejectedValue(
      new ApiError({
        status: 404,
        codigo: 'documento_no_encontrado',
        mensaje: 'No existe el documento.',
      }),
    )
    const { usuario } = montar(`/ventas/comprobantes/${FACTURA_A}`)
    await screen.findByRole('heading', { name: 'Factura A 0001-00000128' })

    await usuario.click(screen.getByRole('button', { name: /^descargar/i }))

    expect((await screen.findByRole('alert')).textContent).toBe(
      'No existe el documento.',
    )
  })

  it('un comprobante que no existe lo dice sin mostrar el código', async () => {
    montar(`/ventas/comprobantes/${id(999)}`)

    expect(
      await screen.findByText('No encontramos este comprobante'),
    ).toBeTruthy()
    expect(screen.queryByText(/comprobante_no_encontrado/)).toBeNull()
  })

  it('si la API falla muestra el error y deja reintentar', async () => {
    vi.spyOn(api, 'obtener').mockRejectedValue(
      new ApiError({
        status: 500,
        codigo: 'error_interno',
        mensaje: 'Algo falló en el servidor.',
      }),
    )
    montar(`/ventas/comprobantes/${FACTURA_A}`)

    expect(await screen.findByText('Algo falló en el servidor.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy()
  })

  it('mientras carga muestra el esqueleto', async () => {
    vi.spyOn(api, 'obtener').mockImplementation(() => new Promise(() => {}))
    montar(`/ventas/comprobantes/${FACTURA_A}`)

    expect(
      await screen.findByRole('status', { name: 'Cargando datos' }),
    ).toBeTruthy()
  })

  it('desde el listado se entra al detalle y "volver" mantiene el filtro', async () => {
    const { usuario, router } = montar(`/ventas/comprobantes?cliente=${id(62)}`)

    await usuario.click(
      await screen.findByRole('link', { name: 'Factura E 0003-00000041' }),
    )
    await screen.findByRole('heading', {
      level: 1,
      name: 'Factura E 0003-00000041',
    })

    await usuario.click(screen.getByRole('link', { name: 'Comprobantes' }))

    expect(router.state.location.search).toBe(`?cliente=${id(62)}`)
    const tabla = await screen.findByRole('table')
    expect(
      within(tabla).getByRole('cell', { name: 'Factura E 0003-00000041' }),
    ).toBeTruthy()
  })
})
