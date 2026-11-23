// Prueba del 07/11: "270 celdas se introducen en 135 núcleos… se pierde la
// información de dónde la tanda es introducida y cuántas reinas salen".
import { describe, expect, it } from 'vitest'
import { formatearFecha } from '../src/lib/fechas'
import {
  celdasPorNucleo,
  filasDeResultado,
  resumenDeIntroduccion,
} from '../src/modulos/produccion/resultadoDeTanda'

describe('resumen de la introducción', () => {
  it('dice dónde, cuándo y cuántas por núcleo', () => {
    const resumen = resumenDeIntroduccion(
      {
        introducciones: [
          {
            parque_id: 'p1',
            parque_nombre: 'Parque X',
            fecha_introduccion: '2026-10-12',
            nucleos: 135,
            celdas: 270,
          },
          {
            parque_id: 'p2',
            parque_nombre: '',
            fecha_introduccion: '2026-10-13',
            nucleos: 4,
            celdas: 10,
          },
        ],
      },
      () => 'Parque Y',
    )
    expect(resumen.map((r) => r.texto)).toEqual([
      'Introducida el 12/10 en Parque X: 270 celdas en 135 núcleos (2 por núcleo)',
      'Introducida el 13/10 en Parque Y: 10 celdas en 4 núcleos (2 o 3 por núcleo)',
    ])
  })

  it('sin introducciones no hay resumen', () => {
    expect(resumenDeIntroduccion({ introducciones: [] }, () => '')).toEqual([])
    expect(celdasPorNucleo(1, 1)).toBe('(1 por núcleo)')
  })
})

describe('resultado de la tanda', () => {
  it('lista introducidas, cosechadas y a dónde fueron, y las descartadas', () => {
    const filas = filasDeResultado(
      {
        resultado: {
          introducidas: 270,
          en_parque: 0,
          cosechadas: 220,
          enjauladas: 200,
          enjauladas_sin_banco: 20,
          despachadas: 20,
          descartadas_con_nucleo: 50,
          descartadas_sin_nucleo: 0,
          fecha_cosecha: '2026-10-28',
        },
        bancos: [
          { banco_id: 'b1', identificador: 'B-01', reinas: 100 },
          { banco_id: 'b2', identificador: 'B-02', reinas: 80 },
        ],
      },
      formatearFecha,
    )
    expect(filas.map((f) => [f.nombre, f.valor])).toEqual([
      ['Introducidas en el parque', 270],
      ['Cosechadas el 28/10/2026 (enjauladas y despachadas)', 220],
      ['En el banco B-01', 100],
      ['En el banco B-02', 80],
      ['Enjauladas todavía sin banco', 20],
      ['Despachadas', 20],
      ['Descartadas en el parque (con núcleo)', 50],
      ['Descartadas antes de introducir (sin núcleo)', 0],
      ['Todavía en el parque', 0],
    ])
  })
})
