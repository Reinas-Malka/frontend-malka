// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { useState } from 'react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EncabezadoDePagina } from '../src/components/pagina/EncabezadoDePagina'
import { Button } from '../src/components/ui/button'
import { Input } from '../src/components/ui/input'
import { Modal, ModalContenido } from '../src/components/ui/modal'
import { BarraDeProgreso } from '../src/components/ui/progreso'
import { Textarea } from '../src/components/ui/textarea'
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

// En el teléfono: con el teclado abierto el modal tiene que poder
// scrollear hasta Guardar, y un campo de menos de 16 px hace que iOS
// haga zoom al enfocarlo.
describe('formularios en el teléfono', () => {
  it('el modal base nunca pasa el alto de la pantalla y scrollea', () => {
    render(
      <Modal open>
        <ModalContenido titulo="Agregar cliente">contenido</ModalContenido>
      </Modal>,
    )
    const clases = screen.getByRole('dialog').className
    expect(clases).toContain('max-h-[calc(100dvh-2rem)]')
    expect(clases).toContain('overflow-y-auto')
  })

  it('los campos usan 16 px en el teléfono y 14 px desde sm', () => {
    render(
      <>
        <Input aria-label="Nombre" />
        <Textarea aria-label="Notas" />
      </>,
    )
    for (const campo of [
      screen.getByLabelText('Nombre'),
      screen.getByLabelText('Notas'),
    ]) {
      expect(campo.className).toContain('text-base')
      expect(campo.className).toContain('sm:text-sm')
    }
  })
})

// Accesibilidad (revisión 29/10).
describe('accesibilidad de la base', () => {
  it('el botón de peligro usa texto oscuro: 4,7:1 sobre el rojo', () => {
    render(<Button variante="peligro">Dar de baja</Button>)
    const clases = screen.getByRole('button', { name: 'Dar de baja' }).className
    expect(clases).toContain('text-carbon-900')
    expect(clases).not.toMatch(/\btext-texto\b/)
  })

  it('al cerrar el modal el foco vuelve al botón que lo abrió', async () => {
    const usuario = userEvent.setup()
    function ConModal() {
      const [abierto, setAbierto] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setAbierto(true)}>
            Abrir
          </button>
          <Modal open={abierto} onOpenChange={setAbierto}>
            {abierto ? (
              <ModalContenido titulo="Editar">contenido</ModalContenido>
            ) : null}
          </Modal>
        </>
      )
    }
    render(<ConModal />)

    await usuario.click(screen.getByRole('button', { name: 'Abrir' }))
    await usuario.keyboard('{Escape}')

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Abrir' }),
      ),
    )
  })

  it('cada pantalla pone su nombre en la pestaña del navegador', () => {
    render(<EncabezadoDePagina titulo="Pedidos" />)
    expect(document.title).toBe('Pedidos · Malka Suite')
  })
})
