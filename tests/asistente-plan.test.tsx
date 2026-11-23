// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  asistenteHttp,
  type ApiAsistente,
  type Propuesta,
  type RespuestaAsistente,
} from '../src/api/asistente'
import { ApiError, fijarProveedorDeToken } from '../src/api/client'
import type { Rol } from '../src/auth/identidad'
import { ProveedorDeSesionFijo } from '../src/auth/sesion'
import {
  conReferencias,
  enlaceDelResultado,
  esAccionFinal,
  esPropuestaEjecutable,
  estaListaParaEjecutar,
  historialParaEnviar,
  referenciasDe,
  SEGUIR,
  textoDeResultado,
  tituloDeAccion,
} from '../src/lib/asistente'
import type { PropuestaEnChat } from '../src/modulos/asistente/conversacion'
import PanelAsistente from '../src/modulos/asistente/PanelAsistente'
import { bloqueoDelPaso, textoDelPlan } from '../src/modulos/asistente/plan'

const PARQUE = '00000301-0000-4000-8000-000000000301'
const PEDIDO = '00000201-0000-4000-8000-000000000201'
const MATERIAL = '00000401-0000-4000-8000-000000000401'
const ID_PASO_1 = '11111111-1111-4111-8111-111111111111'
const ID_PASO_2 = '22222222-2222-4222-8222-222222222222'
const ID_PASO_3 = '33333333-3333-4333-8333-333333333333'
const ref = (id: string) => `{{ref:${id}.id}}`

const propuesta = (cambios: Partial<Propuesta> = {}): Propuesta => ({
  id: '9b2f7a52-0c1e-4c55-9d7e-3f0a1b2c3d4e',
  accion: 'crear_pedido',
  metodo: 'POST',
  ruta: '/api/v1/pedidos',
  cuerpo: { cliente_id: 'c-1' },
  resumen: [{ etiqueta: 'Cliente', valor: 'Apícola Don Emilio' }],
  roles_permitidos: ['admin', 'ventas'],
  paso: 1,
  depende_de: [],
  ...cambios,
})

const pasoParque = propuesta({
  id: ID_PASO_1,
  accion: 'crear_parque',
  ruta: '/api/v1/parques',
  cuerpo: { nombre: 'Casa Santi', ubicacion: 'Grand Bell', capacidad_max: 100 },
  resumen: [{ etiqueta: 'Nombre', valor: 'Casa Santi' }],
  roles_permitidos: ['admin', 'produccion'],
})
const pasoNucleos = propuesta({
  id: ID_PASO_2,
  accion: 'crear_nucleos',
  ruta: `/api/v1/parques/${ref(ID_PASO_1)}/nucleos`,
  cuerpo: { cantidad: 10 },
  resumen: [{ etiqueta: 'Núcleos a crear', valor: '10' }],
  roles_permitidos: ['admin', 'produccion'],
  paso: 2,
  depende_de: [ID_PASO_1],
})

// --- reglas sin React ---

describe('lista blanca de rutas', () => {
  it.each([
    ['crear_parque', '/api/v1/parques'],
    ['crear_nucleos', `/api/v1/parques/${PARQUE}/nucleos`],
    ['crear_banco', '/api/v1/bancos'],
    ['crear_raza', '/api/v1/razas'],
    ['crear_producto', '/api/v1/items-vendibles'],
    ['crear_material', '/api/v1/materiales'],
    [
      'registrar_movimiento_material',
      `/api/v1/materiales/${MATERIAL}/movimientos`,
    ],
    ['cancelar_pedido', `/api/v1/pedidos/${PEDIDO}/estado`],
  ] as const)('%s con su ruta exacta', (accion, ruta) => {
    const p = propuesta({ accion, ruta })
    expect(esPropuestaEjecutable(p)).toBe(true)
    expect(estaListaParaEjecutar(p)).toBe(true)
  })

  it.each([
    ['crear_parque', '/api/v1/parques/x'],
    ['crear_nucleos', '/api/v1/parques/123/nucleos'],
    ['cancelar_pedido', `/api/v1/pedidos/${PEDIDO}/reservas`],
    ['crear_producto', '/api/v1/productos'],
    ['registrar_movimiento_material', `/api/v1/materiales/${MATERIAL}`],
  ] as const)('%s con otra ruta no se ejecuta (%s)', (accion, ruta) => {
    expect(esPropuestaEjecutable(propuesta({ accion, ruta }))).toBe(false)
  })

  it('acepta el marcador solo donde va el id, y no se llama hasta reemplazarlo', () => {
    expect(esPropuestaEjecutable(pasoNucleos)).toBe(true)
    expect(estaListaParaEjecutar(pasoNucleos)).toBe(false)
    expect(referenciasDe(pasoNucleos)).toEqual([ID_PASO_1])

    for (const ruta of [
      `/api/v1/parques${ref(ID_PASO_1)}`,
      `/api/v1/parques/${ref(ID_PASO_1)}/nucleos/x`,
      '/api/v1/parques/{{ref:no-es-uuid.id}}/nucleos',
      `/api/v1/parques/{{ref:${ID_PASO_1}.nombre}}/nucleos`,
    ])
      expect(
        esPropuestaEjecutable(propuesta({ accion: 'crear_nucleos', ruta })),
      ).toBe(false)
  })
})

