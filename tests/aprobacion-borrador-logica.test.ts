import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  borradoresSimulados,
  type ContextoDePedido,
  hashDeContenido,
} from '../src/api/borradores'
import { ApiError } from '../src/api/client'
import { armarPdf, textoPdf } from '../src/lib/pdfSimple'
import {
  errorDeDecision,
  errorDeMotivo,
  etiquetaDeComprobante,
  NOMBRE_DE_ESTADO_BORRADOR,
  versionCorta,
} from '../src/modulos/ventas/borradores'
import type { Comprobante } from '../src/tipos/dominio'

const PEDIDO = 'p-1'
const OTRO_PEDIDO = 'p-2'
const CONTEXTO: ContextoDePedido = {
  cliente: 'Apícola del Sur',
  fechaEntrega: '2026-12-01',
  destino: null,
  incoterm: null,
  lineas: [{ cantidad: 5, item: 'Reina fecundada', raza: 'Carniola' }],
}
const comprobante = (id: string, cliente_id: string): Comprobante => ({
  id,
  tipo: 'A',
  cliente_id,
  punto_venta: 1,
  numero: 45,
  fecha_emision: '2026-11-13',
  moneda: 'ARS',
  importe: '1000.00',
  tipo_cambio: null,
  archivo_s3_key: 'documentos/t/f.pdf',
  cargado_por: 'x',
  creado_en: '2026-11-13T12:00:00Z',
})
const COMPROBANTES: Record<string, Comprobante> = {
  'c-propio': comprobante('c-propio', 'cliente-1'),
  'c-ajeno': comprobante('c-ajeno', 'cliente-2'),
}

function simulados() {
  return borradoresSimulados({
    demoraMs: 10,
    contexto: async (id) =>
      id === PEDIDO || id === OTRO_PEDIDO ? CONTEXTO : undefined,
    clienteDelPedido: async () => 'cliente-1',
    comprobante: async (id) => COMPROBANTES[id],
    usuario: 'admin@malka.test',
  })
}

async function codigoDe(promesa: Promise<unknown>) {
  try {
    await promesa
  } catch (error) {
    if (error instanceof ApiError) return `${error.status} ${error.codigo}`
    throw error
  }
  return 'sin error'
}

