// @vitest-environment jsdom
// "Agregar núcleos" por cantidad a un parque (backend #155): el sistema los
// pone en una fila nueva; los errores, en lenguaje claro.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
import { ApiError } from '../src/api/client'
import { nucleosDeParqueSimulados } from '../src/api/nucleosDeParque'
import { recursoSimulado } from '../src/api/recurso'
import type { Rol } from '../src/auth/identidad'
import {
  errorDeCantidadDeNucleos,
  mensajeDeErrorDeNucleos,
  resumenDeNucleosAgregados,
} from '../src/modulos/produccion/nucleosDeParque'
import type { Nucleo, Parque } from '../src/tipos/dominio'

const parque = (cambios: Partial<Parque> = {}): Parque => ({
  id: 'p1',
  nombre: 'Parque Norte',
  ubicacion: 'Camino 3',
  capacidad_max: 10,
  nucleos_activos: 3,
  activo: true,
  ...cambios,
})

function simulacion(p: Parque, nucleos: Nucleo[]) {
  const parques = recursoSimulado<Parque, unknown, unknown>([p], () => p)
  const recursoNucleos = recursoSimulado<
    Nucleo,
    { parque_id: string; fila: number; posicion: number },
    unknown
  >(nucleos, (d, id) => ({ id, ...d, activo: true }))
  return {
    api: nucleosDeParqueSimulados({ parques, nucleos: recursoNucleos }),
    recursoNucleos,
  }
}

const enFila = (fila: number, n: number, activo = true): Nucleo[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `n${fila}-${i}`,
    parque_id: 'p1',
    fila,
    posicion: i + 1,
    activo,
  }))

describe('alta de núcleos por cantidad, simulada como el backend', () => {
  it('crea una fila nueva (la siguiente a la más alta) con posiciones 1..n', async () => {
    const { api, recursoNucleos } = simulacion(parque(), [
      ...enFila(1, 3),
      ...enFila(2, 1, false),
    ])

    const creados = await api.crear('p1', { cantidad: 4 })

    expect(creados).toMatchObject({
      creados: 4,
      fila: 3,
      posicion_desde: 1,
      posicion_hasta: 4,
      nucleos_activos: 7,
      capacidad_max: 10,
      advertencias: [],
    })
    const todos = (await recursoNucleos.listar({ limite: 100 })).items
    expect(todos.filter((n) => n.fila === 3).map((n) => n.posicion)).toEqual([
      1, 2, 3, 4,
    ])
  })

  it('si lo deja lleno avisa parque_al_limite; si no entra, 409 con cuántos', async () => {
    const { api } = simulacion(parque(), enFila(1, 3))
    await expect(api.crear('p1', { cantidad: 8 })).rejects.toMatchObject({
      status: 409,
      codigo: 'capacidad_insuficiente',
      detalles: { pedidos: 8, disponibles: 7, capacidad_max: 10 },
    })
    const lleno = await api.crear('p1', { cantidad: 7 })
    expect(lleno.advertencias.map((a) => a.code)).toEqual(['parque_al_limite'])
  })

  it('un parque dado de baja no admite núcleos y la misma clave no duplica', async () => {
    await expect(
      simulacion(parque({ activo: false }), []).api.crear('p1', {
        cantidad: 1,
      }),
    ).rejects.toMatchObject({ codigo: 'parque_inactivo' })

    const { api } = simulacion(parque(), [])
    const primera = await api.crear('p1', { cantidad: 2 }, 'clave')
    const repetida = await api.crear('p1', { cantidad: 2 }, 'clave')
    expect(repetida).toBe(primera)
    expect(repetida.nucleos_activos).toBe(2)
  })
})