describe('reemplazo de marcadores', () => {
  it('cambia el marcador de la ruta y del cuerpo por el id creado', () => {
    const pedido = propuesta({
      id: ID_PASO_2,
      cuerpo: {
        cliente_id: ref(ID_PASO_1),
        items: [{ raza_id: ref(ID_PASO_1), cantidad: 3 }],
      },
    })

    expect(conReferencias(pasoNucleos, { [ID_PASO_1]: PARQUE }).ruta).toBe(
      `/api/v1/parques/${PARQUE}/nucleos`,
    )
    expect(conReferencias(pedido, { [ID_PASO_1]: PARQUE }).cuerpo).toEqual({
      cliente_id: PARQUE,
      items: [{ raza_id: PARQUE, cantidad: 3 }],
    })
  })

  it('sin el id del paso anterior, error claro', () => {
    expect(() => conReferencias(pasoNucleos, {})).toThrowError(
      /Falta el id de un paso anterior/,
    )
  })

  it('si lo reemplazado no es un id válido, la ruta se rechaza', () => {
    const error = (() => {
      try {
        conReferencias(pasoNucleos, { [ID_PASO_1]: '../usuarios' })
      } catch (e) {
        return e
      }
    })()
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).codigo).toBe('propuesta_invalida')
  })

  it('asistenteHttp no llama a la red con un marcador sin reemplazar', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const error = await asistenteHttp()
      .confirmar(pasoNucleos)
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('títulos, enlaces y resultados de las acciones nuevas', () => {
  it('cada acción nueva tiene título y la de cancelar va con advertencia', () => {
    expect(tituloDeAccion('crear_parque')).toBe('Crear parque')
    expect(tituloDeAccion('crear_nucleos')).toBe('Agregar núcleos al parque')
    expect(tituloDeAccion('crear_producto')).toBe('Crear producto')
    expect(tituloDeAccion('registrar_movimiento_material')).toBe(
      'Registrar movimiento de material',
    )
    expect(tituloDeAccion('cancelar_pedido')).toBe('Cancelar pedido')
    expect(esAccionFinal('cancelar_pedido')).toBe(true)
    expect(esAccionFinal('crear_parque')).toBe(false)
  })

  it('lleva a cada catálogo, a los núcleos del parque, al material o al pedido', () => {
    const a = (accion: Propuesta['accion'], ruta: string, r: unknown = {}) =>
      enlaceDelResultado(propuesta({ accion, ruta }), r)?.a

    expect(a('crear_parque', '/api/v1/parques', { id: PARQUE })).toBe(
      '/produccion/parques',
    )
    expect(a('crear_banco', '/api/v1/bancos')).toBe('/produccion/bancos')
    expect(a('crear_raza', '/api/v1/razas')).toBe('/produccion/razas')
    expect(a('crear_producto', '/api/v1/items-vendibles')).toBe(
      '/ventas/items-vendibles',
    )
    expect(a('crear_material', '/api/v1/materiales')).toBe(
      '/produccion/materiales',
    )
    expect(
      a('crear_nucleos', `/api/v1/parques/${PARQUE}/nucleos`, {
        parque_id: PARQUE,
      }),
    ).toBe(`/produccion/nucleos?parque=${PARQUE}`)
    expect(
      a(
        'registrar_movimiento_material',
        `/api/v1/materiales/${MATERIAL}/movimientos`,
      ),
    ).toBe(`/produccion/materiales/${MATERIAL}`)
    expect(a('cancelar_pedido', `/api/v1/pedidos/${PEDIDO}/estado`)).toBe(
      `/ventas/pedidos/${PEDIDO}`,
    )
  })

  it('el texto del resultado dice la acción, el nombre y el id, o el error', () => {
    expect(
      textoDeResultado(pasoParque, {
        tipo: 'confirmada',
        respuesta: { id: PARQUE, nombre: 'Casa Santi' },
      }),
    ).toBe(
      `Confirmado crear_parque: se creó el parque Casa Santi (id ${PARQUE})`,
    )
    expect(
      textoDeResultado(conReferencias(pasoNucleos, { [ID_PASO_1]: PARQUE }), {
        tipo: 'confirmada',
        respuesta: {
          parque_id: PARQUE,
          creados: 10,
          nucleos_activos: 10,
          capacidad_max: 100,
        },
      }),
    ).toBe(
      `Confirmado crear_nucleos: se crearon 10 núcleos en el parque (id ${PARQUE}); el parque tiene 10 de 100`,
    )
    expect(
      textoDeResultado(pasoNucleos, {
        tipo: 'fallida',
        mensaje: 'En el parque entran 3 nucleos mas.',
      }),
    ).toBe('Falló crear_nucleos: En el parque entran 3 nucleos mas.')
    expect(textoDeResultado(propuesta(), { tipo: 'descartada' })).toBe(
      'El usuario descartó la propuesta crear_pedido',
    )
  })

  it('el historial que se manda incluye los resultados y respeta el tope de 20', () => {
    const mensajes = Array.from({ length: 25 }, (_, i) => ({
      rol: i % 2 ? ('resultado' as const) : ('usuario' as const),
      texto: `m${i}`,
    }))
    const enviado = historialParaEnviar(mensajes)
    expect(enviado).toHaveLength(20)
    expect(enviado.at(-2)).toEqual({ rol: 'resultado', texto: 'm23' })
  })
})

describe('plan sin React', () => {
  const en = (
    p: Propuesta,
    estado: PropuestaEnChat['estado'],
    extra: Partial<PropuestaEnChat> = {},
  ): PropuestaEnChat => ({ propuesta: p, estado, ...extra })

  it('un paso espera a que se confirmen los anteriores', () => {
    const pasos = [en(pasoParque, 'pendiente'), en(pasoNucleos, 'pendiente')]
    expect(bloqueoDelPaso(pasos, ID_PASO_1)).toBeNull()
    expect(bloqueoDelPaso(pasos, ID_PASO_2)).toBe('Primero confirmá el paso 1.')
    expect(
      bloqueoDelPaso(
        [en(pasoParque, 'confirmada'), en(pasoNucleos, 'pendiente')],
        ID_PASO_2,
      ),
    ).toBeNull()
  })

  it('el resultado del plan detalla cada paso', () => {
    expect(
      textoDelPlan([
        en(pasoParque, 'confirmada', {
          detalle: 'Confirmado crear_parque: ok',
        }),
        en(pasoNucleos, 'fallida', {
          detalle: 'Falló crear_nucleos: sin lugar',
        }),
        en(propuesta({ id: ID_PASO_3, paso: 3 }), 'pendiente'),
      ]),
    ).toBe(
      [
        'Plan de 3 pasos:',
        'Paso 1 (crear_parque): Confirmado crear_parque: ok',
        'Paso 2 (crear_nucleos): Falló crear_nucleos: sin lugar',
        'Paso 3 (crear_pedido): no se ejecutó (se frenó en el paso que falló)',
      ].join('\n'),
    )
    expect(
      textoDelPlan([
        en(pasoParque, 'descartada'),
        en(pasoNucleos, 'descartada'),
      ]),
    ).toBe('El usuario descartó el plan de 2 pasos.')
  })
})

// --- el panel ---

const EMAIL = 'x@malka.test'
const TENANT = '11111111-1111-4111-8111-111111111111'

function apiFalsa() {
  return {
    conversar: vi.fn<ApiAsistente['conversar']>(),
    confirmar: vi.fn<ApiAsistente['confirmar']>(),
  }
}

function Proveedores({
  roles,
  children,
}: {
  roles: Rol[]
  children: ReactNode
}) {
  return (
    <ProveedorDeSesionFijo
      identidad={{ email: EMAIL, roles, tenantId: TENANT }}
    >
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { mutations: { retry: false } } })
        }
      >
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    </ProveedorDeSesionFijo>
  )
}

