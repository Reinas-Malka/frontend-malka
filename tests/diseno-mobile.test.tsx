// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BarraDeProgreso } from '../src/components/ui/progreso'
import { SelectorDeArchivo } from '../src/components/ui/selector-de-archivo'
import { DataTable, type Columna } from '../src/components/ui/table'

type Raza = { id: string; nombre: string; descripcion: string }

const filas: Raza[] = [
  { id: 'r1', nombre: 'Carniola', descripcion: 'Dócil' },
  { id: 'r2', nombre: 'Italiana', descripcion: 'Productiva' },
]

const columnas: Columna<Raza>[] = [
  { clave: 'nombre', titulo: 'Nombre' },
  { clave: 'descripcion', titulo: 'Descripción' },
  {
    clave: 'id',
    titulo: 'Acciones',
    enTarjeta: 'acciones',
    render: (r) => <button type="button">Editar {r.nombre}</button>,
  },
]

function pantalla(ancha: boolean) {
  vi.stubGlobal('matchMedia', (consulta: string) => ({
    matches: ancha,
    media: consulta,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('tablas en el teléfono (diseno-frontend: mobile first)', () => {
  it('en el teléfono cada fila es una tarjeta con sus acciones a la vista', () => {
    pantalla(false)
    render(<DataTable columnas={columnas} filas={filas} vacio={null} />)

    expect(screen.queryByRole('table')).toBeNull()
    const tarjetas = screen.getAllByRole('listitem')
    expect(tarjetas).toHaveLength(2)
    const carniola = tarjetas[0]
    expect(within(carniola).getByText('Carniola')).toBeTruthy()
    expect(within(carniola).getByText('Descripción')).toBeTruthy()
    expect(
      within(carniola).getByRole('button', { name: 'Editar Carniola' }),
    ).toBeTruthy()
  })

  it('en tablet o escritorio sigue siendo una tabla', () => {
    pantalla(true)
    render(<DataTable columnas={columnas} filas={filas} vacio={null} />)

    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.getByRole('cell', { name: 'Carniola' })).toBeTruthy()
  })
})

describe('componentes nuevos de ui/', () => {
  it('la barra de progreso se anuncia con su valor', () => {
    render(<BarraDeProgreso valor={42.4} etiqueta="Subiendo" />)

    const barra = screen.getByRole('progressbar', { name: 'Subiendo' })
    expect(barra.getAttribute('aria-valuenow')).toBe('42')
  })

  it('el selector de archivo se usa con su label y muestra lo elegido', async () => {
    const usuario = userEvent.setup()
    const alElegir = vi.fn()
    const { rerender } = render(
      <>
        <label htmlFor="archivo">Archivo</label>
        <SelectorDeArchivo
          id="archivo"
          archivo={null}
          alElegir={alElegir}
          aceptar=".pdf"
          ayuda="PDF de hasta 10 MB."
        />
      </>,
    )
    const pdf = new File(['%PDF'], 'factura.pdf', { type: 'application/pdf' })

    await usuario.upload(screen.getByLabelText('Archivo'), pdf)
    expect(alElegir).toHaveBeenCalledWith(pdf)

    rerender(
      <SelectorDeArchivo
        id="archivo"
        archivo={pdf}
        alElegir={alElegir}
        aceptar=".pdf"
        ayuda="PDF de hasta 10 MB."
      />,
    )
    await usuario.click(
      screen.getByRole('button', { name: 'Quitar factura.pdf' }),
    )
    expect(alElegir).toHaveBeenLastCalledWith(null)
  })
})
