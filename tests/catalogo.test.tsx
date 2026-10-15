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

type RazaActualizar = Partial<RazaCrear> & { activo?: boolean }
type RecursoRazas = Recurso<Raza, RazaCrear, RazaActualizar>

const construir = (d: RazaCrear, id: string): Raza => ({
  id,
  nombre: d.nombre,
  descripcion: d.descripcion ?? null,
  activo: true,
})

function config(
  recurso: RecursoRazas,
): ConfigCatalogo<Raza, RazaCrear, RazaActualizar> {
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
    reactivacion: { activo: true },
  }
}

function montar(
  recurso: RecursoRazas = recursoSimulado<Raza, RazaCrear, RazaActualizar>(
    semilla,
    construir,
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
    const roto: RecursoRazas = {
      ...recursoSimulado<Raza, RazaCrear, RazaActualizar>([], () => semilla[0]),
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

const muchas = (n: number): Raza[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `m${i}`,
    nombre: `Raza ${i}`,
    descripcion: null,
    activo: true,
  }))

describe('PaginaCatalogo — revisión del PR #30', () => {
  it('busca en todas las filas aunque el backend pagine de a 100', async () => {
    const usuario = montar(recursoSimulado(muchas(130), construir))
    await screen.findByRole('cell', { name: 'Raza 0' })

    await usuario.type(
      screen.getByRole('searchbox', { name: /buscar/i }),
      'Raza 129',
    )

    expect(await screen.findByRole('cell', { name: 'Raza 129' })).toBeTruthy()
  })

  it('al buscar desde una página alta no queda una tabla vacía', async () => {
    const usuario = montar(recursoSimulado(muchas(20), construir))
    await screen.findByRole('cell', { name: 'Raza 0' })
    await usuario.click(screen.getByRole('button', { name: /siguiente/i }))
    await usuario.click(screen.getByRole('button', { name: /siguiente/i }))

    await usuario.type(
      screen.getByRole('searchbox', { name: /buscar/i }),
      'Raza 1',
    )

    expect(screen.getAllByRole('row').length).toBeGreaterThan(1)
  })

  it('edita una fila', async () => {
    const usuario = montar()
    await usuario.click(
      await screen.findByRole('button', { name: 'Editar Carniola' }),
    )

    const nombre = screen.getByLabelText('Nombre')
    await usuario.clear(nombre)
    await usuario.type(nombre, 'Carniola F1')
    await usuario.click(screen.getByRole('button', { name: /guardar/i }))

    expect(
      await screen.findByRole('cell', { name: 'Carniola F1' }),
    ).toBeTruthy()
  })

  it('reactiva una fila dada de baja', async () => {
    const usuario = montar(
      recursoSimulado([{ ...semilla[0], activo: false }], construir),
    )

    await usuario.click(
      await screen.findByRole('button', { name: 'Reactivar Carniola' }),
    )

    expect(await screen.findByText('Activa')).toBeTruthy()
  })

  it('si la baja falla el error no aparece en la baja de otra fila', async () => {
    const base = recursoSimulado<Raza, RazaCrear, RazaActualizar>(
      semilla,
      construir,
    )
    const recurso: RecursoRazas = {
      ...base,
      desactivar: () =>
        Promise.reject(
          new ApiError({
            status: 409,
            codigo: 'en_uso',
            mensaje: 'Tiene tandas activas.',
          }),
        ),
    }
    const usuario = montar(recurso)

    await usuario.click(
      await screen.findByRole('button', { name: 'Dar de baja Carniola' }),
    )
    let dialogo = await screen.findByRole('dialog')
    await usuario.click(
      within(dialogo).getByRole('button', { name: /^dar de baja$/i }),
    )
    expect(
      await within(dialogo).findByText(/tiene tandas activas/i),
    ).toBeTruthy()
    await usuario.click(
      within(dialogo).getByRole('button', { name: /cancelar/i }),
    )

    await usuario.click(
      screen.getByRole('button', { name: 'Dar de baja Italiana' }),
    )
    dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).queryByText(/tiene tandas activas/i)).toBeNull()
  })

  it('un 422 del backend marca el campo que corresponde', async () => {
    const base = recursoSimulado<Raza, RazaCrear, RazaActualizar>(
      semilla,
      construir,
    )
    const recurso: RecursoRazas = {
      ...base,
      crear: () =>
        Promise.reject(
          new ApiError({
            status: 422,
            codigo: 'validacion',
            mensaje: 'Los datos enviados no son validos.',
            detalles: {
              campos: [
                {
                  campo: 'body.nombre',
                  mensaje: 'Ya existe una raza con ese nombre.',
                },
              ],
            },
          }),
        ),
    }
    const usuario = montar(recurso)
    await usuario.click(
      await screen.findByRole('button', { name: /agregar raza/i }),
    )

    await usuario.type(screen.getByLabelText('Nombre'), 'Carniola')
    await usuario.click(screen.getByRole('button', { name: /guardar/i }))

    expect(
      await screen.findByText('Ya existe una raza con ese nombre.'),
    ).toBeTruthy()
  })

  it('si falla el refresco después de guardar, la tabla no desaparece', async () => {
    const base = recursoSimulado<Raza, RazaCrear, RazaActualizar>(
      semilla,
      construir,
    )
    let llamadas = 0
    const recurso: RecursoRazas = {
      ...base,
      listar: (p) => {
        llamadas += 1
        return llamadas === 1
          ? base.listar(p)
          : Promise.reject(
              new ApiError({
                status: 503,
                codigo: 'http_503',
                mensaje: 'No disponible.',
              }),
            )
      },
    }
    const usuario = montar(recurso)
    await usuario.click(
      await screen.findByRole('button', { name: /agregar raza/i }),
    )
    await usuario.type(screen.getByLabelText('Nombre'), 'Buckfast')
    await usuario.click(screen.getByRole('button', { name: /guardar/i }))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('cell', { name: 'Carniola' })).toBeTruthy()
  })
})
