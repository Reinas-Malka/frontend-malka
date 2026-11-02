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
import type { Rol } from '../src/auth/identidad'

const TENANT = '11111111-1111-4111-8111-111111111111'
const EMISION_PASADA = '2026-01-15'

// La extracción del QR (pdf.js + jsQR) necesita un navegador: acá se
// reemplaza por lo que "leería" del PDF. El parseo es el real.
const leerQr = vi.hoisted(() => vi.fn<(pdf: File) => Promise<string | null>>())
vi.mock('../src/documentos/leerQrDelPdf', () => ({ leerQrDelPdf: leerQr }))

/** El texto del QR de ARCA para un JSON como el de RG 4892. */
const qrDeArca = (json: Record<string, unknown>) =>
  `https://www.afip.gob.ar/fe/qr/?p=${btoa(JSON.stringify(json))}`

const FACTURA_A_DON_EMILIO = {
  ver: 1,
  fecha: EMISION_PASADA,
  cuit: 30712345671,
  ptoVta: 2,
  tipoCmp: 1,
  nroCmp: 310,
  importe: 15730.5,
  moneda: 'PES',
  ctz: 1,
  tipoDocRec: 80,
  // El CUIT de Apícola Don Emilio en los datos de ejemplo.
  nroDocRec: 20305211894,
  tipoCodAut: 'E',
  codAut: 74123456789012,
}

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
  beforeEach(() => {
    // Por defecto el PDF no tiene QR: la carga es a mano, como antes.
    leerQr.mockReset()
    leerQr.mockResolvedValue(null)
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  function montar(roles: Rol[] = ['lectura'], ruta = '/ventas/comprobantes') {
    const router = createMemoryRouter(
      [
        { path: '/ventas/comprobantes', element: <ComprobantesPage /> },
        { path: '/ventas/comprobantes/:id', element: <p>Detalle</p> },
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

  describe('alta con el QR del PDF de ARCA', () => {
    const pdf = () =>
      new File(['%PDF'], 'factura-arca.pdf', { type: 'application/pdf' })
    const valor = (etiqueta: string | RegExp) =>
      (screen.getByLabelText(etiqueta) as HTMLInputElement).value
    const combo = (nombre: string) =>
      screen.getByRole('combobox', { name: nombre }).textContent

    it('completa el formulario, elige el cliente por su CUIT y se guarda tal cual', async () => {
      leerQr.mockResolvedValue(qrDeArca(FACTURA_A_DON_EMILIO))
      const crear = vi.spyOn(api, 'crear')
      const { usuario } = montar(['ventas'])
      await abrirAlta(usuario)

      const archivo = pdf()
      await usuario.upload(
        screen.getByLabelText('PDF del comprobante'),
        archivo,
      )

      expect(
        await screen.findByText(
          'Completamos los datos con el código QR de la factura. Revisalos antes de guardar.',
        ),
      ).toBeTruthy()
      expect(leerQr).toHaveBeenCalledWith(archivo)
      expect(
        screen.getByText('Elegimos el cliente Apícola Don Emilio por su CUIT.'),
      ).toBeTruthy()
      expect(combo('Cliente')).toMatch('Apícola Don Emilio')
      expect(combo('Letra')).toMatch('Factura A')
      expect(valor('Punto de venta')).toBe('2')
      expect(valor('Número')).toBe('310')
      expect(valor('Fecha de emisión')).toBe(EMISION_PASADA)
      expect(valor(/importe total/i)).toBe('15730.50')
      expect(screen.queryByLabelText('Tipo de cambio')).toBeNull()

      // Sigue editable: la persona corrige y confirma.
      await usuario.clear(screen.getByLabelText('Número'))
      await usuario.type(screen.getByLabelText('Número'), '311')
      await usuario.click(
        screen.getByRole('button', { name: 'Cargar comprobante' }),
      )

      expect(await fila('Factura A 0002-00000311')).toBeTruthy()
      expect(crear.mock.calls[0][0]).toMatchObject({
        tipo: 'A',
        punto_venta: 2,
        numero: 311,
        fecha_emision: EMISION_PASADA,
        moneda: 'ARS',
        importe: '15730.50',
        tipo_cambio: null,
      })
    }, 20_000)

    it('una factura E completa la moneda y el tipo de cambio', async () => {
      leerQr.mockResolvedValue(
        qrDeArca({
          ...FACTURA_A_DON_EMILIO,
          tipoCmp: 19,
          ptoVta: 3,
          nroCmp: 52,
          importe: 2150.75,
          moneda: '060',
          ctz: 1290.5,
          // El receptor del exterior no es un CUIT de un cliente cargado.
          nroDocRec: 55000002126,
        }),
      )
      const { usuario } = montar(['ventas'])
      await abrirAlta(usuario)
      await elegir(usuario, 'Cliente', 'Bee Kingdom NZ Ltd')

      await usuario.upload(screen.getByLabelText('PDF del comprobante'), pdf())

      await screen.findByText(/completamos los datos con el código QR/i)
      expect(combo('Cliente')).toMatch('Bee Kingdom NZ Ltd')
      expect(combo('Letra')).toMatch('Factura E')
      expect(combo('Moneda')).toMatch('EUR')
      expect(valor('Tipo de cambio')).toBe('1290.5')
      expect(valor(/importe total \(EUR\)/i)).toBe('2150.75')
      // El cliente ya estaba elegido: no se pide elegirlo.
      expect(screen.queryByText(/no encontramos un cliente/i)).toBeNull()
    }, 15_000)

    it('sin un cliente con ese CUIT pide elegirlo', async () => {
      leerQr.mockResolvedValue(
        qrDeArca({ ...FACTURA_A_DON_EMILIO, nroDocRec: 20111111112 }),
      )
      const { usuario } = montar(['ventas'])
      await abrirAlta(usuario)

      await usuario.upload(screen.getByLabelText('PDF del comprobante'), pdf())

      expect(
        await screen.findByText(
          'No encontramos un cliente con el CUIT de la factura: elegilo.',
        ),
      ).toBeTruthy()
      expect(valor('Número')).toBe('310')
    })

    it('una nota de crédito lo avisa y deja la letra sin completar', async () => {
      leerQr.mockResolvedValue(
        qrDeArca({ ...FACTURA_A_DON_EMILIO, tipoCmp: 3 }),
      )
      const { usuario } = montar(['ventas'])
      await abrirAlta(usuario)

      await usuario.upload(screen.getByLabelText('PDF del comprobante'), pdf())

      expect(
        await screen.findByText(
          'Este comprobante es una nota de crédito u otro tipo; por ahora se cargan facturas A, B y E.',
        ),
      ).toBeTruthy()
      expect(combo('Letra')).toMatch('Elegí la letra')
    })

    it.each([
      ['el PDF no tiene QR', null, '9'],
      ['el QR no es de ARCA', 'https://example.com/otra-cosa', '10'],
      ['el QR es ilegible', 'https://www.afip.gob.ar/fe/qr/?p=%%%', '11'],
    ])(
      'si %s avisa y queda la carga a mano',
      async (_, texto, numero) => {
        leerQr.mockResolvedValue(texto)
        const { usuario } = montar(['ventas'])
        await abrirAlta(usuario)

        await usuario.upload(
          screen.getByLabelText('PDF del comprobante'),
          pdf(),
        )

        expect(
          await screen.findByText(
            'No encontramos el código QR de ARCA en el PDF: completá los datos a mano.',
          ),
        ).toBeTruthy()
        expect(valor('Número')).toBe('')
        // A mano funciona como siempre.
        await elegir(usuario, 'Cliente', 'Apícola Don Emilio')
        await usuario.type(screen.getByLabelText('Punto de venta'), '5')
        await usuario.type(screen.getByLabelText('Número'), numero)
        await usuario.type(
          screen.getByLabelText('Fecha de emisión'),
          EMISION_PASADA,
        )
        await usuario.type(screen.getByLabelText(/importe total/i), '100')
        await usuario.click(
          screen.getByRole('button', { name: 'Cargar comprobante' }),
        )
        expect(
          await fila(`Factura A 0005-${numero.padStart(8, '0')}`),
        ).toBeTruthy()
      },
      20_000,
    )

    it('si la lectura del PDF falla, también queda la carga a mano', async () => {
      leerQr.mockRejectedValue(new Error('PDF dañado'))
      const { usuario } = montar(['ventas'])
      await abrirAlta(usuario)

      await usuario.upload(screen.getByLabelText('PDF del comprobante'), pdf())

      expect(
        await screen.findByText(/no encontramos el código QR de ARCA/i),
      ).toBeTruthy()
    })

    it('un archivo que no es PDF no se lee', async () => {
      const { usuario } = montar(['ventas'])
      await abrirAlta(usuario)

      await usuario.upload(
        screen.getByLabelText('PDF del comprobante'),
        new File(['x'], 'foto.png', { type: 'image/png' }),
      )

      expect(leerQr).not.toHaveBeenCalled()
    })
  })

  describe('alta pedida por la URL (desde el pedido)', () => {
    const BEE_KINGDOM = '00000062-0000-4000-8000-000000000062'

    it('abre el alta con el cliente y la moneda puestos y al cerrar limpia la URL', async () => {
      const { usuario, router } = montar(
        ['ventas'],
        `/ventas/comprobantes?alta=1&cliente=${BEE_KINGDOM}&moneda=EUR`,
      )

      const dialogo = await screen.findByRole('dialog', {
        name: 'Cargar comprobante',
      })
      const combo = (nombre: string) =>
        within(dialogo).getByRole('combobox', { name: nombre }).textContent
      // El formulario arranca cuando llegan los clientes.
      await within(dialogo).findByRole('combobox', { name: 'Cliente' })
      expect(combo('Cliente')).toMatch('Bee Kingdom NZ Ltd')
      expect(combo('Letra')).toMatch('Factura E')
      expect(combo('Moneda')).toMatch('EUR')

      await usuario.click(
        within(dialogo).getByRole('button', { name: 'Cancelar' }),
      )

      expect(screen.queryByRole('dialog')).toBeNull()
      // Queda el filtro por cliente: detrás se ven sus comprobantes.
      expect(router.state.location.search).toBe(`?cliente=${BEE_KINGDOM}`)
      expect(await fila('Factura E 0003-00000041')).toBeTruthy()
      expect(
        screen.queryByRole('cell', { name: 'Factura A 0001-00000128' }),
      ).toBeNull()
    }, 15_000)

    it('lectura no abre el alta aunque la URL la pida', async () => {
      montar(['lectura'], `/ventas/comprobantes?alta=1&cliente=${BEE_KINGDOM}`)

      await fila('Factura E 0003-00000041')
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  it('cada comprobante lleva a su detalle', async () => {
    const { usuario, router } = montar()

    await usuario.click(
      await screen.findByRole('link', { name: 'Factura A 0001-00000128' }),
    )

    expect(router.state.location.pathname).toMatch(
      /^\/ventas\/comprobantes\/[0-9a-f-]{36}$/,
    )
  })
})
