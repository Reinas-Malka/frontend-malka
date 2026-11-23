import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  borradoresSimulados,
  contenidoDeEjemplo,
  type ContextoDePedido,
} from '../src/api/borradores'
import { ApiError, leerRetryAfter } from '../src/api/client'
import { segundosHastaMedianocheEnArgentina } from '../src/lib/fechas'
import {
  formatearEspera,
  segundosDeEspera,
} from '../src/modulos/ventas/borradores'

const PEDIDO = 'p-1'
const CONTEXTO: ContextoDePedido = {
  cliente: 'Bee Kingdom NZ Ltd',
  fechaEntrega: '2026-11-20',
  destino: 'Nueva Zelanda (NZ)',
  incoterm: 'CPT',
  lineas: [{ cantidad: 50, item: 'Reina fecundada', raza: 'Carniola' }],
}
const contexto = async (id: string) => (id === PEDIDO ? CONTEXTO : undefined)

const errorDe = (promesa: Promise<unknown>) =>
  promesa.then(
    () => null,
    (e: unknown) => e,
  )

describe('borradores simulados', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-01T15:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('el pedido deja el borrador en generando y a los 2 s queda para revisar', async () => {
    const api = borradoresSimulados({ contexto })

    const nuevo = await api.pedir(PEDIDO)

    expect(nuevo).toMatchObject({ estado: 'generando', contenido: null })
    await vi.advanceTimersByTimeAsync(1999)
    expect((await api.obtener(nuevo.id)).estado).toBe('generando')
    await vi.advanceTimersByTimeAsync(1)
    const listo = await api.obtener(nuevo.id)
    expect(listo.estado).toBe('borrador')
    expect(listo.contenido).toEqual(contenidoDeEjemplo(CONTEXTO))
  })

  it('lista los del pedido del más nuevo al más viejo', async () => {
    const api = borradoresSimulados({ contexto })
    const primero = await api.pedir(PEDIDO)
    vi.advanceTimersByTime(1000)
    const segundo = await api.pedir(PEDIDO)

    const { items, siguiente } = await api.listar(PEDIDO)

    expect(items.map((b) => b.id)).toEqual([segundo.id, primero.id])
    expect(siguiente).toBeNull()
    expect((await api.listar('otro')).items).toEqual([])
  })

  it('con la misma Idempotency-Key devuelve el mismo borrador', async () => {
    const api = borradoresSimulados({ contexto })

    const uno = await api.pedir(PEDIDO, 'clave')
    const otro = await api.pedir(PEDIDO, 'clave')

    expect(otro.id).toBe(uno.id)
    expect((await api.listar(PEDIDO)).items).toHaveLength(1)
  })

  it('un pedido que no existe es 422 pedido_inexistente', async () => {
    const api = borradoresSimulados({ contexto })

    expect(await errorDe(api.pedir('no-existe'))).toMatchObject({
      status: 422,
      codigo: 'pedido_inexistente',
    })
  })

  it('pasado el tope por minuto es 429 con Retry-After de 60 s', async () => {
    const api = borradoresSimulados({ contexto, porMinuto: 2 })
    await api.pedir(PEDIDO)
    await api.pedir(PEDIDO)

    expect(await errorDe(api.pedir(PEDIDO))).toMatchObject({
      status: 429,
      codigo: 'limite_ia_por_minuto',
      reintentarEn: 60,
      detalles: { tope: 2 },
    })
    // El 429 no gasta la llamada: pasado el minuto se puede de nuevo.
    vi.advanceTimersByTime(60_000)
    expect((await api.pedir(PEDIDO)).estado).toBe('generando')
  })

  it('pasado el tope diario es 429 hasta la medianoche de Argentina', async () => {
    const api = borradoresSimulados({ contexto, porDia: 1 })
    await api.pedir(PEDIDO)

    // 15:00 UTC son las 12:00 en Argentina: faltan 12 horas.
    expect(await errorDe(api.pedir(PEDIDO))).toMatchObject({
      status: 429,
      codigo: 'limite_ia_diario',
      reintentarEn: 12 * 3600,
    })
  })

  it('el worker puede rechazar con un motivo', async () => {
    const api = borradoresSimulados({
      contexto,
      rechazarCon: 'error_modelo',
    })
    const nuevo = await api.pedir(PEDIDO)

    await vi.advanceTimersByTimeAsync(2000)

    expect(await api.obtener(nuevo.id)).toMatchObject({
      estado: 'rechazado',
      motivo_rechazo: 'error_modelo',
      contenido: null,
    })
  })

  it('un borrador que no existe es 404', async () => {
    const api = borradoresSimulados({ contexto })

    expect(await errorDe(api.obtener('nada'))).toMatchObject({
      status: 404,
      codigo: 'borrador_no_encontrado',
    })
  })
})

