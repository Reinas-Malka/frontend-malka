import { describe, expect, it } from 'vitest'
import { kpisSimulados } from '../src/api/kpis'
import { tandasSimuladas } from '../src/api/tandas'
import { DATOS_SIMULADOS } from '../src/datos/simulados'
import {
  errorDePeriodo,
  esFechaValida,
  hoyEnArgentina,
  leerPeriodo,
} from '../src/lib/fechas'
import {
  anchoDeBarra,
  calcularKpis,
  formatearPorcentaje,
  porcentaje,
} from '../src/lib/kpis'
import { leerFiltrosDeKpis } from '../src/modulos/produccion/kpis'
import type { Celda } from '../src/tipos/dominio'

const { tandas, celdas, razas } = DATOS_SIMULADOS
// Cosechada (Carniola), en el parque (Buckfast) y recién traslarvada (Carniola).
const [COSECHADA, EN_PARQUE, RECIEN] = tandas
const [CARNIOLA, BUCKFAST] = razas

const celda = (cambios: Partial<Celda>): Celda => ({
  id: crypto.randomUUID(),
  tenant_id: 't',
  tanda_id: COSECHADA.id,
  nucleo_id: null,
  estado: 'trasladada',
  fecha_introduccion: null,
  fecha_nacimiento: null,
  fecha_fecundacion: null,
  fecha_enjaulado: null,
  banco_id: null,
  fecha_descarte: null,
  fecha_extravio: null,
  ...cambios,
})
const introducida = (cambios: Partial<Celda> = {}) =>
  celda({
    estado: 'introducida',
    nucleo_id: 'n',
    fecha_introduccion: '2026-09-01',
    ...cambios,
  })

describe('porcentaje', () => {
  it('va con un decimal y redondea la mitad para arriba, como el backend', () => {
    expect(porcentaje(95, 120)).toBe('79.2')
    expect(porcentaje(1, 16)).toBe('6.3') // 6,25
    expect(porcentaje(1, 8)).toBe('12.5')
    expect(porcentaje(2, 3)).toBe('66.7')
    expect(porcentaje(0, 10)).toBe('0.0')
    expect(porcentaje(10, 10)).toBe('100.0')
  })

  it('sin introducidas no hay base: null, nunca 0 ni una división por cero', () => {
    expect(porcentaje(0, 0)).toBeNull()
  })
})

describe('formato para mostrar', () => {
  it('usa coma decimal y un decimal', () => {
    expect(formatearPorcentaje('79.2')).toBe('79,2 %')
    expect(formatearPorcentaje('100.0')).toBe('100,0 %')
    expect(formatearPorcentaje('0')).toBe('0,0 %')
  })

  it('null no se muestra como número', () => {
    expect(formatearPorcentaje(null)).toBeNull()
  })

  it('la barra queda entre 0 y 100', () => {
    expect(anchoDeBarra('88.0')).toBe(88)
    expect(anchoDeBarra(null)).toBe(0)
    expect(anchoDeBarra('120')).toBe(100)
  })
})

