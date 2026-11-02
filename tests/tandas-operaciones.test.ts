import { describe, expect, it } from 'vitest'
import { ApiError } from '../src/api/client'
import { LIMITE_TANDAS, catalogosDe, tandasSimuladas } from '../src/api/tandas'
import { DATOS_SIMULADOS } from '../src/datos/simulados'
import { repartir } from '../src/lib/tandas'
import {
  accionesPosibles,
  errorDeOperacion,
  resumenDe,
  resumenDeOperacion,
  validarOperacion,
} from '../src/modulos/produccion/operaciones'
import type {
  Banco,
  OperacionRealizada,
  Parque,
  TandaDetalle,
} from '../src/tipos/dominio'

const { tandas, parques, bancos, nucleos, razas, materiales } = DATOS_SIMULADOS
// La semilla: cosechada (220 en bancos), en el parque (400 en Monte Chico)
// y recién traslarvada (134 sin introducir).
const [COSECHADA, EN_PARQUE, RECIEN] = tandas
const [LA_LOMA, MONTE_CHICO] = parques
const [B01] = bancos
const HOY = '2026-11-01'

const conflicto = (codigo: string, detalles?: object) => ({
  status: 409,
  codigo,
  ...(detalles ? { detalles } : {}),
})

/** Un parque o un banco más en los catálogos de la simulación. */
function conCatalogos({ parque, banco }: { parque?: Parque; banco?: Banco }) {
  return tandasSimuladas({
    catalogos: catalogosDe({
      parques: parque ? [...parques, parque] : parques,
      bancos: banco ? [...bancos, banco] : bancos,
      nucleos,
    }),
  })
}

const parque = (cambios: Partial<Parque> = {}): Parque => ({
  id: 'parque-nuevo',
  nombre: 'Parque Nuevo',
  ubicacion: 'Predio nuevo',
  capacidad_max: 10,
  nucleos_activos: 0,
  activo: true,
  ...cambios,
})
const banco = (cambios: Partial<Banco> = {}): Banco => ({
  id: 'banco-chico',
  identificador: 'B-09',
  capacidad_max: 50,
  reinas_en_banco: 0,
  activo: true,
  ...cambios,
})

describe('reparto parejo entre núcleos (operaciones.py del backend)', () => {
  const vacios = Array.from({ length: 60 }, (_, i) => ({
    id: `n${i}`,
    fila: Math.floor(i / 10) + 1,
    posicion: (i % 10) + 1,
    ocupadas: 0,
  }))

  it('120 celdas en 60 núcleos vacíos son 2 por núcleo, en orden de fila y posición', () => {
    const reparto = repartir(vacios, 120)
    expect(reparto).toHaveLength(60)
    expect(reparto.every((r) => r.celdas === 2)).toBe(true)
    expect(reparto[0].nucleo).toMatchObject({ fila: 1, posicion: 1 })
  })

  it('los más libres se llenan primero y a igual carga va el de menor fila y posición', () => {
    const tres = [
      { id: 'a', fila: 1, posicion: 1, ocupadas: 5 },
      { id: 'b', fila: 1, posicion: 2, ocupadas: 0 },
      { id: 'c', fila: 2, posicion: 1, ocupadas: 0 },
    ]
    // b y c llegan a 5 como a; la celda 11 desempata por fila y posición.
    expect(repartir(tres, 7).map((r) => [r.nucleo.id, r.celdas])).toEqual([
      ['b', 4],
      ['c', 3],
    ])
    expect(repartir(tres, 11).map((r) => [r.nucleo.id, r.celdas])).toEqual([
      ['a', 1],
      ['b', 5],
      ['c', 5],
    ])
    expect(repartir(tres, 1).map((r) => r.nucleo.id)).toEqual(['b'])
  })

  it('sin núcleos no hay reparto', () => {
    expect(() => repartir([], 3)).toThrow()
  })
})

