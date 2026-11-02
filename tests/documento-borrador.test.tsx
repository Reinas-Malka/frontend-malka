// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DATOS_SIMULADOS } from '../src/datos/simulados'
import { formatearImporte } from '../src/lib/importes'
import { copiarTexto } from '../src/lib/portapapeles'
import {
  bloquesDelCuerpo,
  detalleDelPedido,
  type PedidoDelDocumento,
  textoParaCopiar,
  TITULO_DEL_DETALLE,
} from '../src/modulos/ventas/borradores'
import { DocumentoDelBorrador } from '../src/modulos/ventas/DocumentoDelBorrador'
import type { ContenidoDeBorrador } from '../src/tipos/dominio'

// Nacional, en borrador: 20 Reina fecundada Carniola a 45.000.
const [PEDIDO] = DATOS_SIMULADOS.pedidos
const nombres = (filas: readonly { id: string; nombre: string }[]) => {
  const porId = new Map(filas.map((f) => [f.id, f.nombre]))
  return (id: string) => porId.get(id) ?? '?'
}
const ORIGEN: PedidoDelDocumento = {
  pedido: PEDIDO,
  nombreDeItem: nombres(DATOS_SIMULADOS.itemsVendibles),
  nombreDeRaza: nombres(DATOS_SIMULADOS.razas),
}

const CONTENIDO: ContenidoDeBorrador = {
  encabezado: 'Nota de venta de reinas a Apícola Don Emilio',
  cuerpo: [
    'PARTES',
    'El criadero vendedor y Apícola Don Emilio, en carácter de comprador.',
    'OBJETO',
    'Se venden reinas vivas:\n- 20 reinas de raza Carniola.',
    'CIERRE',
    'Saludamos a usted muy atentamente.',
  ].join('\n\n'),
  notas: 'Mantener las reinas a la sombra.',
}

const pesos = (valor: string) => `ARS ${formatearImporte(valor)}`

describe('el cuerpo en bloques', () => {
  it('separa párrafos por línea en blanco y reconoce los títulos en mayúsculas', () => {
    expect(bloquesDelCuerpo(CONTENIDO.cuerpo)).toEqual([
      { tipo: 'titulo', texto: 'PARTES' },
      {
        tipo: 'parrafo',
        texto:
          'El criadero vendedor y Apícola Don Emilio, en carácter de comprador.',
      },
      { tipo: 'titulo', texto: 'OBJETO' },
      // Los saltos simples quedan dentro del párrafo.
      {
        tipo: 'parrafo',
        texto: 'Se venden reinas vivas:\n- 20 reinas de raza Carniola.',
      },
      { tipo: 'titulo', texto: 'CIERRE' },
      { tipo: 'parrafo', texto: 'Saludamos a usted muy atentamente.' },
    ])
  })

  it('acepta saltos de Windows y líneas en blanco con espacios', () => {
    expect(bloquesDelCuerpo('Uno\r\n  \r\nDos\n\n\n')).toEqual([
      { tipo: 'parrafo', texto: 'Uno' },
      { tipo: 'parrafo', texto: 'Dos' },
    ])
  })

  it('una línea sola que no está en mayúsculas es un párrafo', () => {
    expect(bloquesDelCuerpo('Partes del acuerdo')).toEqual([
      { tipo: 'parrafo', texto: 'Partes del acuerdo' },
    ])
    // Sin letras no es un título.
    expect(bloquesDelCuerpo('- 20 -')[0].tipo).toBe('parrafo')
  })
})

describe('el texto para copiar', () => {
  const detalle = detalleDelPedido(ORIGEN)

  it('lleva el texto de la IA y aparte el detalle con los importes del backend', () => {
    const texto = textoParaCopiar(CONTENIDO, detalle)
    const [linea] = PEDIDO.items

    expect(
      texto.startsWith(`${CONTENIDO.encabezado}\n\n${CONTENIDO.cuerpo}`),
    ).toBe(true)
    expect(texto).toContain(`${TITULO_DEL_DETALLE}\n`)
    expect(texto).toContain(
      `- 20 × Reina fecundada, raza Carniola: precio unitario ${pesos(linea.precio_unitario)}, neto ${pesos(linea.neto)}`,
    )
    expect(texto).toContain(`Neto: ${pesos(PEDIDO.neto)}`)
    expect(texto).toContain(`IVA: ${pesos(PEDIDO.iva)}`)
    expect(texto).toContain(`Total: ${pesos(PEDIDO.total)}`)
    expect(texto.endsWith('Notas\nMantener las reinas a la sombra.')).toBe(true)
  })

  it('sin notas no agrega la sección', () => {
    expect(textoParaCopiar({ ...CONTENIDO, notas: '' }, detalle)).not.toContain(
      'Notas',
    )
  })
})

