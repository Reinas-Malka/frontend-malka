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
import { calcularCompletitud, embarquesSimulados } from '../src/api/embarques'
import type { Rol } from '../src/auth/identidad'
import { DATOS_SIMULADOS } from '../src/datos/simulados'
import { claveSimulada } from '../src/documentos/subirArchivo'
import { errorDeAwb, normalizarAwb } from '../src/lib/awb'
import { DOCUMENTOS_DEL_EMBARQUE } from '../src/tipos/dominio'

const TENANT = '11111111-1111-4111-8111-111111111111'
const [DIRECTO, CONSOLIDADO] = DATOS_SIMULADOS.embarques

describe('guía aérea IATA (mismas reglas que el backend)', () => {
  it.each([
    ['045-12345675', '045-12345675'],
    ['04512345675', '045-12345675'],
    [' 057 11111111 ', '057-11111111'],
  ])('%s es válida y queda como %s', (entrada, esperada) => {
    expect(normalizarAwb(entrada)).toBe(esperada)
  })

  it('un dígito verificador mal tipeado se detecta antes de mandar', () => {
    expect(normalizarAwb('045-12345670')).toBeNull()
    expect(errorDeAwb('045-12345670')).toMatch(/dígito verificador/)
    expect(errorDeAwb('45-1234')).toMatch(/formato/)
  })
})

describe('completitud del embarque', () => {
  it('con los 6 documentos está completo', () => {
    const c = calcularCompletitud('e', DOCUMENTOS_DEL_EMBARQUE)
    expect(c.completo).toBe(true)
    expect(c.faltantes).toEqual([])
  })

  it('con 5 lista el faltante, en el orden de los 6', () => {
    const c = calcularCompletitud(
      'e',
      DOCUMENTOS_DEL_EMBARQUE.filter((t) => t !== 'dte'),
    )
    expect(c.completo).toBe(false)
    expect(c.faltantes).toEqual(['dte'])
  })
})

