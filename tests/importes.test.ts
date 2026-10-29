import { describe, expect, it } from 'vitest'
import { DATOS_SIMULADOS } from '../src/datos/simulados'
import { formatearImporte, totalesDelPedido } from '../src/lib/importes'
import type { Alicuota } from '../src/tipos/dominio'

const [PARA_RESERVAR, RESERVADO] = DATOS_SIMULADOS.pedidos

const linea = (cantidad: number, precio: string, alicuota: Alicuota) => ({
  cantidad,
  precio_unitario: precio,
  alicuota,
})

describe('importes', () => {
  it('muestra miles con punto y siempre dos decimales', () => {
    expect(formatearImporte('1500.50')).toBe('1.500,50')
    expect(formatearImporte('1500.5')).toBe('1.500,50')
    expect(formatearImporte('1500')).toBe('1.500,00')
    expect(formatearImporte('0.05')).toBe('0,05')
    expect(formatearImporte('999')).toBe('999,00')
    expect(formatearImporte('123456789012.99')).toBe('123.456.789.012,99')
  })
})

// La copia de calcular_totales_pedido que usan la simulación y la semilla.
describe('totales del pedido (calcular_totales_pedido del backend)', () => {
  it('neto por línea exacto, sin los errores de un float', () => {
    // En float, 0.1 × 3 = 0.30000000000000004.
    expect(totalesDelPedido([linea(3, '0.10', '0.21')], false).lineas).toEqual([
      '0.30',
    ])
  })

  it('el IVA va una vez por alícuota, sobre la suma de sus netos', () => {
    // 0.105: 100.00 → 10.50. 0.21: 0.30 + 0.20 = 0.50 → 0.105 → 0.11.
    // Por línea daría 0.06 + 0.04 = 0.10: no se suma el IVA de cada línea.
    expect(
      totalesDelPedido(
        [
          linea(1, '100.00', '0.105'),
          linea(3, '0.10', '0.21'),
          linea(2, '0.10', '0.21'),
        ],
        false,
      ),
    ).toEqual({
      lineas: ['100.00', '0.30', '0.20'],
      neto: '100.50',
      iva: '10.61',
      total: '111.11',
    })
  })

  it('redondea con ROUND_HALF_UP: 0,105 pasa a 0,11', () => {
    // 0.50 × 0.21 = 0.105: HALF_EVEN daría 0.10.
    expect(totalesDelPedido([linea(1, '0.50', '0.21')], false).iva).toBe('0.11')
  })

  it('en exportación no hay IVA, venga la alícuota que venga', () => {
    expect(totalesDelPedido([linea(50, '38.50', '0.21')], true)).toEqual({
      lineas: ['1925.00'],
      neto: '1925.00',
      iva: '0.00',
      total: '1925.00',
    })
  })

  it('la semilla trae los totales como el backend', () => {
    // 20 × 45.000 al 21 %, nacional.
    expect(PARA_RESERVAR).toMatchObject({
      neto: '900000.00',
      iva: '189000.00',
      total: '1089000.00',
    })
    expect(PARA_RESERVAR.items[0].neto).toBe('900000.00')
    // En dólares: exportación, sin IVA.
    expect(RESERVADO).toMatchObject({ iva: '0.00', total: '1925.00' })
  })
})