describe('copiar al portapapeles', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('usa navigator.clipboard si está', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    expect(await copiarTexto('hola')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('hola')
  })

  it('sin clipboard (http, sin permiso) cae al textarea con execCommand', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('no')) },
    })
    let copiado = ''
    const execCommand = vi.fn(() => {
      copiado =
        (document.activeElement as HTMLTextAreaElement | null)?.value ?? ''
      return true
    })
    Object.defineProperty(document, 'execCommand', {
      value: execCommand,
      configurable: true,
    })

    expect(await copiarTexto('hola')).toBe(true)
    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(copiado).toBe('hola')
    // El textarea auxiliar no queda en la página.
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('si tampoco anda el método viejo, avisa que no se pudo', async () => {
    vi.stubGlobal('navigator', {})
    Object.defineProperty(document, 'execCommand', {
      value: () => {
        throw new Error('no soportado')
      },
      configurable: true,
    })

    expect(await copiarTexto('hola')).toBe(false)
  })
})

describe('el documento en pantalla', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  const mostrar = (contenido = CONTENIDO) =>
    render(<DocumentoDelBorrador contenido={contenido} origen={ORIGEN} />)

  it('muestra encabezado, secciones y párrafos del cuerpo y las notas', () => {
    mostrar()
    const texto = within(
      screen.getByRole('article', { name: 'Texto del borrador' }),
    )

    expect(
      texto.getByRole('heading', { level: 3, name: CONTENIDO.encabezado }),
    ).toBeTruthy()
    for (const seccion of ['PARTES', 'OBJETO', 'CIERRE'])
      expect(
        texto.getByRole('heading', { level: 4, name: seccion }),
      ).toBeTruthy()
    // El párrafo conserva su salto de línea.
    expect(texto.getByText(/Se venden reinas vivas:/).textContent).toBe(
      'Se venden reinas vivas:\n- 20 reinas de raza Carniola.',
    )
    expect(
      within(screen.getByRole('region', { name: 'Notas' })).getByText(
        'Mantener las reinas a la sombra.',
      ),
    ).toBeTruthy()
  })

  it('debajo, el detalle del pedido calculado por el sistema', () => {
    mostrar()
    const detalle = within(
      screen.getByRole('region', { name: TITULO_DEL_DETALLE }),
    )
    const [linea] = PEDIDO.items

    expect(detalle.getByText('Reina fecundada')).toBeTruthy()
    expect(detalle.getByText('Carniola')).toBeTruthy()
    expect(detalle.getByText('20')).toBeTruthy()
    expect(detalle.getByText('Precio unitario (ARS)')).toBeTruthy()
    expect(
      detalle.getByText(formatearImporte(linea.precio_unitario)),
    ).toBeTruthy()
    // Neto, IVA y total tal como los manda el backend.
    const importes = within(detalle.getByLabelText('Importes del pedido'))
    expect(importes.getByText(pesos(PEDIDO.neto))).toBeTruthy()
    expect(importes.getByText(pesos(PEDIDO.iva))).toBeTruthy()
    expect(importes.getByText(pesos(PEDIDO.total))).toBeTruthy()
    // A la vista: qué escribe la IA y qué calcula el sistema.
    expect(screen.getByText(/El texto lo redacta la IA/)).toBeTruthy()
    expect(
      screen.getByText(/las cantidades y los importes salen del pedido/i),
    ).toBeTruthy()
  })

  it('sin notas no muestra la sección', () => {
    mostrar({ ...CONTENIDO, notas: '' })

    expect(screen.queryByRole('region', { name: 'Notas' })).toBeNull()
  })

  it('Copiar texto copia el documento entero y lo confirma', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    mostrar()

    fireEvent.click(screen.getByRole('button', { name: 'Copiar texto' }))

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toMatch(/Texto copiado/),
    )
    expect(writeText).toHaveBeenCalledWith(
      textoParaCopiar(CONTENIDO, detalleDelPedido(ORIGEN)),
    )
  })

  it('si no se puede copiar lo dice', async () => {
    vi.stubGlobal('navigator', {})
    Object.defineProperty(document, 'execCommand', {
      value: () => false,
      configurable: true,
    })
    mostrar()

    fireEvent.click(screen.getByRole('button', { name: 'Copiar texto' }))

    expect(
      await screen.findByText(/No se pudo copiar: seleccioná el texto/),
    ).toBeTruthy()
  })
})