function abrirPanel(api: ApiAsistente, roles: Rol[] = ['admin']) {
  render(
    <Proveedores roles={roles}>
      <PanelAsistente abierto alCerrar={vi.fn()} api={api} />
    </Proveedores>,
  )
}

async function escribirYEnviar(texto: string) {
  const usuario = userEvent.setup()
  await usuario.type(
    screen.getByLabelText('Mensaje para el asistente'),
    `${texto}{Enter}`,
  )
  return usuario
}

const con = (...propuestas: Propuesta[]): RespuestaAsistente => ({
  texto: 'Listo.',
  consultas: [],
  propuestas,
})

const resultados = () => screen.queryAllByRole('note')

beforeEach(() => sessionStorage.clear())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  fijarProveedorDeToken(() => null)
})

describe('mensaje resultado y botón Seguir', () => {
  it('tras confirmar, agrega el resultado con el id y Seguir lo manda al asistente', async () => {
    const api = apiFalsa()
    api.conversar
      .mockResolvedValueOnce(con(pasoParque))
      .mockResolvedValueOnce({ texto: 'Sigo.', consultas: [], propuestas: [] })
    api.confirmar.mockResolvedValue({ id: PARQUE, nombre: 'Casa Santi' })
    abrirPanel(api)
    const usuario = await escribirYEnviar('creá el parque')
    const tarjeta = await screen.findByRole('article', { name: 'Crear parque' })

    await usuario.click(
      within(tarjeta).getByRole('button', { name: 'Confirmar' }),
    )

    const texto = `Confirmado crear_parque: se creó el parque Casa Santi (id ${PARQUE})`
    expect(await screen.findByText(texto)).toBeTruthy()
    await usuario.click(screen.getByRole('button', { name: 'Seguir' }))
    expect(api.conversar).toHaveBeenCalledTimes(2)
    expect(api.conversar.mock.calls[1][0].slice(-2)).toEqual([
      { rol: 'resultado', texto },
      { rol: 'usuario', texto: SEGUIR },
    ])
    expect(await screen.findByText('Sigo.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Seguir' })).toBeNull()
  })

  it('tras descartar, el resultado lo dice', async () => {
    const api = apiFalsa()
    api.conversar.mockResolvedValue(con(propuesta()))
    abrirPanel(api)
    const usuario = await escribirYEnviar('crear pedido')
    const tarjeta = await screen.findByRole('article', { name: 'Crear pedido' })

    await usuario.click(
      within(tarjeta).getByRole('button', { name: 'Descartar' }),
    )

    expect(
      screen.getByText('El usuario descartó la propuesta crear_pedido'),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Seguir' })).toBeTruthy()
  })

  it('tras un error, el resultado trae el mensaje claro', async () => {
    const api = apiFalsa()
    api.conversar.mockResolvedValue(con(propuesta()))
    api.confirmar.mockRejectedValue(
      new ApiError({
        status: 409,
        codigo: 'x',
        mensaje: 'No alcanzan las reinas.',
      }),
    )
    abrirPanel(api)
    const usuario = await escribirYEnviar('crear pedido')
    const tarjeta = await screen.findByRole('article', { name: 'Crear pedido' })

    await usuario.click(
      within(tarjeta).getByRole('button', { name: 'Confirmar' }),
    )

    expect(
      await screen.findByText('Falló crear_pedido: No alcanzan las reinas.'),
    ).toBeTruthy()
  })

  it('cancelar un pedido se muestra con tono de advertencia', async () => {
    const api = apiFalsa()
    api.conversar.mockResolvedValue(
      con(
        propuesta({
          accion: 'cancelar_pedido',
          ruta: `/api/v1/pedidos/${PEDIDO}/estado`,
          cuerpo: { estado: 'cancelado' },
        }),
      ),
    )
    abrirPanel(api)
    await escribirYEnviar('cancelá el pedido')

    const tarjeta = await screen.findByRole('article', {
      name: 'Cancelar pedido',
    })
    const aviso = within(tarjeta).getByText('Atención: no se puede deshacer.')
    const confirmar = within(tarjeta).getByRole('button', { name: 'Confirmar' })
    expect(confirmar.getAttribute('aria-describedby')).toContain(aviso.id)
    expect(tarjeta.className).toContain('border-peligro')
  })
})