describe('operaciones por lote simuladas (mismas reglas que el backend)', () => {
  it('descartar pasa trasladadas a descartadas, sin núcleo', async () => {
    const api = tandasSimuladas()
    const r = await api.operar(RECIEN.id, {
      accion: 'descartar',
      cantidad: 10,
      fecha: HOY,
    })

    expect(r.tanda.celdas_por_estado).toMatchObject({
      trasladada: 124,
      descartada: 11,
    })
    expect((await api.obtener(RECIEN.id)).nucleos).toEqual([])
  })

  it('no se pide más de lo que hay: cantidad_excedida con cuántas hay', async () => {
    const api = tandasSimuladas()
    await expect(
      api.operar(RECIEN.id, { accion: 'descartar', cantidad: 200, fecha: HOY }),
    ).rejects.toMatchObject(
      conflicto('cantidad_excedida', {
        pedidas: 200,
        disponibles: 134,
        estado: 'trasladada',
      }),
    )
    // Todo o nada: no se tocó ninguna celda.
    expect((await api.obtener(RECIEN.id)).celdas_por_estado.trasladada).toBe(
      134,
    )
  })

  it('las fechas no son futuras ni anteriores al traslarve', async () => {
    const api = tandasSimuladas()
    await expect(
      api.operar(RECIEN.id, {
        accion: 'descartar',
        cantidad: 1,
        fecha: '2026-09-01',
      }),
    ).rejects.toMatchObject({
      status: 422,
      codigo: 'fecha_anterior',
      detalles: { minima: RECIEN.fecha_traslarve },
    })
    await expect(
      api.operar(RECIEN.id, {
        accion: 'descartar',
        cantidad: 1,
        fecha: '2999-01-01',
      }),
    ).rejects.toMatchObject({ status: 422, codigo: 'validacion' })
    await expect(
      api.operar(RECIEN.id, { accion: 'descartar', cantidad: 0, fecha: HOY }),
    ).rejects.toMatchObject({ status: 422, codigo: 'validacion' })
  })

  it('introducir reparte parejo entre los núcleos activos del parque y devuelve el reparto', async () => {
    const api = tandasSimuladas()
    const r = await api.operar(RECIEN.id, {
      accion: 'introducir',
      cantidad: 120,
      fecha: HOY,
      parque_id: LA_LOMA.id,
    })

    // La Loma tiene 15 núcleos libres: 8 en cada uno.
    expect(r.reparto).toHaveLength(15)
    expect(r.reparto?.every((n) => n.celdas === 8)).toBe(true)
    expect(r.tanda.celdas_por_estado).toMatchObject({
      trasladada: 14,
      introducida: 120,
    })
    const detalle = await api.obtener(RECIEN.id)
    expect(detalle.nucleos).toHaveLength(15)
    expect(detalle.nucleos.every((n) => n.parque_id === LA_LOMA.id)).toBe(true)
  })

  it('introducir llena primero los núcleos menos ocupados', async () => {
    const api = tandasSimuladas()
    // Monte Chico tiene 9 núcleos con 400 celdas: 4 con 45 y 5 con 44.
    const r = await api.operar(RECIEN.id, {
      accion: 'introducir',
      cantidad: 5,
      fecha: HOY,
      parque_id: MONTE_CHICO.id,
    })
    const ocupados = (await api.obtener(EN_PARQUE.id)).nucleos
    const conMenos = ocupados.filter((n) => n.celdas === 44)
    expect(r.reparto?.map((n) => n.nucleo_id).sort()).toEqual(
      conMenos.map((n) => n.nucleo_id).sort(),
    )
  })

  it('introducir pide un parque activo, que exista y con núcleos', async () => {
    const op = {
      accion: 'introducir' as const,
      cantidad: 5,
      fecha: HOY,
      parque_id: 'parque-nuevo',
    }
    await expect(
      conCatalogos({ parque: parque() }).operar(RECIEN.id, op),
    ).rejects.toMatchObject(conflicto('parque_sin_nucleos'))
    await expect(
      conCatalogos({ parque: parque({ activo: false }) }).operar(RECIEN.id, op),
    ).rejects.toMatchObject(conflicto('parque_inactivo'))
    await expect(tandasSimuladas().operar(RECIEN.id, op)).rejects.toMatchObject(
      { status: 404, codigo: 'parque_no_encontrado' },
    )
  })

  it('cosechar enjaula las cosechadas y descarta el resto, una sola vez', async () => {
    const api = tandasSimuladas()
    const r = await api.operar(EN_PARQUE.id, {
      accion: 'cosechar',
      cantidad: 95,
      fecha: HOY,
    })

    expect(r.descartadas_en_cosecha).toBe(305)
    expect(r.tanda.celdas_por_estado).toEqual({
      enjaulada: 95,
      descartada: 310,
    })
    // Los núcleos quedan libres.
    expect((await api.obtener(EN_PARQUE.id)).nucleos).toEqual([])
    await expect(
      api.operar(EN_PARQUE.id, { accion: 'cosechar', cantidad: 1, fecha: HOY }),
    ).rejects.toMatchObject(conflicto('tanda_cosechada'))
  })

  it('una tanda cosechada no admite más introducciones', async () => {
    const api = tandasSimuladas()
    await api.operar(RECIEN.id, {
      accion: 'introducir',
      cantidad: 10,
      fecha: HOY,
      parque_id: LA_LOMA.id,
    })
    // Una cosecha de 0: se perdió todo, pero cuenta como cosecha.
    await api.operar(RECIEN.id, { accion: 'cosechar', cantidad: 0, fecha: HOY })
    await expect(
      api.operar(RECIEN.id, {
        accion: 'introducir',
        cantidad: 1,
        fecha: HOY,
        parque_id: LA_LOMA.id,
      }),
    ).rejects.toMatchObject(conflicto('transicion_invalida'))
  })

  it('no se cosecha sin celdas en el parque ni antes de la última introducción', async () => {
    const api = tandasSimuladas()
    await expect(
      api.operar(RECIEN.id, { accion: 'cosechar', cantidad: 1, fecha: HOY }),
    ).rejects.toMatchObject(conflicto('transicion_invalida'))
    await expect(
      api.operar(EN_PARQUE.id, {
        accion: 'cosechar',
        cantidad: 1,
        fecha: '2026-09-20',
      }),
    ).rejects.toMatchObject({
      status: 422,
      codigo: 'fecha_anterior',
      detalles: { minima: '2026-09-27' },
    })
    await expect(
      api.operar(EN_PARQUE.id, {
        accion: 'cosechar',
        cantidad: 401,
        fecha: HOY,
      }),
    ).rejects.toMatchObject(conflicto('cantidad_excedida'))
  })

  it('pasar a banco mueve cosechadas sin banco y controla la capacidad', async () => {
    const api = conCatalogos({ banco: banco() })
    await api.operar(EN_PARQUE.id, {
      accion: 'cosechar',
      cantidad: 95,
      fecha: HOY,
    })

    await expect(
      api.operar(EN_PARQUE.id, {
        accion: 'pasar_a_banco',
        cantidad: 96,
        banco_id: B01.id,
      }),
    ).rejects.toMatchObject(
      conflicto('cantidad_excedida', { estado: 'enjaulada sin banco' }),
    )
    await expect(
      api.operar(EN_PARQUE.id, {
        accion: 'pasar_a_banco',
        cantidad: 60,
        banco_id: 'banco-chico',
      }),
    ).rejects.toMatchObject(
      conflicto('banco_lleno', { caben: 50, capacidad_max: 50 }),
    )

    await api.operar(EN_PARQUE.id, {
      accion: 'pasar_a_banco',
      cantidad: 50,
      banco_id: 'banco-chico',
    })
    await api.operar(EN_PARQUE.id, {
      accion: 'pasar_a_banco',
      cantidad: 30,
      banco_id: B01.id,
    })
    const detalle = await api.obtener(EN_PARQUE.id)
    expect(detalle.bancos).toEqual([
      { banco_id: B01.id, identificador: 'B-01', reinas: 30 },
      { banco_id: 'banco-chico', identificador: 'B-09', reinas: 50 },
    ])
    expect(resumenDe(detalle).sinBanco).toBe(15)
    // El banco chico ya está lleno.
    await expect(
      api.operar(EN_PARQUE.id, {
        accion: 'pasar_a_banco',
        cantidad: 1,
        banco_id: 'banco-chico',
      }),
    ).rejects.toMatchObject(conflicto('banco_lleno', { caben: 0 }))
  })

  it('un banco dado de baja o inexistente no recibe reinas', async () => {
    const api = conCatalogos({ banco: banco({ activo: false }) })
    await api.operar(EN_PARQUE.id, {
      accion: 'cosechar',
      cantidad: 10,
      fecha: HOY,
    })
    const op = { accion: 'pasar_a_banco' as const, cantidad: 1 }
    await expect(
      api.operar(EN_PARQUE.id, { ...op, banco_id: 'banco-chico' }),
    ).rejects.toMatchObject(conflicto('banco_inactivo'))
    await expect(
      api.operar(EN_PARQUE.id, { ...op, banco_id: 'no-existe' }),
    ).rejects.toMatchObject({ status: 404, codigo: 'banco_no_encontrado' })
  })

  it('con la misma Idempotency-Key, un reintento no mueve celdas dos veces', async () => {
    const api = tandasSimuladas()
    const op = { accion: 'descartar' as const, cantidad: 4, fecha: HOY }
    const primera = await api.operar(RECIEN.id, op, 'clave')
    const repetida = await api.operar(RECIEN.id, op, 'clave')

    expect(repetida).toBe(primera)
    expect((await api.obtener(RECIEN.id)).celdas_por_estado.trasladada).toBe(
      130,
    )
  })

  it('una tanda que no existe es 404', async () => {
    await expect(tandasSimuladas().obtener('no-existe')).rejects.toMatchObject({
      status: 404,
      codigo: 'tanda_no_encontrada',
    })
  })

  it('el detalle cuenta dónde están: bancos de la cosechada, núcleos de la que está en el parque', async () => {
    const api = tandasSimuladas()
    const cosechada = await api.obtener(COSECHADA.id)
    expect(cosechada.nucleos).toEqual([])
    expect(cosechada.bancos.map((b) => [b.identificador, b.reinas])).toEqual([
      ['B-01', 110],
      ['B-02', 110],
    ])
    const enParque = await api.obtener(EN_PARQUE.id)
    expect(enParque.nucleos.reduce((t, n) => t + n.celdas, 0)).toBe(400)
    expect(enParque.bancos).toEqual([])
  })

  it('lista de a una página con cursor', async () => {
    const api = tandasSimuladas({ tandas: [], celdas: [] })
    for (let i = 0; i < LIMITE_TANDAS + 3; i++)
      await api.crear({
        raza_id: razas[0].id,
        material_id: materiales[0].id,
        fecha_traslarve: '2026-10-20',
        cuadros: 1,
      })

    const primera = await api.listar()
    expect(primera.items).toHaveLength(LIMITE_TANDAS)
    expect(primera.siguiente).not.toBeNull()
    const segunda = await api.listar({}, primera.siguiente ?? undefined)
    expect(segunda.items).toHaveLength(3)
    expect(segunda.siguiente).toBeNull()
    const ids = new Set([...primera.items, ...segunda.items].map((t) => t.id))
    expect(ids.size).toBe(LIMITE_TANDAS + 3)
  })
})

