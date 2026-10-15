import { describe, expect, it } from 'vitest'
import { esCuitValido, normalizarCuit } from '../src/lib/cuit'

// Los mismos CUIT válidos que usan los tests del backend.
describe('CUIT (mismo algoritmo que app/services/ventas/clientes.py)', () => {
  it.each(['20123456786', '30123456781', '20-12345678-6'])(
    'acepta %s',
    (cuit) => {
      expect(esCuitValido(cuit)).toBe(true)
    },
  )

  it.each(['20123456787', '2012345678', 'abc', '', '20-1234567-86x'])(
    'rechaza %s',
    (cuit) => {
      expect(esCuitValido(cuit)).toBe(false)
    },
  )

  it('normaliza sin guiones ni espacios', () => {
    expect(normalizarCuit(' 20-12345678-6 ')).toBe('20123456786')
  })
})
