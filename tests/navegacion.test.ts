import { describe, expect, it } from 'vitest'
import { NAVEGACION, primerDestino, puedeAbrir } from '../src/app/navegacion'
import type { Identidad, Rol } from '../src/auth/identidad'

const como = (...roles: Rol[]): Identidad => ({
  email: 'x@malka.test',
  roles,
  tenantId: 't',
})

describe('puedeAbrir', () => {
  it('sin sesión no abre nada', () => {
    expect(puedeAbrir(null, '/')).toBe(false)
  })

  it('sin rol asignado no abre nada, ni el inicio', () => {
    expect(puedeAbrir(como(), '/')).toBe(false)
  })

  it('admin abre todas las secciones del menú', () => {
    for (const { a } of NAVEGACION.flatMap((g) => g.enlaces)) {
      expect(puedeAbrir(como('admin'), a), a).toBe(true)
    }
  })

  it('cubre las rutas que no están en el menú por su prefijo', () => {
    // Madres salió del menú pero la ruta sigue; el detalle de un embarque
    // cuelga de /exportacion.
    expect(puedeAbrir(como('ventas'), '/produccion/madres')).toBe(false)
    expect(puedeAbrir(como('produccion'), '/exportacion/embarques/1')).toBe(
      false,
    )
    expect(puedeAbrir(como('ventas'), '/exportacion/embarques/1')).toBe(true)
  })

  it('gana el prefijo más largo', () => {
    // /ventas no es para producción, pero los ítems vendibles sí.
    expect(puedeAbrir(como('produccion'), '/ventas/clientes')).toBe(false)
    expect(puedeAbrir(como('produccion'), '/ventas/items-vendibles')).toBe(true)
  })

  it('un prefijo no se confunde con otra ruta que empieza igual', () => {
    // '/documentos' no tiene que capturar '/documentosx'.
    expect(puedeAbrir(como('lectura'), '/documentos/subir')).toBe(false)
    expect(puedeAbrir(como('lectura'), '/documentosx')).toBe(true)
  })

  it('con varios roles alcanza con que uno abra la sección', () => {
    expect(puedeAbrir(como('lectura', 'ventas'), '/documentos/subir')).toBe(
      true,
    )
  })
})

describe('primerDestino', () => {
  it('es la primera sección del menú que el rol abre', () => {
    expect(primerDestino(como('admin'))).toBe('/produccion/tandas')
    expect(primerDestino(como('ventas'))).toBe('/ventas/pedidos')
  })

  it('sin sesión o sin rol no hay destino', () => {
    expect(primerDestino(null)).toBeNull()
    expect(primerDestino(como())).toBeNull()
  })

  it('las páginas internas no están en el menú', () => {
    const rutas = NAVEGACION.flatMap((g) => g.enlaces).map((e) => e.a)
    expect(rutas).not.toContain('/guia-de-estilo')
    expect(rutas).not.toContain('/documentos/subir')
  })
})
