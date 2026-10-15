// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import {
  createMemoryRouter,
  RouterProvider,
  type RouteObject,
} from 'react-router'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

// api/recursos.ts decide simulado/real al cargarse: el flag va antes del import.
let rutas: RouteObject[]
let ProveedorDeSesion: (p: { children: ReactNode }) => ReactNode
let enlaces: { a: string; texto: string }[]

beforeAll(async () => {
  vi.stubEnv('VITE_DATOS_SIMULADOS', 'true')
  rutas = (await import('../src/app/router')).rutas
  ProveedorDeSesion = (await import('../src/auth/sesion')).ProveedorDeSesion
  const { NAVEGACION } = await import('../src/app/navegacion')
  enlaces = NAVEGACION.flatMap((g) => g.enlaces)
})

afterAll(() => vi.unstubAllEnvs())
afterEach(cleanup)

function montar(ruta: string) {
  const router = createMemoryRouter(rutas, { initialEntries: [ruta] })
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={cliente}>
      <ProveedorDeSesion>
        <RouterProvider router={router} />
      </ProveedorDeSesion>
    </QueryClientProvider>,
  )
}

describe('rutas', () => {
  it('cada enlace del menú tiene su pantalla y queda marcado como actual', async () => {
    for (const { a, texto } of enlaces) {
      montar(a)
      // Las pantallas son lazy: el router pinta cuando baja el chunk.
      const menu = await screen.findByRole('navigation', { name: 'Principal' })
      expect(
        within(menu)
          .getByRole('link', { name: texto })
          .getAttribute('aria-current'),
      ).toBe('page')
      expect(await screen.findByRole('heading', { level: 1 })).toBeTruthy()
      cleanup()
    }
  })

  it('con datos simulados muestra el banner fijo', async () => {
    montar('/produccion/razas')
    expect(await screen.findByText(/datos de ejemplo/i)).toBeTruthy()
  })

  it('una ruta inexistente muestra la 404 dentro del layout', () => {
    montar('/no/existe')
    expect(screen.getByText(/esta página no existe/i)).toBeTruthy()
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeTruthy()
  })

  it('el menú del teléfono se cierra al navegar', async () => {
    montar('/')
    const boton = await screen.findByRole('button', { name: 'Abrir menú' })
    await userEvent.setup().click(boton)
    expect(boton.getAttribute('aria-expanded')).toBe('true')

    await userEvent.setup().click(screen.getByRole('link', { name: 'Razas' }))

    const reabrir = await screen.findByRole('button', { name: 'Abrir menú' })
    expect(reabrir.getAttribute('aria-expanded')).toBe('false')
  })

  it('si no baja el código de una pantalla se ve el error de la app', async () => {
    const raiz = rutas.find((r) => r.path === '/') as RouteObject
    const router = createMemoryRouter(
      [
        {
          ...raiz,
          children: [
            {
              index: true,
              lazy: () =>
                Promise.reject(new Error('Falló la carga del módulo')),
            },
          ],
        },
      ],
      { initialEntries: ['/'] },
    )
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    const alerta = await screen.findByRole('alert')
    expect(alerta.textContent).toContain('Falló la carga del módulo')
    expect(
      within(alerta).getByRole('button', { name: /reintentar/i }),
    ).toBeTruthy()
  })
})