describe('embarques simulados con las reglas del backend', () => {
  const nuevo = { destino_pais: 'uy', fecha_vuelo: '2026-11-20' }

  it('el alta arranca en preparación, sin documentos y con el país en mayúsculas', async () => {
    const api = embarquesSimulados()
    const e = await api.crear({ ...nuevo, awb: '05711111111' })
    expect(e).toMatchObject({
      estado: 'en_preparacion',
      destino_pais: 'UY',
      awb: '057-11111111',
      documentos_cargados: 0,
    })
  })

  it('la misma clave de idempotencia crea un solo embarque', async () => {
    const api = embarquesSimulados()
    const a = await api.crear(nuevo, 'clave-1')
    const b = await api.crear(nuevo, 'clave-1')
    expect(b.id).toBe(a.id)
  })

  it('una guía aérea repetida es 409 awb_duplicado', async () => {
    const api = embarquesSimulados()
    await expect(
      api.crear({ ...nuevo, awb: DIRECTO.awb }),
    ).rejects.toMatchObject({ status: 409, codigo: 'awb_duplicado' })
  })

  it('en tránsito sin guía aérea no se puede', async () => {
    const api = embarquesSimulados()
    await expect(
      api.actualizar(CONSOLIDADO.id, { estado: 'en_transito' }),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('un documento repetido es 409 y uno nuevo suma al "4/6"', async () => {
    const api = embarquesSimulados()
    const doc = {
      tipo: 'dte' as const,
      numero: 'DTE-1',
      fecha: '2026-11-18',
      archivo_s3_key: `documentos/${TENANT}/dte.pdf`,
    }
    await api.agregarDocumento(CONSOLIDADO.id, doc)
    await expect(
      api.agregarDocumento(CONSOLIDADO.id, doc),
    ).rejects.toMatchObject({ status: 409, codigo: 'documento_duplicado' })
    expect((await api.obtener(CONSOLIDADO.id)).documentos_cargados).toBe(3)
    expect((await api.completitud(CONSOLIDADO.id)).faltantes).not.toContain(
      'dte',
    )
  })

  it('un embarque cancelado ya no se edita ni recibe documentos', async () => {
    const api = embarquesSimulados()
    await api.actualizar(CONSOLIDADO.id, { estado: 'cancelado' })
    await expect(
      api.actualizar(CONSOLIDADO.id, { fecha_vuelo: '2026-12-01' }),
    ).rejects.toMatchObject({ codigo: 'embarque_cancelado' })
  })

  it('otro id responde 404 como en el backend', async () => {
    await expect(
      embarquesSimulados().obtener('no-existe'),
    ).rejects.toMatchObject({ status: 404, codigo: 'embarque_no_encontrado' })
  })
})

describe('key del archivo en la demo', () => {
  it('va bajo el prefijo del criadero y sin caracteres raros, como pide el CHECK', () => {
    const clave = claveSimulada(TENANT, 'Guía aérea Nº 1.pdf')
    expect(clave.startsWith(`documentos/${TENANT}/`)).toBe(true)
    expect(clave).toMatch(/^documentos\/[0-9a-f-]{36}\/[A-Za-z0-9._/-]+$/)
  })
})

describe('pantallas de embarques', () => {
  // api/embarques.ts decide simulado/real al cargarse: el flag va antes.
  let EmbarquesPage: ComponentType
  let EmbarquePage: ComponentType
  // Del mismo grafo de módulos que las pantallas: si no, el contexto de sesión es otro.
  let ProveedorDeSesionFijo: typeof import('../src/auth/sesion').ProveedorDeSesionFijo

  beforeAll(async () => {
    vi.stubEnv('VITE_DATOS_SIMULADOS', 'true')
    vi.resetModules()
    EmbarquesPage = (await import('../src/pages/EmbarquesPage')).default
    EmbarquePage = (await import('../src/pages/EmbarquePage')).default
    ProveedorDeSesionFijo = (await import('../src/auth/sesion'))
      .ProveedorDeSesionFijo
  })
  afterAll(() => vi.unstubAllEnvs())
  afterEach(cleanup)

  function montar(ruta: string, roles: Rol[]) {
    const router = createMemoryRouter(
      [
        { path: '/exportacion/embarques', element: <EmbarquesPage /> },
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

  it('el listado muestra cuántos de los 6 documentos tiene cada envío', async () => {
    montar('/exportacion/embarques', ['lectura'])

    expect(await screen.findByRole('link', { name: 'Chile (CL)' })).toBeTruthy()
    expect(screen.getByLabelText('6 de 6 documentos')).toBeTruthy()
    expect(screen.getByLabelText('2 de 6 documentos')).toBeTruthy()
  })

  it('lectura ve los embarques pero no puede crear', async () => {
    montar('/exportacion/embarques', ['lectura'])

    await screen.findByRole('link', { name: 'Chile (CL)' })
    expect(screen.queryByRole('button', { name: /nuevo embarque/i })).toBeNull()
  })

  it('ventas puede crear un embarque', async () => {
    montar('/exportacion/embarques', ['ventas'])

    expect(
      await screen.findByRole('button', { name: /nuevo embarque/i }),
    ).toBeTruthy()
  })

  it('el detalle dice qué falta, quién lo emite, y lectura no puede cargar', async () => {
    montar(`/exportacion/embarques/${CONSOLIDADO.id}`, ['lectura'])

    expect(await screen.findByText(/2 de 6/)).toBeTruthy()
    expect(
      screen.getByText(
        "Faltan: Permiso de embarque, Guía aérea (AWB), DTe, Shipper's certificate.",
      ),
    ).toBeTruthy()
    expect(screen.getByText('Lo emite: SENASA')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^cargar/i })).toBeNull()
  })

  it('ventas carga el DTe y el embarque pasa a 3 de 6', async () => {
    const usuario = userEvent.setup()
    montar(`/exportacion/embarques/${CONSOLIDADO.id}`, ['ventas'])

    await usuario.click(
      await screen.findByRole('button', { name: 'Cargar DTe' }),
    )
    await usuario.type(
      screen.getByLabelText('Número del documento'),
      'DTE-2026-120001',
    )
    await usuario.type(screen.getByLabelText('Fecha de emisión'), '2026-11-18')
    await usuario.upload(
      screen.getByLabelText('Archivo'),
      new File(['%PDF'], 'dte.pdf', { type: 'application/pdf' }),
    )
    await usuario.click(
      screen.getByRole('button', { name: 'Cargar documento' }),
    )

    expect(await screen.findByText(/3 de 6/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Cargar DTe' })).toBeNull()
  })

  it('sin número transcripto no deja cargar', async () => {
    const usuario = userEvent.setup()
    montar(`/exportacion/embarques/${CONSOLIDADO.id}`, ['ventas'])

    await usuario.click(
      await screen.findByRole('button', { name: 'Cargar Permiso de embarque' }),
    )
    await usuario.click(
      screen.getByRole('button', { name: 'Cargar documento' }),
    )

    expect(screen.getByText('Transcribí el número del documento.')).toBeTruthy()
  })
})