describe('plan de varios pasos', () => {
  it('Confirmar todo ejecuta en orden, reemplaza el marcador y manda un solo resultado', async () => {
    const api = apiFalsa()
    api.conversar.mockResolvedValue(con(pasoParque, pasoNucleos))
    api.confirmar
      .mockResolvedValueOnce({ id: PARQUE, nombre: 'Casa Santi' })
      .mockResolvedValueOnce({
        parque_id: PARQUE,
        creados: 10,
        nucleos_activos: 10,
        capacidad_max: 100,
      })
    abrirPanel(api)
    const usuario = await escribirYEnviar('creá el parque con 10 núcleos')
    const plan = await screen.findByRole('region', { name: 'Plan de 2 pasos' })
    expect(
      within(plan).getByRole('article', { name: 'Paso 1: Crear parque' }),
    ).toBeTruthy()

    await usuario.click(
      within(plan).getByRole('button', { name: 'Confirmar todo' }),
    )

    expect(
      await within(plan).findByText('Listo: se confirmaron todos los pasos.'),
    ).toBeTruthy()
    expect(api.confirmar.mock.calls.map(([p]) => [p.id, p.ruta])).toEqual([
      [ID_PASO_1, '/api/v1/parques'],
      [ID_PASO_2, `/api/v1/parques/${PARQUE}/nucleos`],
    ])
    const [resultado] = resultados()
    expect(resultados()).toHaveLength(1)
    expect(resultado.textContent).toContain('Plan de 2 pasos:')
    expect(resultado.textContent).toContain(
      `se creó el parque Casa Santi (id ${PARQUE})`,
    )
    expect(resultado.textContent).toContain('se crearon 10 núcleos')
    expect(
      within(plan)
        .getByRole('link', { name: 'Ver los núcleos del parque' })
        .getAttribute('href'),
    ).toBe(`/produccion/nucleos?parque=${PARQUE}`)
  })

  it('se frena en el primer error, no corre lo que depende, y reintenta desde ahí sin duplicar', async () => {
    const pasoTres = propuesta({
      id: ID_PASO_3,
      accion: 'crear_nucleos',
      ruta: `/api/v1/parques/${ref(ID_PASO_1)}/nucleos`,
      cuerpo: { cantidad: 2 },
      paso: 3,
      depende_de: [ID_PASO_1],
    })
    const api = apiFalsa()
    api.conversar.mockResolvedValue(con(pasoParque, pasoNucleos, pasoTres))
    api.confirmar
      .mockResolvedValueOnce({ id: PARQUE, nombre: 'Casa Santi' })
      .mockRejectedValueOnce(
        new ApiError({
          status: 409,
          codigo: 'c',
          mensaje: 'Sin lugar en el parque.',
        }),
      )
      .mockResolvedValue({ parque_id: PARQUE, creados: 1 })
    abrirPanel(api)
    const usuario = await escribirYEnviar('plan')
    const plan = await screen.findByRole('region', { name: 'Plan de 3 pasos' })

    await usuario.click(
      within(plan).getByRole('button', { name: 'Confirmar todo' }),
    )

    const estado = await within(plan).findByText(/Falló el paso 2/)
    expect(estado.textContent).toBe(
      'Se hizo el paso 1. Falló el paso 2 (Agregar núcleos al parque): Sin lugar en el parque. Los siguientes no se ejecutaron.',
    )
    expect(api.confirmar).toHaveBeenCalledTimes(2)
    expect(resultados()).toHaveLength(1)
    expect(resultados()[0].textContent).toContain(
      'Paso 3 (crear_nucleos): no se ejecutó',
    )

    await usuario.click(
      within(plan).getByRole('button', { name: 'Reintentar desde acá' }),
    )

    expect(
      await within(plan).findByText('Listo: se confirmaron todos los pasos.'),
    ).toBeTruthy()
    // El paso 1 no se repite; el 2 vuelve con la misma Idempotency-Key.
    expect(api.confirmar.mock.calls.map(([p]) => p.id)).toEqual([
      ID_PASO_1,
      ID_PASO_2,
      ID_PASO_2,
      ID_PASO_3,
    ])
    expect(resultados()).toHaveLength(2)
  })

  it('paso a paso: el siguiente espera al anterior', async () => {
    const api = apiFalsa()
    api.conversar.mockResolvedValue(con(pasoParque, pasoNucleos))
    api.confirmar.mockResolvedValue({ id: PARQUE, nombre: 'Casa Santi' })
    abrirPanel(api)
    const usuario = await escribirYEnviar('plan')
    const segundo = await screen.findByRole('article', {
      name: 'Paso 2: Agregar núcleos al parque',
    })
    const confirmarSegundo = within(segundo).getByRole('button', {
      name: 'Confirmar este paso',
    })
    expect(confirmarSegundo).toHaveProperty('disabled', true)
    expect(
      within(segundo).getByText('Primero confirmá el paso 1.'),
    ).toBeTruthy()

    const primero = screen.getByRole('article', {
      name: 'Paso 1: Crear parque',
    })
    await usuario.click(
      within(primero).getByRole('button', { name: 'Confirmar este paso' }),
    )
    expect(await within(primero).findByText('Confirmada')).toBeTruthy()
    expect(resultados()).toHaveLength(0)

    await usuario.click(
      within(segundo).getByRole('button', { name: 'Confirmar este paso' }),
    )
    expect(await within(segundo).findByText('Confirmada')).toBeTruthy()
    expect(api.confirmar.mock.calls[1][0].ruta).toBe(
      `/api/v1/parques/${PARQUE}/nucleos`,
    )
    expect(resultados()).toHaveLength(1)
  })

  it('descartar el plan no llama a la API y manda un resultado', async () => {
    const api = apiFalsa()
    api.conversar.mockResolvedValue(con(pasoParque, pasoNucleos))
    abrirPanel(api)
    const usuario = await escribirYEnviar('plan')
    const plan = await screen.findByRole('region', { name: 'Plan de 2 pasos' })

    await usuario.click(within(plan).getByRole('button', { name: 'Descartar' }))

    expect(
      within(plan).getByText('Descartaste el plan: no se guardó nada.'),
    ).toBeTruthy()
    expect(within(plan).queryByRole('button')).toBeNull()
    expect(api.confirmar).not.toHaveBeenCalled()
    expect(
      screen.getByText('El usuario descartó el plan de 2 pasos.'),
    ).toBeTruthy()
  })
})

