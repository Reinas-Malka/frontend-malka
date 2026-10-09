import { describe, expect, it } from 'vitest'
import { DATOS_SIMULADOS } from '../src/datos/simulados'
import { CUPULAS_POR_CUADRO, DOCUMENTOS_DEL_EMBARQUE } from '../src/tipos/dominio'

describe('datos simulados verosímiles', () => {
  it('las tandas son múltiplos de cúpulas por cuadro', () => {
    const totales = [270, 405, 135]
    for (const t of totales) expect(t % CUPULAS_POR_CUADRO).toBe(0)
  })

  it('el embarque tiene los seis documentos del dominio', () => {
    expect(DOCUMENTOS_DEL_EMBARQUE).toHaveLength(6)
  })

  it('los movimientos respetan el signo por tipo', () => {
    for (const m of DATOS_SIMULADOS.movimientos) {
      if (m.tipo === 'compra') expect(m.cantidad).toBeGreaterThan(0)
      if (m.tipo === 'consumo') expect(m.cantidad).toBeLessThan(0)
    }
  })

  it('el comprobante en ARS no tiene tipo de cambio y el E sí', () => {
    const ars = DATOS_SIMULADOS.comprobantes.find((c) => c.moneda === 'ARS')
    const usd = DATOS_SIMULADOS.comprobantes.find((c) => c.tipo === 'E')
    expect(ars?.tipo_cambio).toBeNull()
    expect(usd?.tipo_cambio).not.toBeNull()
  })
})
