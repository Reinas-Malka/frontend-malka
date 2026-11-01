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
import { ApiError } from '../src/api/client'
import type { Rol } from '../src/auth/identidad'

const TENANT = '11111111-1111-4111-8111-111111111111'
const EMISION_PASADA = '2026-01-15'

describe('pantalla de comprobantes', () => {
  // api/comprobantes.ts decide simulado/real al cargarse: el flag va antes.
  let ComprobantesPage: ComponentType
  // Del mismo grafo de módulos que la pantalla: si no, el contexto de sesión es otro.
  let ProveedorDeSesionFijo: typeof import('../src/auth/sesion').ProveedorDeSesionFijo
  // La misma instancia simulada que usa la pantalla.
  let api: typeof import('../src/api/comprobantes').comprobantes

  beforeAll(async () => {
    // El Select de Radix usa APIs de puntero y scroll que jsdom no implementa.
    Element.prototype.hasPointerCapture = () => false
    Element.prototype.releasePointerCapture = () => {}
    Element.prototype.scrollIntoView = () => {}
    vi.stubEnv('VITE_DATOS_SIMULADOS', 'true')
    vi.resetModules()
    ComprobantesPage = (await import('../src/pages/ComprobantesPage')).default
    ProveedorDeSesionFijo = (await import('../src/auth/sesion'))
      .ProveedorDeSesionFijo
    api = (await import('../src/api/comprobantes')).comprobantes
  })
  afterAll(() => vi.unstubAllEnvs())
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  function montar(roles: Rol[] = ['lectura'], ruta = '/ventas/comprobantes') {
    const router = createMemoryRouter(
      [{ path: '/ventas/comprobantes', element: <ComprobantesPage /> }],
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

  async function elegir(usuario: Usuario, campo: string, opcion: string) {
    await usuario.click(screen.getByRole('combobox', { name: campo }))
    await usuario.click(await screen.findByRole('option', { name: opcion }))
  }

  const filas = () => screen.getAllByRole('row').slice(1)
  const fila = async (nombre: string) =>
    (await screen.findByRole('cell', { name: nombre })).closest(
      'tr',
    ) as HTMLElement

  async function abrirAlta(usuario: Usuario) {
    await usuario.click(
      await screen.findByRole('button', { name: /cargar comprobante/i }),
    )
    return screen.findByRole('dialog', { name: 'Cargar comprobante' })
  }

  async function completar(
    usuario: Usuario,
    datos: { punto: string; numero: string; importe: string },
  ) {
    await usuario.type(screen.getByLabelText('Punto de venta'), datos.punto)
    await usuario.type(screen.getByLabelText('Número'), datos.numero)
    await usuario.type(
      screen.getByLabelText('Fecha de emisión'),
      EMISION_PASADA,
    )
    await usuario.type(screen.getByLabelText(/importe total/i), datos.importe)
    await usuario.upload(
      screen.getByLabelText('PDF del comprobante'),
      new File(['%PDF'], 'factura.pdf', { type: 'application/pdf' }),
    )
  }

  it('lista cada comprobante con su formato impreso, fecha, cliente, importe y PDF', async () => {
    montar()

    const a = await fila('Factura A 0001-00000128')
    expect(filas()).toHaveLength(3)
    expect(within(a).getByText('Apícola Don Emilio')).toBeTruthy()
    expect(within(a).getByText(/ARS 640\.500,00/)).toBeTruthy()
    expect(within(a).getByText(/^\d{2}\/\d{2}\/\d{4}$/)).toBeTruthy()
    expect(
      within(a).getByRole('button', {
        name: 'Descargar el PDF de la Factura A 0001-00000128',
      }),
    ).toBeTruthy()

    const e = await fila('Factura E 0003-00000041')
    expect(within(e).getByText(/USD 4\.820,50/)).toBeTruthy()
    expect(within(e).getByText('Tipo de cambio 1.180,00')).toBeTruthy()
    // Nada técnico a la vista: ni la key del archivo ni el código de moneda suelto.
    expect(screen.queryByText(/documentos\//)).toBeNull()
  })

  it('filtra por cliente y la URL lo recuerda', async () => {
    const { usuario, router } = montar()
    await fila('Factura A 0001-00000128')

    await elegir(usuario, 'Cliente', 'Bee Kingdom NZ Ltd')

    await vi.waitFor(() => expect(filas()).toHaveLength(1))
    expect(screen.getByRole('cell', { name: 'Factura E 0003-00000041' }))
    expect(router.state.location.search).toMatch(/^\?cliente=/)
  })

  it('en la demo, descargar explica que no hay archivo en lugar de romperse', async () => {
    const { usuario } = montar()
    const a = await fila('Factura A 0001-00000128')

    await usuario.click(within(a).getByRole('button', { name: /descargar/i }))

    expect(
      await screen.findByText(
        /en la demo con datos de ejemplo no hay archivos/i,
      ),
    ).toBeTruthy()
  })

  describe('los tres estados', () => {
    it('mientras carga muestra el esqueleto', async () => {
      vi.spyOn(api, 'listar').mockImplementation(() => new Promise(() => {}))
      montar()

      expect(
        await screen.findByRole('status', { name: 'Cargando datos' }),
      ).toBeTruthy()
    })

    it('sin comprobantes lo dice y ventas puede cargar el primero', async () => {
      vi.spyOn(api, 'listar').mockResolvedValue({ items: [], siguiente: null })
      montar(['ventas'])

      expect(
        await screen.findByText('Todavía no hay comprobantes'),
      ).toBeTruthy()
      expect(
        screen.getAllByRole('button', { name: /cargar comprobante/i }),
      ).toHaveLength(2)
    })

    it('si la API falla muestra el error y deja reintentar', async () => {
      vi.spyOn(api, 'listar').mockRejectedValue(
        new ApiError({
          status: 500,
          codigo: 'error_interno',
          mensaje: 'Algo falló en el servidor.',
        }),
      )
      montar()

      expect(await screen.findByText('Algo falló en el servidor.')).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy()
    })

    it('con más de una página ofrece "Cargar más" con el cursor siguiente', async () => {
      const real = api.listar.bind(api)
      const listar = vi
        .spyOn(api, 'listar')
        .mockImplementation(async (filtros, cursor) => {
          const todo = await real(filtros)
          return cursor
            ? { items: todo.items.slice(2), siguiente: null }
            : { items: todo.items.slice(0, 2), siguiente: 'pagina-2' }
        })
      const { usuario } = montar()
      await fila('Factura A 0001-00000128')
      expect(filas()).toHaveLength(2)

      await usuario.click(
        screen.getByRole('button', { name: 'Cargar más comprobantes' }),
      )

      await vi.waitFor(() => expect(filas()).toHaveLength(3))
      expect(listar).toHaveBeenLastCalledWith({}, 'pagina-2')
      expect(
        screen.queryByRole('button', { name: 'Cargar más comprobantes' }),
      ).toBeNull()
    })
  })

  describe('roles', () => {
    it('lectura ve los comprobantes pero no puede cargar', async () => {
      montar(['lectura'])

      await fila('Factura A 0001-00000128')
      expect(
        screen.queryByRole('button', { name: /cargar comprobante/i }),
      ).toBeNull()
    })

    it.each([['ventas'], ['admin']] as [Rol][])(
      '%s puede cargar',
      async (rol) => {
        montar([rol])

        expect(
          await screen.findByRole('button', { name: /cargar comprobante/i }),
        ).toBeTruthy()
      },
    )
  })

  describe('alta', () => {
    it('el cliente sugiere la letra y la moneda; en exportación pide el tipo de cambio', async () => {
      const { usuario } = montar(['ventas'])
      await abrirAlta(usuario)

      await elegir(usuario, 'Cliente', 'Apícola Don Emilio')
      expect(
        screen.getByRole('combobox', { name: 'Letra' }).textContent,
      ).toMatch('Factura A')
      expect(screen.queryByLabelText('Tipo de cambio')).toBeNull()

      await elegir(usuario, 'Cliente', 'Bee Kingdom NZ Ltd')
      expect(
        screen.getByRole('combobox', { name: 'Letra' }).textContent,
      ).toMatch('Factura E')
      expect(
        screen.getByRole('combobox', { name: 'Moneda' }).textContent,
      ).toMatch('USD')
      expect(screen.getByLabelText('Tipo de cambio')).toBeTruthy()
    }, 15_000)

    it('sin datos no sube nada y marca cada campo', async () => {
      const { usuario } = montar(['ventas'])
      await abrirAlta(usuario)

      await usuario.click(
        screen.getByRole('button', { name: 'Cargar comprobante' }),
      )

      expect(screen.getByText('Elegí el cliente.')).toBeTruthy()
      expect(screen.getByText('Adjuntá el PDF del comprobante.')).toBeTruthy()
      expect(screen.getByText('Elegí la fecha de emisión.')).toBeTruthy()
    }, 15_000)

    it('el texto impreso en el número no es un entero', async () => {
      const { usuario } = montar(['ventas'])
      await abrirAlta(usuario)
      await elegir(usuario, 'Cliente', 'Apícola Don Emilio')
      await completar(usuario, {
        punto: '1',
        numero: '0001-00000045',
        importe: '100',
      })

      await usuario.click(
        screen.getByRole('button', { name: 'Cargar comprobante' }),
      )

      expect(
        await screen.findByText(/el número es un número entero/i),
      ).toBeTruthy()
    }, 15_000)

    it('una letra que no corresponde al cliente la rechaza el backend y queda en el campo', async () => {
      const { usuario } = montar(['ventas'])
      await abrirAlta(usuario)
      await elegir(usuario, 'Cliente', 'Apícola Don Emilio')
      await elegir(usuario, 'Letra', 'Factura B')
      expect(
        screen.getByText(/a este cliente le corresponde la factura A/i),
      ).toBeTruthy()
      await completar(usuario, {
        punto: '7',
        numero: '1',
        importe: '1000',
      })

      await usuario.click(
        screen.getByRole('button', { name: 'Cargar comprobante' }),
      )

      const error = await screen.findByText(/le emite factura A, no B/)
      expect(error.id).toBe('comprobante-letra-error')
      expect(screen.getByRole('dialog')).toBeTruthy()
    }, 15_000)

    it('carga un comprobante completo: sube el PDF, lo registra y aparece en el listado', async () => {
      const crear = vi.spyOn(api, 'crear')
      const { usuario } = montar(['ventas'])
      await fila('Factura A 0001-00000128')
      await abrirAlta(usuario)
      await elegir(usuario, 'Cliente', 'Bee Kingdom NZ Ltd')
      await elegir(usuario, 'Moneda', 'EUR')
      await completar(usuario, {
        punto: '0003',
        numero: '45',
        importe: '2.150,75',
      })
      await usuario.type(screen.getByLabelText('Tipo de cambio'), '1290,5')
      expect(
        screen.getByText('Se va a ver como Factura E 0003-00000045.'),
      ).toBeTruthy()

      await usuario.click(
        screen.getByRole('button', { name: 'Cargar comprobante' }),
      )

      expect(await fila('Factura E 0003-00000045')).toBeTruthy()
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(screen.getByText('Factura E 0003-00000045 cargada.')).toBeTruthy()
      const [datos, clave] = crear.mock.calls[0]
      expect(datos).toMatchObject({
        tipo: 'E',
        punto_venta: 3,
        numero: 45,
        fecha_emision: EMISION_PASADA,
        moneda: 'EUR',
        importe: '2150.75',
        tipo_cambio: '1290.5',
      })
      expect(datos.archivo_s3_key).toMatch(
        new RegExp(`^documentos/${TENANT}/.+-factura\\.pdf$`),
      )
      // La Idempotency-Key se fija al abrir el modal.
      expect(clave).toMatch(/^[0-9a-f-]{36}$/)
    }, 20_000)

    it('un comprobante repetido es 409: queda en el número y la clave del intento se mantiene', async () => {
      const crear = vi.spyOn(api, 'crear')
      const { usuario } = montar(['ventas'])
      await abrirAlta(usuario)
      await elegir(usuario, 'Cliente', 'Apícola Don Emilio')
      await completar(usuario, {
        punto: '1',
        numero: '128',
        importe: '640500',
      })

      await usuario.click(
        screen.getByRole('button', { name: 'Cargar comprobante' }),
      )

      const error = await screen.findByText(
        /ya está cargada la factura A 0001-00000128/i,
      )
      expect(error.id).toBe('comprobante-numero-error')

      // Corrige el número y vuelve a guardar en el mismo modal.
      await usuario.clear(screen.getByLabelText('Número'))
      await usuario.type(screen.getByLabelText('Número'), '129')
      await usuario.click(
        screen.getByRole('button', { name: 'Cargar comprobante' }),
      )

      expect(await fila('Factura A 0001-00000129')).toBeTruthy()
      expect(crear).toHaveBeenCalledTimes(2)
      expect(crear.mock.calls[1][1]).toBe(crear.mock.calls[0][1])
      // El PDF ya estaba subido: el segundo intento usa la misma key.
      expect(crear.mock.calls[1][0].archivo_s3_key).toBe(
        crear.mock.calls[0][0].archivo_s3_key,
      )
    }, 20_000)
  })
})
