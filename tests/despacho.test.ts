import { describe, expect, it } from 'vitest'
import { ApiError } from '../src/api/client'
import { pedidosSimulados } from '../src/api/pedidos'
import { DATOS_SIMULADOS } from '../src/datos/simulados'
import { calcularDisponibilidad } from '../src/lib/disponibilidad'
import {
  SIN_BANCO,
  aDespacho,
  asignadas,
  erroresDelDespacho,
  existenciasPorRaza,
  salidaVacia,
  validarDespacho,
  type Salida,
  type Salidas,
} from '../src/modulos/ventas/despacho'
import type { Pedido } from '../src/tipos/dominio'

const [, RESERVADO] = DATOS_SIMULADOS.pedidos
const [B01, B02] = DATOS_SIMULADOS.bancos
const [CARNIOLA, BUCKFAST] = DATOS_SIMULADOS.razas

describe('disponibilidad (repositorio_disponibilidad del backend)', () => {
  const semilla = {
    razas: DATOS_SIMULADOS.razas,
    tandas: DATOS_SIMULADOS.tandas,
    celdas: DATOS_SIMULADOS.celdas,
    reservas: DATOS_SIMULADOS.reservas,
    bancos: DATOS_SIMULADOS.bancos,
  }

  it('enjauladas, reservadas y disponible por raza, con su ubicación', () => {
    const carniola = calcularDisponibilidad(semilla, CARNIOLA.id)
    expect(carniola).toEqual([
      {
        raza_id: CARNIOLA.id,
        raza: 'Carniola',
        enjauladas: 240,
        reservadas: 50,
        disponible: 190,
        bancos: [
          { banco_id: B01.id, identificador: 'B-01', reinas: 120 },
          { banco_id: B02.id, identificador: 'B-02', reinas: 120 },
        ],
      },
    ])
  })

  it('una raza activa sin reinas aparece; una dada de baja sin reinas, no', () => {
    expect(
      calcularDisponibilidad(semilla).map((d) => [d.raza, d.enjauladas]),
    ).toEqual([
      ['Buckfast', 0],
      ['Carniola', 240],
      ['Italiana', 0],
    ])
    const sinBuckfast = {
      ...semilla,
      razas: semilla.razas.map((r) =>
        r.id === BUCKFAST.id ? { ...r, activo: false } : r,
      ),
    }
    expect(
      calcularDisponibilidad(sinBuckfast).map((d) => d.raza),
    ).not.toContain('Buckfast')
  })

  it('las enjauladas sin banco van al final, con banco_id null', () => {
    const [primera, ...resto] = DATOS_SIMULADOS.celdas.filter(
      (c) => c.estado === 'enjaulada',
    )
    const conUnaSuelta = {
      ...semilla,
      celdas: [{ ...primera, banco_id: null }, ...resto],
    }
    const [carniola] = calcularDisponibilidad(conUnaSuelta, CARNIOLA.id)
    expect(carniola.bancos.at(-1)).toEqual({
      banco_id: null,
      identificador: null,
      reinas: 1,
    })
  })

  it('la simulación la recalcula al entregar', async () => {
    const api = pedidosSimulados()
    await api.entregar(RESERVADO.id, {
      lineas: [
        {
          pedido_item_id: RESERVADO.items[0].id,
          bancos: [
            { banco_id: B01.id, cantidad: 30 },
            { banco_id: B02.id, cantidad: 20 },
          ],
        },
      ],
    })
    const [carniola] = await api.disponibilidad(CARNIOLA.id)
    // La reserva se consumió: salen de las enjauladas y de las reservadas.
    expect(carniola).toMatchObject({
      enjauladas: 190,
      reservadas: 0,
      disponible: 190,
    })
    expect(carniola.bancos.map((b) => b.reinas)).toEqual([90, 100])
  })
})

