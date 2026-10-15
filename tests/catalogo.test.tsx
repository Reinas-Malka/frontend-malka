// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { ApiError } from '../src/api/client'
import { recursoSimulado, type Recurso } from '../src/api/recurso'
import {
  PaginaCatalogo,
  type ConfigCatalogo,
} from '../src/components/catalogo/PaginaCatalogo'

type Raza = {
  id: string
  nombre: string
  descripcion: string | null
  activo: boolean
}
type RazaCrear = { nombre: string; descripcion?: string | null }

const semilla: Raza[] = [
  { id: 'r1', nombre: 'Carniola', descripcion: 'Dócil', activo: true },
  { id: 'r2', nombre: 'Italiana', descripcion: null, activo: true },
]

function config(
  recurso: Recurso<Raza, RazaCrear, Partial<RazaCrear>>,
): ConfigCatalogo<Raza, RazaCrear, Partial<RazaCrear>> {
  return {
    clave: 'razas',
    titulo: 'Razas',
    singular: 'raza',
    femenino: true,
    recurso,
    columnas: [
      { clave: 'nombre', titulo: 'Nombre' },
      { clave: 'descripcion', titulo: 'Descripción' },
    ],
    campos: [
      { nombre: 'nombre', etiqueta: 'Nombre', requerido: true, max: 100 },
      { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'texto-largo' },
    ],
    nombreDeFila: (r) => r.nombre,
    valoresDeFila: (r) => ({
      nombre: r.nombre,
      descripcion: r.descripcion ?? '',
    }),
    aCrear: (v) => ({ nombre: v.nombre, descripcion: v.descripcion || null }),
    aActualizar: (v) => ({
      nombre: v.nombre,
      descripcion: v.descripcion || null,
    }),
  }
}

function montar(
  recurso = recursoSimulado<Raza, RazaCrear, Partial<RazaCrear>>(
    semilla,
    (d, id) => ({
      id,
      nombre: d.nombre,
      descripcion: d.descripcion ?? null,
      activo: true,
    }),
  ),
) {
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={cliente}>
      <PaginaCatalogo config={config(recurso)} />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

afterEach(cleanup)

describe('PaginaCatalogo', () => {
  it('lista las filas del recurso', async () => {
    montar()

    expect(await screen.findByRole('cell', { name: 'Carniola' })).toBeTruthy()
    expect(screen.getByRole('cell', { name: 'Italiana' })).toBeTruthy()
  })

  it('filtra con la búsqueda', async () => {
    const usuario = montar()
    await screen.findByRole('cell', { name: 'Carniola' })

    await usuario.type(
      screen.getByRole('searchbox', { name: /buscar/i }),
      'ital',
    )

    expect(screen.queryByRole('cell', { name: 'Carniola' })).toBeNull()
    expect(screen.getByRole('cell', { name: 'Italiana' })).toBeTruthy()
  })

  it('no da de alta sin los campos obligatorios', async () => {
    const usuario = montar()
    await usuario.click(
      await screen.findByRole('button', { name: /agregar raza/i }),
    )

    await usuario.click(screen.getByRole('button', { name: /guardar/i }))

    expect(await screen.findByText(/nombre es obligatorio/i)).toBeTruthy()
  })

  it('da de alta y la fila aparece en el listado', async () => {
    const usuario = montar()
    await usuario.click(
      await screen.findByRole('button', { name: /agregar raza/i }),
    )

    await usuario.type(screen.getByLabelText('Nombre'), 'Buckfast')
    await usuario.click(screen.getByRole('button', { name: /guardar/i }))

    expect(await screen.findByRole('cell', { name: 'Buckfast' })).toBeTruthy()
  })

  it('pide confirmación antes de dar de baja', async () => {
    const usuario = montar()
    const fila = (
      await screen.findByRole('cell', { name: 'Carniola' })
    ).closest('tr') as HTMLElement

    await usuario.click(
      within(fila).getByRole('button', { name: /dar de baja carniola/i }),
    )
    const dialogo = await screen.findByRole('dialog')
    await usuario.click(
      within(dialogo).getByRole('button', { name: /dar de baja/i }),
    )

    await waitFor(() =>
      expect(within(fila).getByText(/inactiva/i)).toBeTruthy(),
    )
  })

  it('muestra el error del backend con su request_id y deja reintentar', async () => {
    const roto: Recurso<Raza, RazaCrear, Partial<RazaCrear>> = {
      ...recursoSimulado<Raza, RazaCrear, Partial<RazaCrear>>(
        [],
        () => semilla[0],
      ),
      listar: () =>
        Promise.reject(
          new ApiError({
            status: 500,
            codigo: 'error_interno',
            mensaje: 'Falló la base.',
            requestId: 'req-77',
          }),
        ),
    }
    montar(roto)

    const alerta = await screen.findByRole('alert')
    expect(alerta.textContent).toContain('error_interno')
    expect(alerta.textContent).toContain('req-77')
    expect(
      within(alerta).getByRole('button', { name: /reintentar/i }),
    ).toBeTruthy()
  })
})