describe('aprobación simulada', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  async function listo(api = simulados(), pedido = PEDIDO) {
    const { id } = await api.pedir(pedido)
    await vi.advanceTimersByTimeAsync(10)
    return { api, borrador: await api.obtener(id) }
  }

  it('el borrador listo trae su hash_contenido y nada de la aprobación', async () => {
    const { borrador } = await listo()
    expect(borrador.estado).toBe('borrador')
    expect(borrador.hash_contenido).toMatch(/^[0-9a-f]{64}$/)
    expect(borrador.hash_contenido).toBe(hashDeContenido(borrador.contenido!))
    expect(borrador.pdf_disponible).toBe(false)
    expect(borrador.aprobado_por).toBeNull()
  })

  it('aprobar congela el borrador, deja la bitácora y habilita el PDF', async () => {
    const { api, borrador } = await listo()
    const aprobado = await api.aprobar(
      borrador.id,
      { hash_contenido: borrador.hash_contenido!, comprobante_id: 'c-propio' },
      'k-1',
    )
    expect(aprobado).toMatchObject({
      estado: 'aprobado',
      comprobante_id: 'c-propio',
      aprobado_por: 'admin@malka.test',
      pdf_disponible: true,
    })
    expect(aprobado.aprobado_en).toBeTruthy()
    const [revision] = await api.revisiones(borrador.id)
    expect(revision).toMatchObject({
      accion: 'aprobado',
      usuario: 'admin@malka.test',
      hash_contenido: borrador.hash_contenido,
      comprobante_id: 'c-propio',
    })
    const { url_descarga } = await api.pdf(borrador.id)
    expect(url_descarga).toMatch(/^(blob:|data:application\/pdf)/)
  })

  it('con la misma clave devuelve la misma aprobación; con otra es 409', async () => {
    const { api, borrador } = await listo()
    const datos = {
      hash_contenido: borrador.hash_contenido!,
      comprobante_id: null,
    }
    const primera = await api.aprobar(borrador.id, datos, 'k-1')
    expect(await api.aprobar(borrador.id, datos, 'k-1')).toBe(primera)
    expect(await codigoDe(api.aprobar(borrador.id, datos, 'k-2'))).toBe(
      '409 transicion_invalida',
    )
    expect(await api.revisiones(borrador.id)).toHaveLength(1)
  })

  it('un hash viejo es version_desactualizada y no aprueba', async () => {
    const { api, borrador } = await listo()
    expect(
      await codigoDe(
        api.aprobar(
          borrador.id,
          { hash_contenido: '0'.repeat(64), comprobante_id: null },
          'k',
        ),
      ),
    ).toBe('409 version_desactualizada')
    expect((await api.obtener(borrador.id)).estado).toBe('borrador')
  })

  it('el comprobante tiene que existir y ser del cliente del pedido', async () => {
    const { api, borrador } = await listo()
    const hash = borrador.hash_contenido!
    expect(
      await codigoDe(
        api.aprobar(
          borrador.id,
          { hash_contenido: hash, comprobante_id: 'c-no' },
          'a',
        ),
      ),
    ).toBe('422 comprobante_inexistente')
    expect(
      await codigoDe(
        api.aprobar(
          borrador.id,
          { hash_contenido: hash, comprobante_id: 'c-ajeno' },
          'b',
        ),
      ),
    ).toBe('422 comprobante_de_otro_cliente')
  })

  it('descartar pide un motivo de 3 a 500 y queda con su contenido', async () => {
    const { api, borrador } = await listo()
    expect(
      await codigoDe(api.descartar(borrador.id, { motivo: '  no ' }, 'a')),
    ).toBe('422 validacion')
    expect(
      await codigoDe(
        api.descartar(borrador.id, { motivo: 'x'.repeat(501) }, 'b'),
      ),
    ).toBe('422 validacion')
    const descartado = await api.descartar(
      borrador.id,
      { motivo: ' repetido ' },
      'c',
    )
    expect(descartado).toMatchObject({
      estado: 'descartado',
      motivo_descarte: 'repetido',
      pdf_disponible: false,
    })
    expect(descartado.contenido).toEqual(borrador.contenido)
    expect((await api.revisiones(borrador.id))[0]).toMatchObject({
      accion: 'descartado',
      motivo: 'repetido',
    })
    expect(await codigoDe(api.pdf(borrador.id))).toBe('409 pdf_no_disponible')
  })

  it('un descartado ya no se aprueba', async () => {
    const { api, borrador } = await listo()
    await api.descartar(borrador.id, { motivo: 'repetido' }, 'a')
    expect(
      await codigoDe(
        api.aprobar(
          borrador.id,
          { hash_contenido: borrador.hash_contenido!, comprobante_id: null },
          'b',
        ),
      ),
    ).toBe('409 transicion_invalida')
  })

  it('el PDF de uno en revisión no está disponible', async () => {
    const { api, borrador } = await listo()
    expect(await codigoDe(api.pdf(borrador.id))).toBe('409 pdf_no_disponible')
  })

  it('la corrección referencia un aprobado del mismo pedido', async () => {
    const { api, borrador } = await listo()
    expect(
      await codigoDe(api.pedir(PEDIDO, 'a', { corrigeA: borrador.id })),
    ).toBe('422 correccion_invalida')
    await api.aprobar(
      borrador.id,
      { hash_contenido: borrador.hash_contenido!, comprobante_id: null },
      'k',
    )
    expect(
      await codigoDe(api.pedir(OTRO_PEDIDO, 'b', { corrigeA: borrador.id })),
    ).toBe('422 correccion_invalida')
    const correccion = await api.pedir(PEDIDO, 'c', { corrigeA: borrador.id })
    expect(correccion.corrige_a).toBe(borrador.id)
    expect((await api.obtener(borrador.id)).estado).toBe('aprobado')
  })
})

