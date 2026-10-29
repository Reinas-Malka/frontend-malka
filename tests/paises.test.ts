import { describe, expect, it } from 'vitest'
import { PAISES_EXTRANJEROS, PAIS_LOCAL, nombreDePais } from '../src/lib/paises'

describe('países', () => {
  it('muestra el nombre en español con el código', () => {
    expect(nombreDePais('NZ')).toBe('Nueva Zelanda (NZ)')
    expect(nombreDePais('DE')).toBe('Alemania (DE)')
  })

  it('un código desconocido o mal formado se muestra tal cual', () => {
    expect(nombreDePais('XX')).toBe('XX')
    expect(nombreDePais('abc')).toBe('abc')
  })

  it('la lista de exportación no incluye AR ni repite códigos', () => {
    const codigos = PAISES_EXTRANJEROS.map((p) => p.codigo)
    expect(codigos).not.toContain(PAIS_LOCAL)
    expect(new Set(codigos).size).toBe(codigos.length)
  })

  it('todos los códigos tienen el formato que exige la API y un nombre', () => {
    for (const p of PAISES_EXTRANJEROS) {
      expect(p.codigo).toMatch(/^[A-Z]{2}$/)
      expect(p.nombre).not.toBe(p.codigo)
    }
  })

  it('está ordenada por nombre', () => {
    const nombres = PAISES_EXTRANJEROS.map((p) => p.nombre)
    expect(nombres).toEqual(
      [...nombres].sort((a, b) => a.localeCompare(b, 'es')),
    )
  })
})