describe('contenido de ejemplo', () => {
  it('es una proforma con secciones y datos del pedido, sin montos ni datos fiscales', () => {
    const { encabezado, cuerpo, notas } = contenidoDeEjemplo(CONTEXTO)
    const todo = `${encabezado}\n${cuerpo}\n${notas}`

    expect(encabezado).toBe(
      'Proforma de exportación de reinas a Bee Kingdom NZ Ltd',
    )
    for (const seccion of [
      'PARTES',
      'OBJETO',
      'CONDICIONES DE ENTREGA',
      'CIERRE',
    ])
      expect(cuerpo.split('\n\n')).toContain(seccion)
    expect(cuerpo).toContain(
      '50 reinas de raza Carniola (producto Reina fecundada)',
    )
    expect(cuerpo).toContain(
      '20/11/2026, con destino a Nueva Zelanda (NZ), en condición CPT',
    )
    expect(notas).toContain('Nueva Zelanda (NZ)')
    // Lo que el filtro del backend rechazaría (borrador.py).
    expect(todo).not.toMatch(
      /\$|\b(USD|EUR|ARS|IVA|CAE)\b|%|n[uú]mero de comprobante/i,
    )
    // El criadero vende solo reinas.
    expect(todo).not.toMatch(/n[uú]cleo/i)
  })

  it('una venta nacional es una nota de venta y no lleva notas de aduana', () => {
    const nacional = contenidoDeEjemplo({
      ...CONTEXTO,
      destino: null,
      incoterm: null,
    })

    expect(nacional.encabezado).toBe(
      'Nota de venta de reinas a Bee Kingdom NZ Ltd',
    )
    expect(nacional.cuerpo).toContain('dentro de Argentina')
    expect(nacional.notas).not.toMatch(/aduan/i)
    expect(nacional.notas).toContain('a la sombra')
  })
})

describe('espera después de un 429', () => {
  const limite = (codigo: string, reintentarEn: number | null = null) =>
    new ApiError({ status: 429, codigo, mensaje: 'Límite', reintentarEn })

  it('usa el Retry-After si llegó', () => {
    expect(segundosDeEspera(limite('limite_ia_por_minuto', 42))).toBe(42)
  })

  it('sin Retry-After: un minuto, o hasta la medianoche si es el diario', () => {
    const mediodia = new Date('2026-11-01T15:00:00Z')

    expect(segundosDeEspera(limite('limite_ia_por_minuto'), mediodia)).toBe(60)
    expect(segundosDeEspera(limite('limite_ia_diario'), mediodia)).toBe(
      12 * 3600,
    )
  })

  it('otro error no es una espera', () => {
    expect(
      segundosDeEspera(
        new ApiError({ status: 422, codigo: 'x', mensaje: 'x' }),
      ),
    ).toBeNull()
    expect(segundosDeEspera(new Error('x'))).toBeNull()
  })

  it('se dice en segundos, minutos u horas', () => {
    expect(formatearEspera(1)).toBe('1 segundo')
    expect(formatearEspera(60)).toBe('60 segundos')
    expect(formatearEspera(150)).toBe('3 minutos')
    expect(formatearEspera(3600)).toBe('1 h')
    expect(formatearEspera(3 * 3600 + 20 * 60)).toBe('3 h 20 min')
  })

  it('la medianoche de Argentina es a las 03:00 UTC', () => {
    expect(
      segundosHastaMedianocheEnArgentina(new Date('2026-11-02T02:59:00Z')),
    ).toBe(60)
    expect(
      segundosHastaMedianocheEnArgentina(new Date('2026-11-02T03:00:00Z')),
    ).toBe(86_400)
  })
})

describe('Retry-After', () => {
  it('lee segundos o una fecha HTTP', () => {
    const ahora = Date.parse('2026-11-01T15:00:00Z')

    expect(leerRetryAfter('30')).toBe(30)
    expect(leerRetryAfter('Sun, 01 Nov 2026 15:01:00 GMT', ahora)).toBe(60)
    expect(leerRetryAfter(null)).toBeNull()
    expect(leerRetryAfter('pronto')).toBeNull()
  })
})