describe('formulario de despacho', () => {
  const existencias = existenciasPorRaza([
    {
      raza_id: CARNIOLA.id,
      raza: 'Carniola',
      enjauladas: 45,
      reservadas: 0,
      disponible: 45,
      bancos: [
        { banco_id: B01.id, identificador: 'B-01', reinas: 30 },
        { banco_id: B02.id, identificador: 'B-02', reinas: 0 },
        { banco_id: null, identificador: null, reinas: 15 },
      ],
    },
  ])
  const salida = (banco: string, cantidad: string): Salida => ({
    ...salidaVacia(),
    banco,
    cantidad,
  })
  // Dos líneas de Carniola: compiten por los mismos bancos.
  const pedido: Pedido = {
    ...RESERVADO,
    items: [
      { ...RESERVADO.items[0], id: 'l1', cantidad: 20 },
      { ...RESERVADO.items[0], id: 'l2', numero_linea: 2, cantidad: 15 },
    ],
  }

  it('ofrece solo los bancos con reinas; "sin banco" con su propio valor', () => {
    expect(existencias.get(CARNIOLA.id)).toEqual([
      { banco: B01.id, nombre: 'B-01', reinas: 30 },
      { banco: SIN_BANCO, nombre: 'Sin banco', reinas: 15 },
    ])
  })

  it('cuenta lo asignado ignorando lo que no es un entero', () => {
    expect(asignadas([salida(B01.id, '8'), salida(B02.id, '4')])).toBe(12)
    expect(asignadas([salida(B01.id, '8'), salida(B02.id, '1,5')])).toBe(8)
  })

  it('un despacho que cubre cada línea dentro de los topes pasa', () => {
    const salidas: Salidas = {
      l1: [salida(B01.id, '15'), salida(SIN_BANCO, '5')],
      l2: [salida(B01.id, '15')],
    }
    expect(validarDespacho(pedido, salidas, existencias)).toEqual({})
  })

  it('marca lo que falta o sobra en la línea', () => {
    const salidas: Salidas = {
      l1: [salida(B01.id, '12')],
      l2: [salida(B01.id, '16')],
    }
    expect(validarDespacho(pedido, salidas, existencias)).toEqual({
      l1: 'Faltan 8 por asignar.',
      l2: 'Sobran 1: la línea lleva 15.',
    })
  })

  it('el tope del banco suma todas las líneas de la raza', () => {
    // 20 + 15 = 35 de B-01, que tiene 30.
    const salidas: Salidas = {
      l1: [salida(B01.id, '20')],
      l2: [salida(B01.id, '15')],
    }
    expect(validarDespacho(pedido, salidas, existencias)).toEqual({
      'l1.0.cantidad': 'B-01 tiene 30 de esta raza.',
      'l2.0.cantidad': 'B-01 tiene 30 de esta raza.',
    })
  })

  it('pide banco y cantidad, y no repite el banco en la línea', () => {
    const salidas: Salidas = {
      l1: [salida('', '10'), salida(B01.id, 'x')],
      l2: [salida(B01.id, '5'), salida(B01.id, '10')],
    }
    expect(validarDespacho(pedido, salidas, existencias)).toMatchObject({
      'l1.0.banco': 'Elegí el banco.',
      'l1.1.cantidad': 'La cantidad es un número entero.',
      'l2.1.banco': 'Ese banco ya está en esta línea.',
    })
  })

  it('arma el cuerpo con banco_id null para "sin banco"', () => {
    const salidas: Salidas = {
      l1: [salida(B01.id, ' 15 '), salida(SIN_BANCO, '5')],
      l2: [salida(B01.id, '15')],
    }
    expect(aDespacho(pedido, salidas, '')).toEqual({
      fecha: null,
      lineas: [
        {
          pedido_item_id: 'l1',
          bancos: [
            { banco_id: B01.id, cantidad: 15 },
            { banco_id: null, cantidad: 5 },
          ],
        },
        { pedido_item_id: 'l2', bancos: [{ banco_id: B01.id, cantidad: 15 }] },
      ],
    })
  })

  it('el 409 de un banco sin reinas va en esa fila de esa línea', () => {
    const salidas: Salidas = {
      l1: [salida(B01.id, '15'), salida(SIN_BANCO, '5')],
      l2: [salida(SIN_BANCO, '15')],
    }
    const error = new ApiError({
      status: 409,
      codigo: 'stock_insuficiente_en_banco',
      mensaje: 'El banco no tiene tantas reinas.',
      detalles: { pedido_item_id: 'l1', banco_id: null, pedidas: 5, hay: 2 },
    })
    expect(erroresDelDespacho(error, salidas)).toEqual({
      'l1.1.cantidad': 'El banco no tiene tantas reinas. Hay 2.',
    })
    const otro = new ApiError({
      status: 409,
      codigo: 'transicion_invalida',
      mensaje: 'x',
    })
    expect(erroresDelDespacho(otro, salidas)).toEqual({})
  })
})
