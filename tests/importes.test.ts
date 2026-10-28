import { describe, expect, it } from 'vitest'
import {
  formatearImporte,
  importeDeLinea,
  sumarImportes,
} from '../src/lib/importes'

describe('importes', () => {
  it('muestra miles con punto y siempre dos decimales', () => {
    expect(formatearImporte('1500.50')).toBe('1.500,50')
    expect(formatearImporte('1500.5')).toBe('1.500,50')
    expect(formatearImporte('1500')).toBe('1.500,00')
    expect(formatearImporte('0.05')).toBe('0,05')
    expect(formatearImporte('999')).toBe('999,00')
    expect(formatearImporte('123456789012.99')).toBe('123.456.789.012,99')
  })

  it('multiplica y suma exacto, sin los errores de un float', () => {
    // En float, 0.1 × 3 = 0.30000000000000004.
    expect(importeDeLinea('0.10', 3)).toBe('0.30')
    expect(importeDeLinea('38.50', 50)).toBe('1925.00')
    expect(sumarImportes(['0.10', '0.20'])).toBe('0.30')
    expect(sumarImportes([])).toBe('0.00')
  })
})
