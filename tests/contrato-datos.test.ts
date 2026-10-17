import { describe, expect, it } from 'vitest'
import { elegirCliente, usaDatosSimulados } from '../src/datos/cliente'
import { DATOS_SIMULADOS } from '../src/datos/simulados'
import { CONDICIONES_IVA } from '../src/tipos/dominio'

describe('elección del cliente de datos', () => {
  it('con el flag en "true" usa los datos simulados', async () => {
    const tandas = await elegirCliente('true').listarTandas()
    expect(tandas.length).toBeGreaterThan(0)
  })

  it.each([undefined, 'false', '', 'TRUE'])(
    'con el flag %s no muestra datos de ejemplo sin el banner',
    async (flag) => {
      await expect(elegirCliente(flag).listarTandas()).rejects.toThrow(
        /cliente real/,
      )
    },
  )

  it('el banner y el cliente leen el flag igual', () => {
    expect(usaDatosSimulados('true')).toBe(true)
    expect(usaDatosSimulados('false')).toBe(false)
    expect(usaDatosSimulados(undefined)).toBe(false)
  })
})

describe('datos simulados con el contrato del backend', () => {
  it('no repiten ids entre ninguna entidad', () => {
    const ids = Object.values(DATOS_SIMULADOS).flatMap((lista) =>
      lista.map((e) => e.id),
    )
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('las condiciones de IVA son las de app/services/ventas/clientes.py', () => {
    expect(CONDICIONES_IVA).toContain('cliente_exterior')
    for (const c of DATOS_SIMULADOS.clientes)
      expect(CONDICIONES_IVA).toContain(c.condicion_iva)
  })

  it('el cliente de exportación factura con E por defecto', () => {
    const exportacion = DATOS_SIMULADOS.clientes.filter(
      (c) => c.tipo === 'exportacion',
    )
    expect(exportacion.length).toBeGreaterThan(0)
    for (const c of exportacion)
      expect(c.tipo_documento_por_defecto).toBe('factura_e')
  })

  it('el destino del embarque es un código ISO alfa-2', () => {
    for (const e of DATOS_SIMULADOS.embarques)
      expect(e.destino_pais).toMatch(/^[A-Z]{2}$/)
  })

  it('los importes y cantidades decimales viajan como texto, nunca float', () => {
    for (const m of DATOS_SIMULADOS.movimientos)
      expect(typeof m.cantidad).toBe('string')
    for (const m of DATOS_SIMULADOS.materiales)
      expect(typeof m.stock).toBe('string')
  })
})

describe('datos simulados con el dominio del 16/10 (bancos y celdas)', () => {
  const { celdas, bancos, tandas } = DATOS_SIMULADOS

  it('la fecha de pérdida va si y solo si la celda se perdió por esa causa', () => {
    for (const c of celdas) {
      expect(c.estado === 'descartada').toBe(c.fecha_descarte !== null)
      expect(c.estado === 'extraviada').toBe(c.fecha_extravio !== null)
    }
  })

  it('solo una reina enjaulada o despachada está en un banco, y el banco existe', () => {
    const ids = new Set(bancos.map((b) => b.id))
    const enBanco = celdas.filter((c) => c.banco_id !== null)
    expect(enBanco.length).toBeGreaterThan(0)
    for (const c of enBanco) {
      expect(['enjaulada', 'despachada']).toContain(c.estado)
      expect(ids.has(c.banco_id as string)).toBe(true)
    }
  })

  it('las reinas de cada banco salen de las celdas y no pasan la capacidad', () => {
    for (const b of bancos) {
      const contadas = celdas.filter(
        (c) => c.banco_id === b.id && c.estado === 'enjaulada',
      ).length
      expect(b.reinas_en_banco).toBe(contadas)
      expect(contadas).toBeLessThanOrEqual(b.capacidad_max)
    }
  })

  it('la continuadora de la tanda va completa o vacía, y sin madre obligatoria', () => {
    for (const t of tandas) {
      expect(t.fila_continuadora === null).toBe(
        t.posicion_continuadora === null,
      )
    }
    expect(tandas.some((t) => t.madre_id === null)).toBe(true)
  })
})