describe('lo que dice la pantalla', () => {
  it('nombra los cinco estados', () => {
    expect(NOMBRE_DE_ESTADO_BORRADOR).toEqual({
      generando: 'Generando',
      borrador: 'Para revisar',
      rechazado: 'No se pudo generar',
      aprobado: 'Aprobado',
      descartado: 'Descartado',
    })
  })

  it('cada error de aprobar dice qué hacer, sin códigos', () => {
    const error = (status: number, codigo: string) =>
      errorDeDecision(new ApiError({ status, codigo, mensaje: codigo }))
    expect(error(409, 'version_desactualizada')).toEqual({
      tipo: 'recargar',
      mensaje: 'El borrador cambió, volvé a cargarlo.',
    })
    expect(error(409, 'transicion_invalida').tipo).toBe('recargar')
    expect(error(409, 'borrador_inmutable').tipo).toBe('recargar')
    expect(error(422, 'comprobante_inexistente').tipo).toBe('comprobante')
    expect(error(422, 'comprobante_de_otro_cliente').tipo).toBe('comprobante')
    expect(error(503, 'almacenamiento_no_disponible').tipo).toBe('reintentar')
    expect(error(500, 'error_interno').tipo).toBe('reintentar')
    for (const codigo of [
      'version_desactualizada',
      'transicion_invalida',
      'borrador_inmutable',
      'comprobante_inexistente',
      'comprobante_de_otro_cliente',
      'almacenamiento_no_disponible',
    ])
      expect(error(409, codigo).mensaje).not.toContain(codigo)
  })

  it('el motivo del descarte va de 3 a 500 caracteres sin contar los bordes', () => {
    expect(errorDeMotivo('   ')).toBe('Escribí por qué se descarta.')
    expect(errorDeMotivo(' ab ')).toBe('Escribí al menos 3 caracteres.')
    expect(errorDeMotivo('abc')).toBeNull()
    expect(errorDeMotivo('x'.repeat(500))).toBeNull()
    expect(errorDeMotivo('x'.repeat(501))).toBe('Como mucho 500 caracteres.')
  })

  it('el comprobante se muestra con tipo, punto de venta y número con ceros, y la fecha', () => {
    expect(etiquetaDeComprobante(comprobante('c', 'x'))).toBe(
      'Factura A 0001-00000045 · 13/11/2026',
    )
  })

  it('la versión es el principio del hash', () => {
    expect(versionCorta('abcdef0123456789')).toBe('abcdef012345')
    expect(versionCorta(null)).toBe('')
  })
})

describe('PDF simulado', () => {
  it('es un PDF con el xref apuntando a cada objeto', () => {
    const pdf = armarPdf(['Nota de venta', 'No es un comprobante fiscal.'])
    expect(pdf.startsWith('%PDF-1.4')).toBe(true)
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true)
    const inicioXref = Number(pdf.match(/startxref\n(\d+)/)![1])
    expect(pdf.slice(inicioXref, inicioXref + 4)).toBe('xref')
    const offsets = [...pdf.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) =>
      Number(m[1]),
    )
    offsets.forEach((offset, i) =>
      expect(pdf.slice(offset).startsWith(`${i + 1} 0 obj`)).toBe(true),
    )
    expect(pdf).toContain('(No es un comprobante fiscal.) Tj')
  })

  it('escapa paréntesis y lleva las tildes en octal', () => {
    expect(textoPdf('Ñandú (sí)')).toBe('\\321and\\372 \\(s\\355\\)')
    expect(textoPdf('emoji 🐝')).toBe('emoji ?')
  })
})
