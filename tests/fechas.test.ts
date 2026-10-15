import { describe, expect, it } from 'vitest'
import { formatearFechaHora } from '../src/lib/fechas'

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