describe('reglas de la pantalla de operaciones', () => {
  const detalle = (cambios: Partial<TandaDetalle> = {}): TandaDetalle => ({
    ...RECIEN,
    nucleos: [],
    bancos: [],
    ...cambios,
  })
  const contexto = (tanda = detalle()) => ({ tanda, bancos, hoy: HOY })

  it('ofrece solo las operaciones que tienen sentido', () => {
    expect(accionesPosibles(resumenDe(detalle()))).toEqual([
      'descartar',
      'introducir',
    ])
    const enParque = detalle({
      celdas_por_estado: { trasladada: 10, introducida: 100 },
    })
    expect(accionesPosibles(resumenDe(enParque))).toEqual([
      'descartar',
      'introducir',
      'cosechar',
    ])
    // Cosechada: no se introduce más; quedan reinas sin banco.
    const cosechada = detalle({
      celdas_por_estado: { trasladada: 5, enjaulada: 90, descartada: 10 },
      bancos: [{ banco_id: B01.id, identificador: 'B-01', reinas: 60 }],
    })
    expect(resumenDe(cosechada)).toMatchObject({
      sinBanco: 30,
      cosechada: true,
    })
    expect(accionesPosibles(resumenDe(cosechada))).toEqual([
      'descartar',
      'pasar_a_banco',
    ])
  })

  it('valida antes de mandar: entero, hasta lo que hay, fecha y destino', () => {
    const ctx = contexto()
    expect(
      validarOperacion('descartar', { cantidad: '10', fecha: HOY }, ctx),
    ).toEqual({})
    expect(
      validarOperacion('descartar', { cantidad: '200', fecha: HOY }, ctx)
        .cantidad,
    ).toMatch(/134/)
    expect(
      validarOperacion('descartar', { cantidad: '2,5', fecha: HOY }, ctx),
    ).toHaveProperty('cantidad')
    expect(
      validarOperacion('descartar', { cantidad: '1', fecha: '2999-01-01' }, ctx)
        .fecha,
    ).toMatch(/futura/)
    expect(
      validarOperacion('descartar', { cantidad: '1', fecha: '2026-09-01' }, ctx)
        .fecha,
    ).toMatch(/29\/09\/2026/)
    expect(
      validarOperacion('introducir', { cantidad: '1', fecha: HOY }, ctx),
    ).toHaveProperty('parque_id')
  })

  it('pasar a banco no deja pasar la capacidad libre del banco', () => {
    const ctx = contexto(detalle({ celdas_por_estado: { enjaulada: 200 } }))
    // B-01: 276 de capacidad con 110 reinas, caben 166.
    expect(
      validarOperacion(
        'pasar_a_banco',
        { cantidad: '170', banco_id: B01.id },
        ctx,
      ).cantidad,
    ).toBe('En el banco B-01 caben 166 reinas más.')
    expect(
      validarOperacion(
        'pasar_a_banco',
        { cantidad: '166', banco_id: B01.id },
        ctx,
      ),
    ).toEqual({})
  })

  it('traduce los errores del backend a lenguaje claro, por código', () => {
    const de = (codigo: string, detalles = {}) =>
      new ApiError({ status: 409, codigo, mensaje: 'x', detalles })
    expect(
      errorDeOperacion(de('banco_lleno', { caben: 12 }), 'pasar_a_banco'),
    ).toEqual({
      campo: 'cantidad',
      mensaje: 'En el banco caben 12 reinas más.',
    })
    expect(
      errorDeOperacion(
        de('cantidad_excedida', { disponibles: 7, estado: 'introducida' }),
        'cosechar',
      ).mensaje,
    ).toMatch(/^Hay 7 en el parque/)
    expect(
      errorDeOperacion(
        de('fecha_anterior', { minima: '2026-09-27' }),
        'cosechar',
      ),
    ).toEqual({
      campo: 'fecha',
      mensaje:
        'La fecha no puede ser anterior a la última introducción (27/09/2026).',
    })
    expect(errorDeOperacion(de('tanda_cosechada'), 'cosechar').mensaje).toMatch(
      /una sola vez/,
    )
    expect(
      errorDeOperacion(de('parque_sin_nucleos'), 'introducir'),
    ).toMatchObject({ campo: 'parque_id' })
    // Ningún mensaje muestra el código.
    for (const codigo of [
      'cantidad_excedida',
      'banco_lleno',
      'tanda_cosechada',
      'transicion_invalida',
      'parque_sin_nucleos',
      'parque_inactivo',
      'banco_inactivo',
      'fecha_anterior',
    ])
      expect(errorDeOperacion(de(codigo), 'introducir').mensaje).not.toContain(
        codigo,
      )
  })

  it('cuenta el resultado con lo que devolvió el sistema', () => {
    const r = (cambios: Partial<OperacionRealizada>): OperacionRealizada => ({
      accion: 'cosechar',
      cantidad: 95,
      tanda: RECIEN,
      ...cambios,
    })
    expect(resumenDeOperacion(r({ descartadas_en_cosecha: 25 }))).toBe(
      'Se cosecharon 95 reinas. Las otras 25 celdas del parque quedaron descartadas.',
    )
    expect(
      resumenDeOperacion(
        r({
          accion: 'introducir',
          cantidad: 120,
          reparto: Array.from({ length: 15 }, (_, i) => ({
            nucleo_id: `n${i}`,
            fila: 1,
            posicion: i + 1,
            celdas: 8,
          })),
        }),
        { parque: 'Parque La Loma' },
      ),
    ).toBe(
      'Se introdujeron 120 celdas en Parque La Loma, repartidas en 15 núcleos.',
    )
    expect(
      resumenDeOperacion(r({ accion: 'pasar_a_banco', cantidad: 1 }), {
        banco: 'B-01',
      }),
    ).toBe('Pasó 1 reina al banco B-01.')
  })
})
