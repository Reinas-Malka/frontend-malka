import { describe, expect, it } from 'vitest'
import { formatearFecha, formatearFechaHora } from '../src/lib/fechas'

describe('formatearFechaHora', () => {
  it('usa reloj de 24 h: es-AR por defecto mostraría 02:47 para las 14:47', () => {
    const texto = formatearFechaHora(
      '2026-10-15T17:47:17Z',
      'America/Argentina/Buenos_Aires',
    )
    expect(texto).toContain('14:47:17')
    expect(texto).toContain('15/10/2026')
  })
})

describe('formatearFecha', () => {
  it('muestra el date del backend como dd/mm/aaaa, sin correrse de día por el huso', () => {
    expect(formatearFecha('2026-10-17')).toBe('17/10/2026')
    expect(formatearFecha('2026-01-01')).toBe('01/01/2026')
  })

  it('si llega con hora, toma solo el día', () => {
    expect(formatearFecha('2026-10-17T23:30:00Z')).toBe('17/10/2026')
  })
})