describe('KPIs calculados desde las celdas simuladas', () => {
  it('por tanda: la más nueva primero, con conteos y los dos %', () => {
    const filas = calcularKpis(tandas, celdas, razas)
    expect(filas.map((f) => f.tanda_id)).toEqual([
      RECIEN.id,
      EN_PARQUE.id,
      COSECHADA.id,
    ])
    const cosechada = filas.find((f) => f.tanda_id === COSECHADA.id)
    // 250 al parque: 220 enjauladas y 30 descartadas en la cosecha. Las 20
    // descartadas antes de introducir no cuentan.
    expect(cosechada).toEqual({
      tanda_id: COSECHADA.id,
      fecha_traslarve: COSECHADA.fecha_traslarve,
      raza_id: CARNIOLA.id,
      raza: 'Carniola',
      tandas: 1,
      introducidas: 250,
      cosechadas: 220,
      perdidas: 30,
      en_parque: 0,
      porcentaje_cosecha: '88.0',
      porcentaje_perdida: '12.0',
    })
    const enParque = filas.find((f) => f.tanda_id === EN_PARQUE.id)
    expect(enParque).toMatchObject({
      introducidas: 400,
      en_parque: 400,
      porcentaje_cosecha: '0.0',
      porcentaje_perdida: '0.0',
    })
  })

  it('una tanda sin introducidas sale igual, con los % en null', () => {
    const recien = calcularKpis(tandas, celdas, razas).find(
      (f) => f.tanda_id === RECIEN.id,
    )
    expect(recien).toMatchObject({
      introducidas: 0,
      porcentaje_cosecha: null,
      porcentaje_perdida: null,
    })
  })

  it('por raza suma las celdas de sus tandas y después divide', () => {
    const filas = calcularKpis(tandas, celdas, razas, { agrupar: 'raza' })
    // Por nombre; Italiana no tiene tandas y no sale.
    expect(filas.map((f) => f.raza)).toEqual(['Buckfast', 'Carniola'])
    expect(filas[1]).toEqual({
      tanda_id: null,
      fecha_traslarve: null,
      raza_id: CARNIOLA.id,
      raza: 'Carniola',
      tandas: 2,
      introducidas: 250,
      cosechadas: 220,
      perdidas: 30,
      en_parque: 0,
      porcentaje_cosecha: '88.0',
      porcentaje_perdida: '12.0',
    })
    expect(filas[0]).toMatchObject({ raza_id: BUCKFAST.id, tandas: 1 })
  })

  it('no es el promedio de los % de cada tanda', () => {
    const otra = {
      id: 'otra',
      raza_id: CARNIOLA.id,
      fecha_traslarve: '2026-09-02',
    }
    const propias = [
      // 1 de 1 (100 %) y 1 de 3 (33,3 %): por raza es 2 de 4, no 66,7 %.
      introducida({ estado: 'enjaulada' }),
      introducida({ tanda_id: 'otra', estado: 'enjaulada' }),
      introducida({ tanda_id: 'otra', estado: 'descartada' }),
      introducida({ tanda_id: 'otra', estado: 'descartada' }),
    ]
    const [fila] = calcularKpis([COSECHADA, otra], propias, razas, {
      agrupar: 'raza',
    })
    expect(fila.porcentaje_cosecha).toBe('50.0')
    expect(fila.porcentaje_perdida).toBe('50.0')
  })

  it('una despachada cuenta como cosechada; una descartada sin núcleo no es pérdida', () => {
    const propias = [
      introducida({ estado: 'despachada' }),
      introducida({ estado: 'enjaulada' }),
      introducida({ estado: 'descartada' }),
      introducida(),
      // Nunca entró al parque: no suma en ningún lado.
      celda({ estado: 'descartada', fecha_descarte: '2026-08-30' }),
    ]
    const [fila] = calcularKpis([COSECHADA], propias, razas)
    expect(fila).toMatchObject({
      introducidas: 4,
      cosechadas: 2,
      perdidas: 1,
      en_parque: 1,
      porcentaje_cosecha: '50.0',
      porcentaje_perdida: '25.0',
    })
  })

  it('filtra por fecha de traslarve con los dos días incluidos', () => {
    const solo = (desde?: string, hasta?: string) =>
      calcularKpis(tandas, celdas, razas, { desde, hasta }).map(
        (f) => f.tanda_id,
      )
    expect(solo(EN_PARQUE.fecha_traslarve, EN_PARQUE.fecha_traslarve)).toEqual([
      EN_PARQUE.id,
    ])
    expect(solo(EN_PARQUE.fecha_traslarve)).toEqual([RECIEN.id, EN_PARQUE.id])
    expect(solo(undefined, EN_PARQUE.fecha_traslarve)).toEqual([
      EN_PARQUE.id,
      COSECHADA.id,
    ])
    expect(solo('2020-01-01', '2020-12-31')).toEqual([])
  })
})

describe('API simulada de KPIs', () => {
  it('un período que termina antes de empezar es un 422 periodo_invalido', async () => {
    const api = kpisSimulados(tandasSimuladas())
    await expect(
      api.produccion({ desde: '2026-09-10', hasta: '2026-09-01' }),
    ).rejects.toMatchObject({ status: 422, codigo: 'periodo_invalido' })
  })

  it('cuenta desde las mismas celdas que las tandas: cosechar mueve los %', async () => {
    const simulacion = tandasSimuladas()
    const api = kpisSimulados(simulacion)
    const antes = (await api.produccion()).find(
      (f) => f.tanda_id === EN_PARQUE.id,
    )
    expect(antes?.porcentaje_cosecha).toBe('0.0')

    // 300 de las 400 del parque cosechadas; las 100 restantes, perdidas.
    await simulacion.operar(EN_PARQUE.id, {
      accion: 'cosechar',
      cantidad: 300,
      fecha: hoyEnArgentina(),
    })

    const despues = (await api.produccion()).find(
      (f) => f.tanda_id === EN_PARQUE.id,
    )
    expect(despues).toMatchObject({
      cosechadas: 300,
      perdidas: 100,
      en_parque: 0,
      porcentaje_cosecha: '75.0',
      porcentaje_perdida: '25.0',
    })
  })
})

describe('período y filtros de la URL', () => {
  it('valida que el período no termine antes de empezar', () => {
    expect(errorDePeriodo({ desde: '2026-09-10', hasta: '2026-09-01' })).toBe(
      'La fecha final no puede ser anterior a la inicial.',
    )
    expect(
      errorDePeriodo({ desde: '2026-09-01', hasta: '2026-09-01' }),
    ).toBeNull()
    expect(errorDePeriodo({ desde: '2026-09-01' })).toBeNull()
    expect(errorDePeriodo({})).toBeNull()
  })

  it('solo acepta fechas AAAA-MM-DD que existen', () => {
    expect(esFechaValida('2026-02-28')).toBe(true)
    expect(esFechaValida('2026-02-30')).toBe(false)
    expect(esFechaValida('01/09/2026')).toBe(false)
    expect(esFechaValida('')).toBe(false)
    expect(esFechaValida(null)).toBe(false)
  })

  it('lo que no se entiende de la URL se ignora', () => {
    expect(
      leerPeriodo(new URLSearchParams('desde=ayer&hasta=2026-09-01')),
    ).toEqual({ desde: undefined, hasta: '2026-09-01' })
    expect(leerFiltrosDeKpis(new URLSearchParams('agrupar=madre'))).toEqual({
      agrupar: 'tanda',
      desde: undefined,
      hasta: undefined,
    })
    expect(
      leerFiltrosDeKpis(new URLSearchParams('agrupar=raza&desde=2026-09-01'))
        .agrupar,
    ).toBe('raza')
  })
})
