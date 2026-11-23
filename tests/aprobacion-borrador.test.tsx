// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  act,
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
  beforeAll,
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
const [PEDIDO] = DATOS_SIMULADOS.pedidos
const CLIENTE = DATOS_SIMULADOS.clientes.find(
  (c) => c.id === PEDIDO.cliente_id,
)!
const DEL_CLIENTE = DATOS_SIMULADOS.comprobantes.find(
  (c) => c.cliente_id === CLIENTE.id,
)!
const DE_OTROS = DATOS_SIMULADOS.comprobantes.filter(
  (c) => c.cliente_id !== CLIENTE.id,
)
const UUID = /^[0-9a-f-]{36}$/
const TITULO = `Nota de venta de reinas a ${CLIENTE.nombre}`

describe('aprobación del borrador en el detalle del pedido', () => {
  let PedidoPage: ComponentType
  let ProveedorDeSesionFijo: typeof import('../src/auth/sesion').ProveedorDeSesionFijo
  // La misma simulación que la pantalla.
  let api: typeof import('../src/api/borradores').borradores
  let ApiError: typeof import('../src/api/client').ApiError

  beforeAll(() => {
    // El Select de Radix usa APIs de puntero y scroll que jsdom no implementa.
    Element.prototype.hasPointerCapture = () => false
    Element.prototype.releasePointerCapture = () => {}
    Element.prototype.scrollIntoView = () => {}
  })
  // Módulos nuevos en cada test: la simulación arranca sin borradores.
  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.stubEnv('VITE_DATOS_SIMULADOS', 'true')
    vi.resetModules()
    PedidoPage = (await import('../src/pages/PedidoPage')).default
    ProveedorDeSesionFijo = (await import('../src/auth/sesion'))
      .ProveedorDeSesionFijo
    api = (await import('../src/api/borradores')).borradores
    ApiError = (await import('../src/api/client')).ApiError
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })
  afterAll(() => vi.unstubAllEnvs())

  const avanzar = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

  /** Un borrador listo para revisar, generado por la simulación. */
  async function borradorParaRevisar() {
    const { id } = await api.pedir(PEDIDO.id)
    await avanzar(2000)
    return api.obtener(id)
  }

  function abrir(roles: Rol[] = ['admin']) {
    const router = createMemoryRouter(
      [
        { path: '/ventas/pedidos/:id', element: <PedidoPage /> },
        { path: '/ventas/comprobantes/:id', element: <p>Comprobante</p> },
      ],
      { initialEntries: [`/ventas/pedidos/${PEDIDO.id}`] },
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
    return userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  }

  const seccion = async () => {
    const zona = within(
      await screen.findByRole('region', { name: 'Borrador con IA' }),
    )
    await zona.findByRole('heading', { name: TITULO })
    return zona
  }
  type Zona = Awaited<ReturnType<typeof seccion>>
  type Usuario = ReturnType<typeof abrir>

  const dialogo = async (nombre: string) =>
    within(await screen.findByRole('dialog', { name: nombre }))

  async function aprobarDesdeLaPantalla(usuario: Usuario, zona: Zona) {
    await usuario.click(zona.getByRole('button', { name: 'Aprobar' }))
    const d = await dialogo('Aprobar el borrador')
    await usuario.click(d.getByRole('button', { name: /Aprobar borrador/ }))
    return d
  }

  describe('roles', () => {
    it('admin puede aprobar y descartar', async () => {
      await borradorParaRevisar()
      abrir(['admin'])
      const zona = await seccion()

      expect(zona.getByText('Para revisar')).toBeTruthy()
      expect(zona.getByRole('button', { name: 'Aprobar' })).toHaveProperty(
        'disabled',
        false,
      )
      expect(zona.getByRole('button', { name: 'Descartar' })).toBeTruthy()
    })

    it('ventas descarta, pero aprobar queda deshabilitado con la explicación', async () => {
      await borradorParaRevisar()
      abrir(['ventas'])
      const zona = await seccion()

      const aprobar = zona.getByRole('button', { name: 'Aprobar' })
      expect(aprobar).toHaveProperty('disabled', true)
      expect(aprobar.getAttribute('aria-describedby')).toBeTruthy()
      expect(
        zona.getByText(
          'Solo una persona con rol de administración puede aprobar.',
        ),
      ).toBeTruthy()
      expect(zona.getByRole('button', { name: 'Descartar' })).toBeTruthy()
    })

    it('lectura no descarta y tampoco aprueba', async () => {
      await borradorParaRevisar()
      abrir(['lectura'])
      const zona = await seccion()

      expect(zona.getByRole('button', { name: 'Aprobar' })).toHaveProperty(
        'disabled',
        true,
      )
      expect(zona.queryByRole('button', { name: 'Descartar' })).toBeNull()
    })

    it('con cambios en la pantalla no se aprueba: se aprueba el texto guardado', async () => {
      await borradorParaRevisar()
      const usuario = abrir(['admin'])
      const zona = await seccion()

      await usuario.click(zona.getByRole('button', { name: /Editar texto/ }))
      await usuario.type(zona.getByLabelText('Encabezado'), ' (retocado)')

      expect(zona.getByRole('button', { name: 'Aprobar' })).toHaveProperty(
        'disabled',
        true,
      )
      expect(
        zona.getByText(/volvé al texto de la IA para aprobar/),
      ).toBeTruthy()
    })
  })

  describe('aprobar', () => {
    it('confirma el texto, avisa que el PDF no es fiscal y manda el hash del borrador cargado', async () => {
      const borrador = await borradorParaRevisar()
      const aprobar = vi.spyOn(api, 'aprobar')
      const usuario = abrir(['admin'])
      const zona = await seccion()

      await usuario.click(zona.getByRole('button', { name: 'Aprobar' }))
      const d = await dialogo('Aprobar el borrador')
      expect(
        d.getByText(
          'Se aprueba exactamente este texto, tal como está guardado.',
        ),
      ).toBeTruthy()
      expect(
        within(
          d.getByRole('figure', { name: 'Texto que se aprueba' }),
        ).getByText(TITULO),
      ).toBeTruthy()
      expect(d.getByText(/queda congelado/)).toBeTruthy()
      expect(d.getByText('No es un comprobante fiscal')).toBeTruthy()
      expect(
        d.getByRole('combobox', { name: 'Comprobante de ARCA (opcional)' })
          .textContent,
      ).toBe('Sin comprobante')

      await usuario.click(d.getByRole('button', { name: /Aprobar borrador/ }))

      await waitFor(() => expect(aprobar).toHaveBeenCalledTimes(1))
      const [id, datos, clave] = aprobar.mock.calls[0]
      expect(id).toBe(borrador.id)
      expect(datos).toEqual({
        hash_contenido: borrador.hash_contenido,
        comprobante_id: null,
      })
      expect(clave).toMatch(UUID)
      expect(
        await zona.findByRole('heading', { name: 'Borrador aprobado' }),
      ).toBeTruthy()
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('el selector muestra solo los comprobantes del cliente y vincula el elegido', async () => {
      const borrador = await borradorParaRevisar()
      const aprobar = vi.spyOn(api, 'aprobar')
      const usuario = abrir(['admin'])
      const zona = await seccion()
      await usuario.click(zona.getByRole('button', { name: 'Aprobar' }))
      const d = await dialogo('Aprobar el borrador')

      await usuario.click(
        d.getByRole('combobox', { name: 'Comprobante de ARCA (opcional)' }),
      )
      const etiqueta = `Factura A 0001-00000128 · ${formatearFecha(DEL_CLIENTE.fecha_emision)}`
      const opciones = (await screen.findAllByRole('option')).map(
        (o) => o.textContent,
      )
      expect(opciones).toEqual(['Sin comprobante', etiqueta])
      for (const otro of DE_OTROS)
        expect(opciones.join(' ')).not.toContain(
          String(otro.numero).padStart(8, '0'),
        )
      await usuario.click(screen.getByRole('option', { name: etiqueta }))
      await usuario.click(d.getByRole('button', { name: /Aprobar borrador/ }))

      await waitFor(() => expect(aprobar).toHaveBeenCalledTimes(1))
      expect(aprobar.mock.calls[0][1]).toEqual({
        hash_contenido: borrador.hash_contenido,
        comprobante_id: DEL_CLIENTE.id,
      })
      const enlace = await zona.findByRole('link', {
        name: 'Factura A 0001-00000128',
      })
      expect(enlace.getAttribute('href')).toBe(
        `/ventas/comprobantes/${DEL_CLIENTE.id}`,
      )
    })

    it('un 503 ofrece reintentar con la misma Idempotency-Key', async () => {
      await borradorParaRevisar()
      const aprobar = vi.spyOn(api, 'aprobar').mockRejectedValueOnce(
        new ApiError({
          status: 503,
          codigo: 'almacenamiento_no_disponible',
          mensaje: 'No se pudo guardar el PDF.',
        }),
      )
      const usuario = abrir(['admin'])
      const zona = await seccion()

      const d = await aprobarDesdeLaPantalla(usuario, zona)

      expect(await d.findByText(/no se aprobó nada/)).toBeTruthy()
      expect(d.queryByText(/almacenamiento_no_disponible/)).toBeNull()
      await usuario.click(d.getByRole('button', { name: 'Reintentar' }))
      await waitFor(() => expect(aprobar).toHaveBeenCalledTimes(2))
      expect(aprobar.mock.calls[1][2]).toBe(aprobar.mock.calls[0][2])
      expect(
        await zona.findByRole('heading', { name: 'Borrador aprobado' }),
      ).toBeTruthy()
    })

    it('version_desactualizada avisa que el borrador cambió y lo recarga', async () => {
      await borradorParaRevisar()
      vi.spyOn(api, 'aprobar').mockRejectedValueOnce(
        new ApiError({
          status: 409,
          codigo: 'version_desactualizada',
          mensaje: 'El borrador cambió desde que se cargó.',
        }),
      )
      const usuario = abrir(['admin'])
      const zona = await seccion()
      const obtener = vi.spyOn(api, 'obtener')

      await aprobarDesdeLaPantalla(usuario, zona)

      expect(
        await zona.findByText('El borrador cambió, volvé a cargarlo.'),
      ).toBeTruthy()
      await waitFor(() => expect(obtener).toHaveBeenCalled())
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(zona.queryByText(/version_desactualizada/)).toBeNull()
    })

    it('un 409 borrador_inmutable se explica sin el código', async () => {
      await borradorParaRevisar()
      vi.spyOn(api, 'aprobar').mockRejectedValueOnce(
        new ApiError({
          status: 409,
          codigo: 'borrador_inmutable',
          mensaje: 'El borrador es inmutable.',
        }),
      )
      const usuario = abrir(['admin'])
      const zona = await seccion()

      await aprobarDesdeLaPantalla(usuario, zona)

      expect(
        await zona.findByText(/ya quedó cerrado y no se puede cambiar/),
      ).toBeTruthy()
      expect(zona.queryByText(/borrador_inmutable/)).toBeNull()
    })

    it('un comprobante de otro cliente se avisa junto al selector', async () => {
      await borradorParaRevisar()
      vi.spyOn(api, 'aprobar').mockRejectedValueOnce(
        new ApiError({
          status: 422,
          codigo: 'comprobante_de_otro_cliente',
          mensaje: 'El comprobante es de otro cliente.',
        }),
      )
      const usuario = abrir(['admin'])
      const zona = await seccion()

      const d = await aprobarDesdeLaPantalla(usuario, zona)

      expect(await d.findByText(/es de otro cliente/)).toBeTruthy()
      expect(screen.getByRole('dialog')).toBeTruthy()
    })
  })

  describe('descartar', () => {
    it('pide el motivo (3 a 500, con contador) y muestra quién y cuándo', async () => {
      const borrador = await borradorParaRevisar()
      const descartar = vi.spyOn(api, 'descartar')
      const usuario = abrir(['ventas'])
      const zona = await seccion()

      await usuario.click(zona.getByRole('button', { name: 'Descartar' }))
      const d = await dialogo('Descartar el borrador')
      await usuario.click(d.getByRole('button', { name: /Descartar borrador/ }))
      expect(await d.findByText('Escribí por qué se descarta.')).toBeTruthy()

      const motivo = d.getByLabelText('Motivo')
      await usuario.type(motivo, 'no')
      expect(d.getByText('2/500')).toBeTruthy()
      await usuario.click(d.getByRole('button', { name: /Descartar borrador/ }))
      expect(await d.findByText('Escribí al menos 3 caracteres.')).toBeTruthy()
      expect(descartar).not.toHaveBeenCalled()

      await usuario.type(motivo, ' sirve: faltan las condiciones')
      await usuario.click(d.getByRole('button', { name: /Descartar borrador/ }))

      await waitFor(() => expect(descartar).toHaveBeenCalledTimes(1))
      expect(descartar.mock.calls[0][0]).toBe(borrador.id)
      expect(descartar.mock.calls[0][1]).toEqual({
        motivo: 'no sirve: faltan las condiciones',
      })
      expect(descartar.mock.calls[0][2]).toMatch(UUID)
      expect(
        await zona.findByRole('heading', { name: 'Borrador descartado' }),
      ).toBeTruthy()
      expect(zona.getByText('no sirve: faltan las condiciones')).toBeTruthy()
      expect(await zona.findByText('demo@malka.test')).toBeTruthy()
      expect(zona.getAllByText('Descartado').length).toBeGreaterThan(0)
      expect(
        zona.getByRole('button', { name: 'Generar uno nuevo' }),
      ).toBeTruthy()
      expect(zona.queryByRole('button', { name: 'Aprobar' })).toBeNull()
    })
  })

  describe('aprobado', () => {
    async function aprobado(roles: Rol[] = ['admin']) {
      const borrador = await borradorParaRevisar()
      await api.aprobar(
        borrador.id,
        { hash_contenido: borrador.hash_contenido!, comprobante_id: null },
        crypto.randomUUID(),
      )
      const usuario = abrir(roles)
      const zona = await seccion()
      await zona.findByRole('heading', { name: 'Borrador aprobado' })
      return { borrador, usuario, zona }
    }

    it('muestra quién y cuándo, sin edición ni decisión', async () => {
      const { zona } = await aprobado(['ventas'])

      expect(zona.getAllByText('Aprobado').length).toBeGreaterThan(0)
      expect(zona.getByText('demo@malka.test')).toBeTruthy()
      expect(zona.getByText('Sin comprobante vinculado')).toBeTruthy()
      expect(zona.getByText(/quedó congelado/)).toBeTruthy()
      expect(zona.getByText(/No es un comprobante fiscal/)).toBeTruthy()
      expect(zona.queryByRole('button', { name: /Editar texto/ })).toBeNull()
      expect(zona.queryByRole('button', { name: 'Aprobar' })).toBeNull()
      expect(zona.queryByRole('button', { name: 'Descartar' })).toBeNull()
    })

    it('abre el PDF en una pestaña nueva abierta en el clic', async () => {
      const { borrador, usuario, zona } = await aprobado()
      const pestana = {
        opener: {} as unknown,
        location: { href: '' },
        close: vi.fn(),
      }
      const abrirVentana = vi.fn(() => pestana)
      vi.stubGlobal('open', abrirVentana)
      const pdf = vi.spyOn(api, 'pdf')

      await usuario.click(zona.getByRole('button', { name: 'Abrir PDF' }))

      await waitFor(() =>
        expect(pestana.location.href).toMatch(/^(blob:|data:application\/pdf)/),
      )
      expect(abrirVentana).toHaveBeenCalledWith('', '_blank')
      expect(pestana.opener).toBeNull()
      expect(pdf).toHaveBeenCalledWith(borrador.id, { enLinea: true })
    })

    it('descarga el PDF pidiendo una URL nueva', async () => {
      const { borrador, usuario, zona } = await aprobado()
      const pdf = vi.spyOn(api, 'pdf')
      const clic = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => {})

      await usuario.click(zona.getByRole('button', { name: 'Descargar PDF' }))

      await waitFor(() => expect(clic).toHaveBeenCalledTimes(1))
      expect(pdf).toHaveBeenCalledWith(borrador.id)
    })

    it('genera una corrección con corrige_a y la marca como tal', async () => {
      const { borrador, usuario, zona } = await aprobado(['ventas'])
      const pedir = vi.spyOn(api, 'pedir')

      await usuario.click(
        zona.getByRole('button', { name: 'Generar corrección' }),
      )

      await waitFor(() => expect(pedir).toHaveBeenCalledTimes(1))
      expect(pedir.mock.calls[0][0]).toBe(PEDIDO.id)
      expect(pedir.mock.calls[0][2]).toEqual({ corrigeA: borrador.id })
      await avanzar(2000)
      await avanzar(2000)
      const dia = new Intl.DateTimeFormat('es-AR', {
        day: '2-digit',
        month: '2-digit',
        timeZone: 'America/Argentina/Buenos_Aires',
      }).format(new Date(borrador.creado_en))
      expect(
        await zona.findByText(`Corrige al borrador del ${dia}.`),
      ).toBeTruthy()
      expect(await zona.findByRole('button', { name: 'Aprobar' })).toBeTruthy()
    })

    it('el historial plegable muestra la bitácora', async () => {
      const { usuario, zona } = await aprobado()
      const boton = zona.getByRole('button', { name: 'Historial' })
      expect(boton.getAttribute('aria-expanded')).toBe('false')
      expect(
        zona.queryByRole('list', { name: 'Historial del borrador' }),
      ).toBeNull()

      await usuario.click(boton)

      expect(boton.getAttribute('aria-expanded')).toBe('true')
      const historial = within(
        zona.getByRole('list', { name: 'Historial del borrador' }),
      )
      expect(historial.getByText('Redactado por la IA')).toBeTruthy()
      expect(
        await historial.findByText('Aprobado por demo@malka.test'),
      ).toBeTruthy()
    })
  })

  it('la lista de borradores nombra cada estado', async () => {
    const primero = await borradorParaRevisar()
    await api.aprobar(
      primero.id,
      { hash_contenido: primero.hash_contenido!, comprobante_id: null },
      crypto.randomUUID(),
    )
    const segundo = await borradorParaRevisar()
    await api.descartar(segundo.id, { motivo: 'repetido' }, crypto.randomUUID())
    await borradorParaRevisar()
    abrir(['lectura'])
    const zona = await seccion()

    const lista = within(
      zona.getByRole('list', { name: 'Borradores del pedido' }),
    )
    expect(lista.getByText('Para revisar')).toBeTruthy()
    expect(lista.getByText('Aprobado')).toBeTruthy()
    expect(lista.getByText('Descartado')).toBeTruthy()
  })
})