describe('textos de "Agregar núcleos"', () => {
  it('valida la cantidad contra lo que entra en el parque', () => {
    const p = parque()
    expect(errorDeCantidadDeNucleos('', p)).toBe(
      'Escribí cuántos núcleos agregar.',
    )
    expect(errorDeCantidadDeNucleos('2,5', p)).toBe(
      'La cantidad es un número entero.',
    )
    expect(errorDeCantidadDeNucleos('0', p)).toBe('Agregá al menos un núcleo.')
    expect(errorDeCantidadDeNucleos('8', p)).toBe(
      'En el parque entran 7 núcleos más.',
    )
    expect(errorDeCantidadDeNucleos('7', p)).toBeNull()
  })

  it('traduce los errores del backend, sin códigos', () => {
    expect(
      mensajeDeErrorDeNucleos(
        new ApiError({
          status: 409,
          codigo: 'capacidad_insuficiente',
          mensaje: 'En el parque entran 2 nucleos mas.',
          detalles: {
            pedidos: 5,
            disponibles: 2,
            capacidad_max: 10,
            nucleos_activos: 8,
          },
        }),
      ),
    ).toBe('El parque admite 10 núcleos y ya tiene 8: entran 2 núcleos más.')
    expect(
      mensajeDeErrorDeNucleos(
        new ApiError({ status: 409, codigo: 'parque_sin_filas', mensaje: 'x' }),
      ),
    ).toMatch(/todas las filas/)
    expect(
      mensajeDeErrorDeNucleos(
        new ApiError({ status: 409, codigo: 'parque_inactivo', mensaje: 'x' }),
      ),
    ).toMatch(/reactivalo/)
  })

  it('resume lo creado y avisa si quedó lleno', () => {
    expect(
      resumenDeNucleosAgregados(
        {
          parque_id: 'p1',
          creados: 7,
          fila: 2,
          posicion_desde: 1,
          posicion_hasta: 7,
          nucleos_activos: 10,
          capacidad_max: 10,
          advertencias: [
            { code: 'parque_al_limite', message: 'lleno', details: {} },
          ],
        },
        'Parque Norte',
      ),
    ).toBe(
      'Se agregaron 7 núcleos a Parque Norte en la fila 2 (posiciones 1 a 7). Ahora tiene 10 de 10. El parque quedó lleno.',
    )
  })
})

describe('pantalla de parques', () => {
  let ParquesPage: typeof import('../src/pages/ParquesPage').default
  let ProveedorDeSesionFijo: typeof import('../src/auth/sesion').ProveedorDeSesionFijo

  beforeEach(async () => {
    vi.stubEnv('VITE_DATOS_SIMULADOS', 'true')
    vi.resetModules()
    ParquesPage = (await import('../src/pages/ParquesPage')).default
    ProveedorDeSesionFijo = (await import('../src/auth/sesion'))
      .ProveedorDeSesionFijo
  })
  afterAll(() => vi.unstubAllEnvs())
  afterEach(cleanup)

  function montar(roles: Rol[]) {
    const router = createMemoryRouter(
      [{ path: '/produccion/parques', element: <ParquesPage /> }],
      { initialEntries: ['/produccion/parques'] },
    )
    render(
      <ProveedorDeSesionFijo
        identidad={{ email: 'x@malka.test', roles, tenantId: 't' }}
      >
        <QueryClientProvider client={new QueryClient()}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ProveedorDeSesionFijo>,
    )
    return userEvent.setup()
  }

  it('producción agrega núcleos a un parque y ve dónde quedaron', async () => {
    const usuario = montar(['produccion'])

    await usuario.click(
      await screen.findByRole('button', {
        name: 'Agregar núcleos a Parque La Loma',
      }),
    )
    const dialogo = within(
      await screen.findByRole('dialog', {
        name: 'Agregar núcleos a Parque La Loma',
      }),
    )
    await usuario.type(dialogo.getByLabelText('Cantidad de núcleos'), '5')
    await usuario.click(
      dialogo.getByRole('button', { name: 'Agregar núcleos' }),
    )

    expect(
      await screen.findByText(
        /^Se agregaron 5 núcleos a Parque La Loma en la fila 6 \(posiciones 1 a 5\)\./,
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('lectura no ve la acción', async () => {
    montar(['lectura'])
    await screen.findByRole('cell', { name: 'Parque La Loma' })
    expect(screen.queryByRole('button', { name: /Agregar núcleos/ })).toBeNull()
  })
})