describe('asistente simulado', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DATOS_SIMULADOS', 'true')
    vi.resetModules()
  })

  it('arma el parque y sus núcleos como un plan y confirmarlo lo crea una sola vez', async () => {
    const { asistenteSimulado } = await import('../src/api/asistenteSimulado')
    const { nucleos, parques } = await import('../src/api/recursos')
    const lib = await import('../src/lib/asistente')
    const api = asistenteSimulado({ demoraMs: 0 })

    const r = await api.conversar([
      {
        rol: 'usuario',
        texto:
          'Creá un parque Casa Santi, ubicación Grand Bell, capacidad 100, con 10 núcleos activos',
      },
    ])

    const [parque, lote] = r.propuestas
    expect(parque.cuerpo).toEqual({
      nombre: 'Casa Santi',
      ubicacion: 'Grand Bell',
      capacidad_max: 100,
    })
    expect(lote.ruta).toBe(`/api/v1/parques/{{ref:${parque.id}.id}}/nucleos`)
    expect(lote.depende_de).toEqual([parque.id])
    expect(lote.paso).toBe(2)

    const creado = (await api.confirmar(parque)) as { id: string }
    const otraVez = (await api.confirmar(parque)) as { id: string }
    expect(otraVez.id).toBe(creado.id)
    const resuelta = lib.conReferencias(lote, { [parque.id]: creado.id })
    await api.confirmar(resuelta)
    await api.confirmar(resuelta)

    const delParque = await nucleos.listar({
      limite: 100,
      filtros: { parque_id: creado.id },
    })
    expect(delParque.items).toHaveLength(10)
    const guardado = await parques.obtener(creado.id)
    expect(guardado.nombre).toBe('Casa Santi')
    await expect(api.confirmar(lote)).rejects.toMatchObject({
      codigo: 'propuesta_invalida',
    })
  })

  it('después de un resultado responde sin pedir que se escriba', async () => {
    const { asistenteSimulado } = await import('../src/api/asistenteSimulado')

    const r = await asistenteSimulado({ demoraMs: 0 }).conversar([
      { rol: 'usuario', texto: 'creá el parque' },
      { rol: 'asistente', texto: 'Listo.' },
      { rol: 'resultado', texto: 'Confirmado crear_parque: se creó (id x)' },
      { rol: 'usuario', texto: SEGUIR },
    ])

    expect(r.texto).toMatch(/quedó guardado/)
    expect(r.propuestas).toEqual([])
  })
})
